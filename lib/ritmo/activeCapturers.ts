import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveCapturer = {
  name: string;
  role: "player" | "caddie" | "witness";
  captureCount: number;
  lastCaptureAt: string;
};

type AuditRow = {
  entry_id: string | null;
  actor_role: string | null;
  actor_entry_id: string | null;
  actor_caddie_id: string | null;
  actor_label: string | null;
  created_at: string | null;
};

const CAPTURE_ROLES = new Set(["player", "caddie", "witness"]);

function actorKey(row: AuditRow): string | null {
  if (row.actor_caddie_id) return `caddie:${row.actor_caddie_id}`;
  if (row.actor_entry_id) return `player:${row.actor_entry_id}`;
  const role = String(row.actor_role ?? "").trim().toLowerCase();
  const label = String(row.actor_label ?? "").trim();
  if (role && label && CAPTURE_ROLES.has(role)) return `${role}:${label}`;
  return null;
}

function roleFromKey(key: string): ActiveCapturer["role"] {
  if (key.startsWith("caddie:")) return "caddie";
  if (key.startsWith("witness:")) return "witness";
  return "player";
}

/**
 * Quién está capturando en vivo en la ronda (bitácora), no asignación Telegram.
 * Devuelve hasta 2 personas con más acciones de captura en el grupo.
 */
export async function loadActiveCapturersByGroup(
  admin: SupabaseClient,
  roundId: string,
  entryIdsByGroup: Map<string, string[]>
): Promise<Map<string, ActiveCapturer[]>> {
  const out = new Map<string, ActiveCapturer[]>();
  const allEntryIds = Array.from(
    new Set(Array.from(entryIdsByGroup.values()).flat())
  );
  if (allEntryIds.length === 0) return out;

  const entryToGroup = new Map<string, string>();
  for (const [gid, eids] of entryIdsByGroup) {
    for (const eid of eids) entryToGroup.set(eid, gid);
  }

  const { data } = await admin
    .from("hole_score_audit")
    .select(
      "entry_id, actor_role, actor_entry_id, actor_caddie_id, actor_label, created_at"
    )
    .eq("round_id", roundId)
    .in("entry_id", allEntryIds)
    .in("actor_role", ["player", "caddie", "witness"])
    .order("created_at", { ascending: false })
    .limit(5000);

  const nameByEntry = new Map<string, string>();
  const nameByCaddie = new Map<string, string>();
  const actorIdsNeeded = { entries: new Set<string>(), caddies: new Set<string>() };
  for (const row of (data ?? []) as AuditRow[]) {
    if (row.actor_entry_id) actorIdsNeeded.entries.add(row.actor_entry_id);
    if (row.actor_caddie_id) actorIdsNeeded.caddies.add(row.actor_caddie_id);
  }
  if (actorIdsNeeded.entries.size > 0) {
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("id, players ( first_name, last_name )")
      .in("id", Array.from(actorIdsNeeded.entries));
    for (const e of entries ?? []) {
      const p = Array.isArray(e.players) ? e.players[0] : e.players;
      const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
      if (name) nameByEntry.set(String(e.id), name);
    }
  }
  if (actorIdsNeeded.caddies.size > 0) {
    const { data: caddies } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .in("id", Array.from(actorIdsNeeded.caddies));
    for (const c of caddies ?? []) {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      if (name) nameByCaddie.set(String(c.id), name);
    }
  }

  const statsByGroup = new Map<
    string,
    Map<
      string,
      { role: ActiveCapturer["role"]; name: string; count: number; lastAt: string }
    >
  >();

  for (const row of (data ?? []) as AuditRow[]) {
    const eid = row.entry_id;
    if (!eid) continue;
    const gid = entryToGroup.get(eid);
    if (!gid) continue;
    const key = actorKey(row);
    if (!key) continue;
    const role = roleFromKey(key);
    let name = String(row.actor_label ?? "").trim();
    if (row.actor_caddie_id) {
      name = nameByCaddie.get(row.actor_caddie_id) ?? name;
    } else if (row.actor_entry_id) {
      name = nameByEntry.get(row.actor_entry_id) ?? name;
    }
    if (!name) continue;
    const ts = row.created_at ?? "";
    const groupStats = statsByGroup.get(gid) ?? new Map();
    const prev = groupStats.get(key);
    if (prev) {
      prev.count += 1;
      if (ts > prev.lastAt) prev.lastAt = ts;
    } else {
      groupStats.set(key, { role, name, count: 1, lastAt: ts });
    }
    statsByGroup.set(gid, groupStats);
  }

  for (const [gid, stats] of statsByGroup) {
    const ranked = Array.from(stats.values())
      .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
      .slice(0, 2)
      .map((s) => ({
        name: s.name,
        role: s.role,
        captureCount: s.count,
        lastCaptureAt: s.lastAt,
      }));
    out.set(gid, ranked);
  }

  return out;
}

export function capturerRoleLabel(role: ActiveCapturer["role"]): string {
  if (role === "caddie") return "caddie";
  if (role === "witness") return "testigo";
  return "jugador";
}

/** Orden para ruta de marshal: ritmo del campo de atrás hacia adelante. */
export function compareGroupsForMarshalRoute(a: {
  kind: string;
  expectedHole: number | null;
  holesPlayed: number;
  holesBehind: number;
  priority: number;
  minutesSinceLastCapture: number | null;
  teeTime: string | null;
  number: number;
  tournamentName: string;
}): number {
  const paceA = marshalPaceSortKey(a);
  const paceB = marshalPaceSortKey(b);
  if (paceB !== paceA) return paceB - paceA;
  if (b.holesBehind !== a.holesBehind) return b.holesBehind - a.holesBehind;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const silentA = a.minutesSinceLastCapture ?? 0;
  const silentB = b.minutesSinceLastCapture ?? 0;
  if (silentB !== silentA) return silentB - silentA;
  const tn = a.tournamentName.localeCompare(b.tournamentName, "es");
  if (tn !== 0) return tn;
  const teeA = a.teeTime ?? "";
  const teeB = b.teeTime ?? "";
  if (teeA !== teeB) return teeA.localeCompare(teeB);
  return a.number - b.number;
}

function marshalPaceSortKey(g: {
  kind: string;
  expectedHole: number | null;
  holesPlayed: number;
}): number {
  if (g.kind === "terminado" || g.holesPlayed >= 18) return -999;
  if (g.expectedHole != null) return g.expectedHole;
  return 0;
}
