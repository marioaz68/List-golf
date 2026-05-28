import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GroupCapturePayload,
  GroupCapturePlayer,
  HoleNumber,
  HoleScores,
} from "./types";
import { ensureGroupWitnesses } from "./witnesses";
import { loadPrivateScoresForGroup } from "./privateScores";

export const HOLES_FRONT: HoleNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const HOLES_BACK: HoleNumber[] = [10, 11, 12, 13, 14, 15, 16, 17, 18];
export const ALL_HOLES: HoleNumber[] = [...HOLES_FRONT, ...HOLES_BACK];

export const PAR_BY_HOLE: Record<HoleNumber, number> = {
  1: 4,
  2: 4,
  3: 3,
  4: 5,
  5: 4,
  6: 4,
  7: 4,
  8: 3,
  9: 5,
  10: 4,
  11: 5,
  12: 3,
  13: 4,
  14: 5,
  15: 4,
  16: 4,
  17: 3,
  18: 4,
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createEmptyScores(): HoleScores {
  const s = {} as HoleScores;
  for (const h of ALL_HOLES) s[h] = null;
  return s;
}

export function buildName(firstName: unknown, lastName: unknown) {
  return `${safeString(firstName)} ${safeString(lastName)}`.trim();
}

export function buildInitials(fullName: string, initialsFromDb?: string | null) {
  if (initialsFromDb?.trim()) return initialsFromDb.trim().toUpperCase();
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
  }
  if (parts.length === 2) {
    return ((parts[0][0] ?? "") + (parts[1].slice(0, 2) ?? "")).toUpperCase();
  }
  return parts[0]?.slice(0, 3).toUpperCase() ?? "---";
}

function normalizeHoleNumber(row: {
  hole_no: number | null;
  hole_number: number | null;
}): HoleNumber | null {
  const raw = row.hole_no ?? row.hole_number;
  if (!raw || raw < 1 || raw > 18) return null;
  return raw as HoleNumber;
}

export function getScoreClass(score: number | null, par: number) {
  if (score === null) return "";
  const diff = score - par;
  if (diff <= -1) return "rounded-full border-2 border-red-600";
  if (diff === 1) return "border-2 border-black";
  if (diff >= 2) {
    return "border-2 border-black shadow-[inset_0_0_0_2px_white,inset_0_0_0_4px_black]";
  }
  return "";
}

export type LoadGroupCaptureOptions = {
  /** entry_id que viene en el link (?me=...) — habilita la fila privada del jugador. */
  meEntryId?: string | null;
  /** caddie_id (?caddie=...) — habilita filas privadas de sus jugadores asignados. */
  caddieId?: string | null;
};

export async function loadGroupCapture(
  supabase: SupabaseClient,
  groupId: string,
  options: LoadGroupCaptureOptions = {}
): Promise<GroupCapturePayload | null> {
  const gid = groupId.trim();
  if (!gid) return null;

  const { data: groupRow } = await supabase
    .from("pairing_groups")
    .select("id, round_id, group_no, starting_hole, tee_time")
    .eq("id", gid)
    .maybeSingle();

  const roundId = safeString(groupRow?.round_id);
  if (!roundId) return null;

  let tournamentId: string | null = null;
  let tournamentName: string | null = null;

  const { data: roundRow } = await supabase
    .from("rounds")
    .select("tournament_id, tournaments(name)")
    .eq("id", roundId)
    .maybeSingle();

  tournamentId = safeString(roundRow?.tournament_id) || null;
  const t = roundRow?.tournaments;
  const tRow = Array.isArray(t) ? t[0] : t;
  tournamentName =
    tRow && typeof tRow === "object" && "name" in tRow
      ? safeString((tRow as { name?: string }).name) || null
      : null;

  const { data: memberRows } = await supabase
    .from("pairing_group_members")
    .select("entry_id, position")
    .eq("group_id", gid)
    .order("position", { ascending: true });

  const entryIds = (memberRows ?? [])
    .map((row) => safeString(row.entry_id))
    .filter(Boolean);

  if (entryIds.length === 0) {
    return {
      groupId: gid,
      roundId,
      tournamentId,
      groupNo:
        typeof groupRow?.group_no === "number" ? groupRow.group_no : null,
      startingHole:
        typeof groupRow?.starting_hole === "number"
          ? groupRow.starting_hole
          : null,
      teeTime: safeString(groupRow?.tee_time) || null,
      tournamentName,
      players: [],
      witnesses: [],
      myEntryId: null,
      caddieForEntryIds: [],
    };
  }

  const { data: entryRows } = await supabase
    .from("tournament_entries")
    .select("id, player_id, category_id")
    .in("id", entryIds);

  const categoryByEntry = new Map<string, string | null>(
    (entryRows ?? []).map((row) => [
      safeString(row.id),
      safeString(row.category_id) || null,
    ])
  );

  const playerIds = (entryRows ?? [])
    .map((row) => safeString(row.player_id))
    .filter(Boolean);

  const { data: playerRows } = await supabase
    .from("players")
    .select("id, first_name, last_name, initials")
    .in("id", playerIds);

  const { data: scoreRows } = await supabase
    .from("hole_scores")
    .select(
      "entry_id, hole_no, hole_number, strokes, pending_witness"
    )
    .eq("round_id", roundId)
    .in("entry_id", entryIds);

  const entriesById = new Map(
    (entryRows ?? []).map((row) => [safeString(row.id), safeString(row.player_id)])
  );

  const playersById = new Map(
    (playerRows ?? []).map((row) => [
      safeString(row.id),
      {
        first_name: safeString(row.first_name),
        last_name: safeString(row.last_name),
        initials: typeof row.initials === "string" ? row.initials : null,
      },
    ])
  );

  const scoresByEntryId = new Map<string, HoleScores>();
  const pendingByEntryId = new Map<
    string,
    Partial<Record<HoleNumber, boolean>>
  >();
  for (const entryId of entryIds) {
    scoresByEntryId.set(entryId, createEmptyScores());
    pendingByEntryId.set(entryId, {});
  }

  for (const row of scoreRows ?? []) {
    const entryId = safeString(row.entry_id);
    const hole = normalizeHoleNumber({
      hole_no: typeof row.hole_no === "number" ? row.hole_no : null,
      hole_number: typeof row.hole_number === "number" ? row.hole_number : null,
    });
    if (!entryId || !hole) continue;
    const scores = scoresByEntryId.get(entryId);
    if (!scores) continue;
    scores[hole] = typeof row.strokes === "number" ? row.strokes : null;
    const r = row as { pending_witness?: boolean | null };
    if (r.pending_witness) {
      const pendingMap = pendingByEntryId.get(entryId);
      if (pendingMap) pendingMap[hole] = true;
    }
  }

  // Asignar / cargar testigos del grupo.
  const witnessRows = await ensureGroupWitnesses(supabase, gid);

  // Tarjetas privadas: cargamos todas y luego decidimos a quién las
  // mostramos. Cliente solo recibe las que le corresponden por su rol.
  const privateScoresByEntry = await loadPrivateScoresForGroup(
    supabase,
    gid,
    entryIds
  );

  // Identidad del visitante (me=entry_id o caddie=caddie_id).
  const meEntryIdRaw = String(options.meEntryId ?? "").trim();
  const meEntryId = entryIds.includes(meEntryIdRaw) ? meEntryIdRaw : null;

  const caddieIdRaw = String(options.caddieId ?? "").trim();
  let caddieForEntryIds: string[] = [];
  if (caddieIdRaw) {
    const { data: caddieAssigns } = await supabase
      .from("caddie_assignments")
      .select("entry_id, is_active, pairing_group_id, round_id")
      .eq("caddie_id", caddieIdRaw);
    const validAssigns = ((caddieAssigns ?? []) as Array<{
      entry_id: string | null;
      is_active: boolean | null;
      pairing_group_id: string | null;
      round_id: string | null;
    }>).filter((a) => {
      if (a.is_active === false) return false;
      if (a.pairing_group_id && a.pairing_group_id !== gid) return false;
      if (!a.pairing_group_id && a.round_id && a.round_id !== roundId) {
        return false;
      }
      return true;
    });
    const assignedEntryIds = new Set(
      validAssigns
        .map((a) => String(a.entry_id ?? "").trim())
        .filter(Boolean)
    );
    caddieForEntryIds = entryIds.filter((eid) => assignedEntryIds.has(eid));
  }

  const visibilityByEntry = new Set<string>();
  if (meEntryId) visibilityByEntry.add(meEntryId);
  for (const eid of caddieForEntryIds) visibilityByEntry.add(eid);

  const orderedMembers = [...(memberRows ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );

  const players: GroupCapturePlayer[] = [];
  for (const member of orderedMembers) {
    const entryId = safeString(member.entry_id);
    if (!entryId) continue;
    const playerId = entriesById.get(entryId);
    if (!playerId) continue;
    const player = playersById.get(playerId);
    if (!player) continue;
    const fullName = buildName(player.first_name, player.last_name) || "Jugador";
    const includePrivate = visibilityByEntry.has(entryId);
    players.push({
      entryId,
      playerId,
      name: fullName,
      initials: buildInitials(fullName, player.initials),
      scores: scoresByEntryId.get(entryId) ?? createEmptyScores(),
      pending: pendingByEntryId.get(entryId) ?? {},
      privateScores: includePrivate
        ? privateScoresByEntry[entryId] ?? createEmptyScores()
        : undefined,
      categoryId: categoryByEntry.get(entryId) ?? null,
    });
  }

  return {
    groupId: gid,
    roundId,
    tournamentId,
    groupNo: typeof groupRow?.group_no === "number" ? groupRow.group_no : null,
    startingHole:
      typeof groupRow?.starting_hole === "number" ? groupRow.starting_hole : null,
    teeTime: safeString(groupRow?.tee_time) || null,
    tournamentName,
    players,
    witnesses: witnessRows.map((w) => ({
      entryId: w.entryId,
      witnessEntryId: w.witnessEntryId,
    })),
    myEntryId: meEntryId,
    caddieForEntryIds,
  };
}
