import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Arma foursomes sólo para matches que ya tienen ambas parejas
 * (R1 reales + R2 que ya quedaron definidos por BYE). No borra
 * grupos existentes: si la ronda ya tiene salidas, la deja.
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

    const { count } = await admin
      .from("pairing_groups")
      .select("id", { count: "exact", head: true })
      .eq("round_id", round.id);

    if ((count ?? 0) > 0) {
      skippedExisting += 1;
      continue;
    }

    const pairIds = [
      ...new Set(matches.flatMap((m) => [m.top_pair_id, m.bottom_pair_id])),
    ];
    const { data: pairs } = await admin
      .from("matchplay_pair_teams")
      .select("id, seed, player_a_entry_id, player_b_entry_id")
      .in("id", pairIds);

    const pairById = new Map((pairs ?? []).map((p) => [p.id, p] as const));
    const baseMinutes = round.start_time
      ? parseHHMM(String(round.start_time))
      : 7 * 60;
    const start = baseMinutes ?? 7 * 60;
    const interval =
      typeof round.interval_minutes === "number" && round.interval_minutes > 0
        ? Math.trunc(round.interval_minutes)
        : 10;

    let groupNo = 1;
    for (const match of matches) {
      const top = pairById.get(match.top_pair_id);
      const bot = pairById.get(match.bottom_pair_id);
      if (!top || !bot) continue;

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

      const entryIds = [
        top.player_a_entry_id,
        top.player_b_entry_id,
        bot.player_a_entry_id,
        bot.player_b_entry_id,
      ].filter((v): v is string => !!v);

      if (entryIds.length > 0) {
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
      }

      groupNo += 1;
      groupsCreated += 1;
    }

    if (groupNo > 1) roundsSeeded += 1;
  }

  return { ok: true, roundsSeeded, groupsCreated, skippedExisting };
}
