import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlayablePairTeam } from "@/lib/matchplay/playablePairTeam";
import { compactAndSyncRoundGroups } from "@/lib/matchplay/pairingGroupOrder";

export type SeedDefinedMatchPlayGroupsResult = {
  ok: true;
  roundsSeeded: number;
  groupsCreated: number;
  skippedExisting: number;
};

function parseHHMM(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function formatHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type PairRow = {
  id: string;
  seed: number | null;
  is_active: boolean | null;
  player_a_entry_id: string | null;
  player_b_entry_id: string | null;
};

function fourEntryIds(top: PairRow, bot: PairRow): string[] | null {
  const entryIds = [
    top.player_a_entry_id,
    top.player_b_entry_id,
    bot.player_a_entry_id,
    bot.player_b_entry_id,
  ].filter((v): v is string => !!v);
  if (entryIds.length < 4) return null;
  return entryIds;
}

/**
 * Arma foursomes sólo para matches con DOS parejas jugables (4 jugadores).
 * No crea grupos de 2 contra un BYE o pareja fantasma. Si la ronda ya
 * tiene salidas, rellena las que falten sin borrar las existentes.
 */
export async function seedDefinedMatchPlayGroups(
  admin: SupabaseClient,
  tournamentId: string
): Promise<SeedDefinedMatchPlayGroupsResult> {
  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bracket?.id) {
    return { ok: true, roundsSeeded: 0, groupsCreated: 0, skippedExisting: 0 };
  }

  const { data: matchesRaw, error: matchErr } = await admin
    .from("matchplay_matches")
    .select("round_no, position_no, top_pair_id, bottom_pair_id, status")
    .eq("bracket_id", bracket.id)
    .order("round_no", { ascending: true })
    .order("position_no", { ascending: true });

  if (matchErr) throw new Error(matchErr.message);

  const definedByRound = new Map<
    number,
    Array<{ top_pair_id: string; bottom_pair_id: string; position_no: number }>
  >();

  for (const m of matchesRaw ?? []) {
    if (m.status === "bye" || m.status === "walkover") continue;
    if (!m.top_pair_id || !m.bottom_pair_id) continue;
    const roundNo = Number(m.round_no);
    const list = definedByRound.get(roundNo) ?? [];
    list.push({
      top_pair_id: m.top_pair_id,
      bottom_pair_id: m.bottom_pair_id,
      position_no: Number(m.position_no ?? 0),
    });
    definedByRound.set(roundNo, list);
  }

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, round_no, start_time, interval_minutes")
    .eq("tournament_id", tournamentId);

  const roundByNo = new Map(
    (rounds ?? []).map((r) => [Number(r.round_no), r] as const)
  );

  let roundsSeeded = 0;
  let groupsCreated = 0;
  let skippedExisting = 0;

  for (const [roundNo, matches] of definedByRound) {
    const round = roundByNo.get(roundNo);
    if (!round?.id) continue;

    const pairIds = [
      ...new Set(matches.flatMap((m) => [m.top_pair_id, m.bottom_pair_id])),
    ];
    const { data: pairs } = await admin
      .from("matchplay_pair_teams")
      .select("id, seed, is_active, player_a_entry_id, player_b_entry_id")
      .in("id", pairIds);

    const pairById = new Map(
      ((pairs ?? []) as PairRow[]).map((p) => [p.id, p] as const)
    );

    const { data: existingGroups } = await admin
      .from("pairing_groups")
      .select("id, group_no, notes")
      .eq("round_id", round.id);
    const groups = existingGroups ?? [];
    const usedNos = new Set(
      groups.map((g) => Number(g.group_no)).filter((n) => Number.isFinite(n))
    );
    const groupIds = groups.map((g) => g.id);
    const entriesByGroup = new Map<string, Set<string>>();
    if (groupIds.length > 0) {
      const { data: members } = await admin
        .from("pairing_group_members")
        .select("group_id, entry_id")
        .in("group_id", groupIds);
      for (const row of members ?? []) {
        const set = entriesByGroup.get(row.group_id) ?? new Set();
        set.add(row.entry_id);
        entriesByGroup.set(row.group_id, set);
      }
    }

    const alreadyGrouped = (entryIds: string[]) => {
      for (const set of entriesByGroup.values()) {
        if (entryIds.every((id) => set.has(id))) return true;
      }
      return false;
    };

    const nextFreeGroupNo = () => {
      let n = 1;
      while (usedNos.has(n)) n += 1;
      usedNos.add(n);
      return n;
    };

    const baseMinutes = round.start_time
      ? parseHHMM(String(round.start_time))
      : 7 * 60;
    const start = baseMinutes ?? 7 * 60;
    const interval =
      typeof round.interval_minutes === "number" && round.interval_minutes > 0
        ? Math.trunc(round.interval_minutes)
        : 10;

    let createdThisRound = 0;
    for (const match of matches) {
      const top = pairById.get(match.top_pair_id);
      const bot = pairById.get(match.bottom_pair_id);
      if (!top || !bot) continue;
      if (!isPlayablePairTeam(top) || !isPlayablePairTeam(bot)) continue;
      const entryIds = fourEntryIds(top, bot);
      if (!entryIds) continue;
      if (alreadyGrouped(entryIds)) {
        skippedExisting += 1;
        continue;
      }

      const groupNo = nextFreeGroupNo();
      const teeTime = formatHHMM(start + (groupNo - 1) * interval);
      const topLabel = top.seed != null ? `#${top.seed}` : "TOP";
      const botLabel = bot.seed != null ? `#${bot.seed}` : "BOT";

      const { data: pg, error: insG } = await admin
        .from("pairing_groups")
        .insert({
          round_id: round.id,
          group_no: groupNo,
          tee_time: teeTime,
          starting_hole: null,
          notes: `MATCH PLAY · ${topLabel} vs ${botLabel}`,
        })
        .select("id")
        .single();

      if (insG || !pg?.id) {
        throw new Error(
          `No se pudo crear el foursome R${roundNo} G${groupNo}: ${insG?.message ?? ""}`
        );
      }

      const { error: insM } = await admin.from("pairing_group_members").insert(
        entryIds.map((entry_id, idx) => ({
          group_id: pg.id,
          entry_id,
          position: idx + 1,
        }))
      );
      if (insM) {
        throw new Error(
          `No se pudieron agregar jugadores al foursome R${roundNo} G${groupNo}: ${insM.message}`
        );
      }

      entriesByGroup.set(pg.id, new Set(entryIds));
      createdThisRound += 1;
      groupsCreated += 1;
    }

    if (createdThisRound > 0) roundsSeeded += 1;

    // Sin huecos en group_no ni tee_time (p. ej. si G2 quedó vacío y se borró).
    try {
      await compactAndSyncRoundGroups(admin, round.id);
    } catch (err) {
      console.error(`[seedDefinedMatchPlayGroups] compact R${roundNo}:`, err);
    }
  }

  return { ok: true, roundsSeeded, groupsCreated, skippedExisting };
}
