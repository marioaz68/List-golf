import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";
import {
  CONSOLATION_BRACKET_NAME,
  getMainBracketSize,
} from "@/lib/matchplay/consolationMatchPlay";
import { maybeCreateNextRoundGroup } from "@/lib/matchplay/maybeCreateNextRoundGroup";

/** Partido por 3er/4to lugar en la ronda final del cuadro principal. */
export const THIRD_PLACE_POSITION_NO = 2;
export const THIRD_PLACE_NOTES_PREFIX = "3ER LUGAR MP · ";

export function isSemifinalRound(roundNo: number, roundCount: number): boolean {
  return roundCount >= 2 && roundNo === roundCount - 1;
}

export function thirdPlaceRoundNo(roundCount: number): number {
  return roundCount;
}

async function getMainBracketId(
  admin: SupabaseClient,
  tournamentId: string
): Promise<string | null> {
  const { data } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function getThirdPlaceMatch(
  admin: SupabaseClient,
  tournamentId: string
): Promise<{
  id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string;
  result_text: string | null;
} | null> {
  const bracketId = await getMainBracketId(admin, tournamentId);
  if (!bracketId) return null;
  const mainSize = await getMainBracketSize(admin, tournamentId);
  if (mainSize < 4) return null;
  const roundCount = roundCountForBracketSize(mainSize);
  const { data } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
    )
    .eq("bracket_id", bracketId)
    .eq("round_no", thirdPlaceRoundNo(roundCount))
    .eq("position_no", THIRD_PLACE_POSITION_NO)
    .maybeSingle();
  return data ?? null;
}

async function ensureThirdPlaceMatch(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    mainBracketId: string;
    roundCount: number;
  }
): Promise<string | null> {
  const roundNo = thirdPlaceRoundNo(params.roundCount);
  const { data: existing } = await admin
    .from("matchplay_matches")
    .select("id")
    .eq("bracket_id", params.mainBracketId)
    .eq("round_no", roundNo)
    .eq("position_no", THIRD_PLACE_POSITION_NO)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data: inserted, error } = await admin
    .from("matchplay_matches")
    .insert({
      tournament_id: params.tournamentId,
      bracket_id: params.mainBracketId,
      round_no: roundNo,
      position_no: THIRD_PLACE_POSITION_NO,
      top_pair_id: null,
      bottom_pair_id: null,
      winner_pair_id: null,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !inserted?.id) {
    console.error("[thirdPlaceMatch] create match:", error?.message);
    return null;
  }
  return String(inserted.id);
}

export type RouteThirdPlaceLoserResult = {
  routed: boolean;
  thirdPlaceMatchId: string | null;
  groupCreated: boolean;
  groupNo: number | null;
  message: string;
};

/**
 * Tras cerrar una semifinal del cuadro principal, coloca al perdedor en el
 * partido por 3er/4to lugar (misma ronda que la final, position_no = 2).
 */
export async function routeLoserToThirdPlace(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    mainBracketId: string;
    closedRoundNo: number;
    closedPositionNo: number;
    loserPairId: string;
    mainBracketSize: number;
  }
): Promise<RouteThirdPlaceLoserResult> {
  const roundCount = roundCountForBracketSize(params.mainBracketSize);
  if (!isSemifinalRound(params.closedRoundNo, roundCount)) {
    return {
      routed: false,
      thirdPlaceMatchId: null,
      groupCreated: false,
      groupNo: null,
      message: "No es semifinal del cuadro principal.",
    };
  }

  const thirdPlaceMatchId = await ensureThirdPlaceMatch(admin, {
    tournamentId: params.tournamentId,
    mainBracketId: params.mainBracketId,
    roundCount,
  });
  if (!thirdPlaceMatchId) {
    return {
      routed: false,
      thirdPlaceMatchId: null,
      groupCreated: false,
      groupNo: null,
      message: "No se pudo crear el match por 3er/4to lugar.",
    };
  }

  const slotIsTop = params.closedPositionNo === 1;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (slotIsTop) patch.top_pair_id = params.loserPairId;
  else patch.bottom_pair_id = params.loserPairId;

  await admin.from("matchplay_matches").update(patch).eq("id", thirdPlaceMatchId);

  const { data: row } = await admin
    .from("matchplay_matches")
    .select("id, top_pair_id, bottom_pair_id")
    .eq("id", thirdPlaceMatchId)
    .maybeSingle();

  let groupCreated = false;
  let groupNo: number | null = null;
  if (row?.top_pair_id && row.bottom_pair_id) {
    const grp = await maybeCreateThirdPlaceRoundGroup(admin, {
      tournamentId: params.tournamentId,
      thirdPlaceMatchId,
      mainBracketSize: params.mainBracketSize,
    });
    groupCreated = grp.created;
    groupNo = grp.groupNo;
  }

  return {
    routed: true,
    thirdPlaceMatchId,
    groupCreated,
    groupNo,
    message: groupCreated
      ? `Perdedor a 3er/4to lugar · salida G${groupNo}.`
      : `Perdedor registrado en 3er/4to lugar (esperando otro perdedor de semifinal).`,
  };
}

/**
 * Crea/actualiza la salida del partido por 3er/4to lugar. Usa notas
 * `3ER LUGAR MP ·` para no confundirlo con la final del cuadro principal.
 */
export async function maybeCreateThirdPlaceRoundGroup(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    thirdPlaceMatchId: string;
    mainBracketSize: number;
  }
): Promise<{
  ok: boolean;
  created: boolean;
  groupNo: number | null;
  roundId: string | null;
  teeTime: string | null;
}> {
  const { data: match } = await admin
    .from("matchplay_matches")
    .select("id, round_no, position_no, top_pair_id, bottom_pair_id")
    .eq("id", params.thirdPlaceMatchId)
    .maybeSingle();
  if (!match?.top_pair_id || !match.bottom_pair_id) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
    };
  }

  const roundNo = Number(match.round_no);
  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", params.tournamentId)
    .eq("round_no", roundNo)
    .maybeSingle();
  if (!roundRow?.id) {
    return {
      ok: true,
      created: false,
      groupNo: THIRD_PLACE_POSITION_NO,
      roundId: null,
      teeTime: null,
    };
  }

  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed")
    .in("id", [match.top_pair_id, match.bottom_pair_id]);
  const topPair = (pairs ?? []).find((p) => p.id === match.top_pair_id);
  const botPair = (pairs ?? []).find((p) => p.id === match.bottom_pair_id);
  if (!topPair || !botPair) {
    return {
      ok: false,
      created: false,
      groupNo: THIRD_PLACE_POSITION_NO,
      roundId: String(roundRow.id),
      teeTime: null,
    };
  }

  const entryIds = [
    topPair.player_a_entry_id,
    topPair.player_b_entry_id,
    botPair.player_a_entry_id,
    botPair.player_b_entry_id,
  ].filter((v): v is string => !!v);

  const topLabel = topPair.seed != null ? `#${topPair.seed}` : "TOP";
  const botLabel = botPair.seed != null ? `#${botPair.seed}` : "BOT";
  const notes = `${THIRD_PLACE_NOTES_PREFIX}${topLabel} vs ${botLabel}`;
  const roundId = String(roundRow.id);

  const { data: existingByNotes } = await admin
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", roundId)
    .eq("notes", notes)
    .maybeSingle();

  const parseHHMM = (raw: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const formatHHMM = (total: number): string => {
    const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  const baseMinutes = roundRow.start_time
    ? parseHHMM(String(roundRow.start_time))
    : null;
  const interval =
    typeof roundRow.interval_minutes === "number" && roundRow.interval_minutes > 0
      ? Math.trunc(roundRow.interval_minutes)
      : 10;

  // Si ya hay salida manual con las mismas parejas (p.ej. "MATCH PLAY · #1 vs #11"),
  // la reutilizamos y solo actualizamos notas/tee si hace falta.
  if (!existingByNotes?.id) {
    const { data: groupsInRound } = await admin
      .from("pairing_groups")
      .select("id, group_no, notes")
      .eq("round_id", roundId);
    const groupIds = (groupsInRound ?? []).map((g) => String(g.id));
    if (groupIds.length > 0) {
      const { data: members } = await admin
        .from("pairing_group_members")
        .select("group_id, entry_id")
        .in("group_id", groupIds);
      const { data: allTeams } = await admin
        .from("matchplay_pair_teams")
        .select("id, player_a_entry_id, player_b_entry_id")
        .eq("tournament_id", params.tournamentId)
        .eq("is_active", true);
      const entryToTeam = new Map<string, string>();
      for (const t of allTeams ?? []) {
        if (t.player_a_entry_id) entryToTeam.set(t.player_a_entry_id, String(t.id));
        if (t.player_b_entry_id) entryToTeam.set(t.player_b_entry_id, String(t.id));
      }
      const want = new Set([match.top_pair_id, match.bottom_pair_id]);
      for (const g of groupsInRound ?? []) {
        const teamIds = new Set<string>();
        for (const m of members ?? []) {
          if (m.group_id !== g.id) continue;
          const tid = entryToTeam.get(m.entry_id);
          if (tid) teamIds.add(tid);
        }
        if (teamIds.size === 2 && [...teamIds].every((id) => want.has(id))) {
          await admin
            .from("pairing_groups")
            .update({ notes })
            .eq("id", g.id);
          return {
            ok: true,
            created: false,
            groupNo: typeof g.group_no === "number" ? g.group_no : null,
            roundId,
            teeTime: null,
          };
        }
      }
    }
  }

  // Fallback: misma lógica de tee/group que el cuadro principal.
  const fallback = await maybeCreateNextRoundGroup(admin, {
    tournamentId: params.tournamentId,
    nextMatchId: params.thirdPlaceMatchId,
  });
  if (fallback.created || fallback.updated) {
    await admin
      .from("pairing_groups")
      .update({ notes })
      .eq("round_id", roundId)
      .eq("group_no", fallback.groupNo ?? THIRD_PLACE_POSITION_NO);
  }
  return {
    ok: fallback.ok,
    created: fallback.created,
    groupNo: fallback.groupNo,
    roundId: fallback.roundId,
    teeTime: fallback.teeTime,
  };
}

/**
 * Si ambas semifinales ya están cerradas, asegura el match por 3er/4to lugar
 * con los dos perdedores y su salida (idempotente).
 */
export async function syncThirdPlaceMatchFromSemis(
  admin: SupabaseClient,
  tournamentId: string
): Promise<{ synced: boolean; message: string }> {
  const mainBracketId = await getMainBracketId(admin, tournamentId);
  if (!mainBracketId) {
    return { synced: false, message: "Sin cuadro principal." };
  }
  const mainSize = await getMainBracketSize(admin, tournamentId);
  if (mainSize < 4) {
    return { synced: false, message: "Cuadro demasiado pequeño para 3er lugar." };
  }
  const roundCount = roundCountForBracketSize(mainSize);
  const semiRound = roundCount - 1;

  const { data: semis } = await admin
    .from("matchplay_matches")
    .select(
      "id, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status"
    )
    .eq("bracket_id", mainBracketId)
    .eq("round_no", semiRound)
    .eq("status", "completed")
    .order("position_no");

  if ((semis ?? []).length < 2) {
    return { synced: false, message: "Semifinales incompletas." };
  }

  let routed = 0;
  for (const semi of semis ?? []) {
    if (!semi.winner_pair_id || !semi.top_pair_id || !semi.bottom_pair_id) continue;
    const loserPairId =
      semi.winner_pair_id === semi.top_pair_id
        ? semi.bottom_pair_id
        : semi.top_pair_id;
    const res = await routeLoserToThirdPlace(admin, {
      tournamentId,
      mainBracketId,
      closedRoundNo: semiRound,
      closedPositionNo: Number(semi.position_no),
      loserPairId,
      mainBracketSize: mainSize,
    });
    if (res.routed) routed += 1;
  }

  return {
    synced: routed > 0,
    message:
      routed > 0
        ? "Match por 3er/4to lugar sincronizado desde semifinales."
        : "No se pudo sincronizar 3er/4to lugar.",
  };
}

export function isThirdPlaceMatch(
  match: { round_no: number; position_no: number },
  roundCount: number
): boolean {
  return (
    roundCount >= 2 &&
    match.round_no === roundCount &&
    match.position_no === THIRD_PLACE_POSITION_NO
  );
}
