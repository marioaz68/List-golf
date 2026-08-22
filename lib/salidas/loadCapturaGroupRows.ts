import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";
import { CONSOLATION_NOTES_PREFIX } from "@/lib/matchplay/consolationMatchPlay";

export type CapturaMemberRow = {
  id: string;
  position: number | null;
  playerNumber: number | null;
  playerName: string;
  telegramLinked: boolean;
  caddieName: string | null;
  caddieTelegramLinked: boolean;
};

export type CapturaCaddieRow = {
  id: string;
  name: string;
  telegramLinked: boolean;
  role: string | null;
};

export type CapturaGroupRow = {
  id: string;
  roundId: string;
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  notes: string | null;
  members: CapturaMemberRow[];
  caddies: CapturaCaddieRow[];
  captureUrl: string;
};

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return [first, last].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ") ||
    "(sin nombre)";
}

function caddieTelegramLinked(telegram: string | null | undefined): boolean {
  return /^\d+$/.test(String(telegram ?? "").trim());
}

type GroupRaw = {
  id: string;
  round_id: string;
  group_no: number | null;
  starting_hole: number | null;
  tee_time: string | null;
  notes: string | null;
};

type MemberRaw = {
  id: string;
  group_id: string;
  position: number | null;
  entry_id: string | null;
  tournament_entries:
    | {
        id: string | null;
        player_number: number | null;
        players:
          | {
              first_name: string | null;
              last_name: string | null;
              telegram_user_id?: string | null;
              telegram_chat_id?: string | null;
            }
          | null;
      }
    | null;
};

type CaddieAssignRow = {
  entry_id: string | null;
  caddie_id: string | null;
  is_active: boolean | null;
  role: string | null;
};

type CaddieMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  telegram?: string | null;
};

/** Carga filas de captura Telegram para uno o más `pairing_groups` del torneo. */
export async function loadCapturaGroupRows(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    groups: GroupRaw[];
    /** Rondas para resolver asignaciones de caddie (null = todas del torneo). */
    assignmentRoundIds?: string[];
  }
): Promise<CapturaGroupRow[]> {
  const groups = args.groups;
  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);
  const roundIds = Array.from(
    new Set(
      (args.assignmentRoundIds?.length
        ? args.assignmentRoundIds
        : groups.map((g) => g.round_id)
      ).filter(Boolean)
    )
  );

  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select(
      `
      id, group_id, position, entry_id,
      tournament_entries (
        id, player_number,
        players ( id, first_name, last_name, telegram_user_id, telegram_chat_id )
      )
    `
    )
    .in("group_id", groupIds)
    .order("position", { ascending: true });

  const members = (membersRaw ?? []) as unknown as MemberRaw[];

  let assignments: CaddieAssignRow[] = [];
  const roundFilter =
    roundIds.length > 0
      ? roundIds.map((id) => `round_id.eq.${id}`).join(",") + ",round_id.is.null"
      : "round_id.is.null";
  const { data: assignsRaw } = await admin
    .from("caddie_assignments")
    .select("entry_id, caddie_id, is_active, role")
    .eq("tournament_id", args.tournamentId)
    .or(roundFilter);
  assignments = ((assignsRaw ?? []) as CaddieAssignRow[]).filter(
    (a) => a.is_active !== false && a.entry_id
  );

  const caddieIds = Array.from(
    new Set(
      assignments
        .map((a) => a.caddie_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const caddieMap = new Map<string, CaddieMini>();
  if (caddieIds.length > 0) {
    const { data: caddiesRaw } = await admin
      .from("caddies")
      .select("id, first_name, last_name, telegram")
      .in("id", caddieIds);
    for (const c of (caddiesRaw ?? []) as CaddieMini[]) {
      caddieMap.set(c.id, c);
    }
  }

  const caddieByEntry = new Map<string, { name: string; linked: boolean }>();
  for (const a of assignments) {
    if (!a.entry_id || !a.caddie_id) continue;
    if (caddieByEntry.has(a.entry_id)) continue;
    const c = caddieMap.get(a.caddie_id);
    if (!c) continue;
    caddieByEntry.set(a.entry_id, {
      name: fullName(c.first_name, c.last_name),
      linked: caddieTelegramLinked(c.telegram),
    });
  }

  return groups.map((g) => {
    const gMembers = members.filter((m) => m.group_id === g.id);
    const memberRows: CapturaMemberRow[] = gMembers.map((m) => {
      const entry = Array.isArray(m.tournament_entries)
        ? m.tournament_entries[0]
        : m.tournament_entries;
      const player = entry?.players
        ? Array.isArray(entry.players)
          ? entry.players[0]
          : entry.players
        : null;
      const caddie = m.entry_id ? caddieByEntry.get(m.entry_id) ?? null : null;
      return {
        id: m.id,
        position: m.position,
        playerNumber: entry?.player_number ?? null,
        playerName: fullName(player?.first_name, player?.last_name),
        telegramLinked: Boolean(
          (player?.telegram_chat_id ?? player?.telegram_user_id ?? "")
            .toString()
            .trim()
        ),
        caddieName: caddie?.name ?? null,
        caddieTelegramLinked: caddie?.linked ?? false,
      };
    });

    const groupEntryIds = new Set(
      gMembers.map((m) => m.entry_id).filter((id): id is string => Boolean(id))
    );
    const gAssigns = assignments.filter(
      (a) => a.entry_id && groupEntryIds.has(a.entry_id)
    );
    const caddieRowsForGroup: CapturaCaddieRow[] = gAssigns
      .map((a): CapturaCaddieRow | null => {
        if (!a.caddie_id) return null;
        const c = caddieMap.get(a.caddie_id);
        if (!c) return null;
        return {
          id: c.id,
          name: fullName(c.first_name, c.last_name),
          telegramLinked: caddieTelegramLinked(c.telegram),
          role: a.role ?? null,
        };
      })
      .filter((x): x is CapturaCaddieRow => x !== null);

    const seen = new Set<string>();
    const uniqCaddies = caddieRowsForGroup.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const roundId = String(g.round_id);
    return {
      id: g.id,
      roundId,
      groupNo: g.group_no,
      startingHole: g.starting_hole,
      teeTime: g.tee_time,
      notes: g.notes ?? null,
      members: memberRows,
      caddies: uniqCaddies,
      captureUrl: buildGroupCaptureUrl({
        tournamentId: args.tournamentId,
        roundId,
        groupId: g.id,
      }),
    };
  });
}

/** Grupos CONSOLACIÓN MP del mismo día que no están en la ronda seleccionada. */
export async function loadSameDayConsolationMpGroups(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundDate: string | null;
    excludeRoundId: string;
  }
): Promise<GroupRaw[]> {
  const roundDate = String(args.roundDate ?? "").trim();
  if (!roundDate) return [];

  const { data: dateRounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", args.tournamentId)
    .eq("round_date", roundDate);

  const otherRoundIds = (dateRounds ?? [])
    .map((r) => String(r.id))
    .filter((id) => id && id !== args.excludeRoundId);
  if (otherRoundIds.length === 0) return [];

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no, starting_hole, tee_time, notes")
    .in("round_id", otherRoundIds)
    .like("notes", `${CONSOLATION_NOTES_PREFIX}%`)
    .order("tee_time", { ascending: true })
    .order("group_no", { ascending: true });

  return (groupsRaw ?? []) as GroupRaw[];
}

/** Grupos CONSOLACIÓN MP de un día (todas las rondas del calendario ese día). */
export async function loadConsolationMpGroupsForDate(
  admin: SupabaseClient,
  args: { tournamentId: string; roundDate: string | null }
): Promise<GroupRaw[]> {
  const roundDate = String(args.roundDate ?? "").trim();
  if (!roundDate) return [];

  const { data: dateRounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", args.tournamentId)
    .eq("round_date", roundDate);
  const roundIds = (dateRounds ?? []).map((r) => String(r.id)).filter(Boolean);
  if (roundIds.length === 0) return [];

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no, starting_hole, tee_time, notes")
    .in("round_id", roundIds)
    .like("notes", `${CONSOLATION_NOTES_PREFIX}%`)
    .order("tee_time", { ascending: true })
    .order("group_no", { ascending: true });

  return (groupsRaw ?? []) as GroupRaw[];
}
