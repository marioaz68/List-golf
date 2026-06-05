import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MatchPlayConsolationRule,
  MatchPlayConvocatoriaConfig,
} from "@/lib/matchplay/types";
import type { MaybeCreateNextRoundGroupResult } from "@/lib/matchplay/maybeCreateNextRoundGroup";

export const CONSOLATION_BRACKET_NAME = "Consolación Match Play";
export const CONSOLATION_NOTES_PREFIX = "CONSOLACIÓN MP · ";

/** Partidos del cuadro principal en una ronda (32 parejas → R4 = 2 semis). */
export function mainMatchesInRound(
  bracketSize: number,
  roundNo: number
): number {
  if (bracketSize < 2 || roundNo < 1) return 0;
  return bracketSize / Math.pow(2, roundNo);
}

export async function loadConsolationMpRule(
  admin: SupabaseClient,
  tournamentId: string
): Promise<MatchPlayConsolationRule | null> {
  const { data } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const cfg = (data?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const rules = Array.isArray(cfg.consolations) ? cfg.consolations : [];
  return (
    rules.find(
      (r) =>
        r.enabled &&
        r.consolation_format === "match_play" &&
        typeof r.from_round_no === "number" &&
        r.from_round_no > 0
    ) ?? null
  );
}

export async function getMainBracketSize(
  admin: SupabaseClient,
  tournamentId: string
): Promise<number> {
  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const size =
    (bracket?.config_json as { bracket_size?: number } | null)?.bracket_size ??
    0;
  if (size >= 2) return size;

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("bracket_main_pairs, max_pairs_per_category")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const pairs =
    rules?.bracket_main_pairs ?? rules?.max_pairs_per_category ?? 0;
  if (pairs >= 2) {
    let p = 2;
    while (p < pairs) p *= 2;
    return p;
  }
  return 0;
}

export async function getConsolationBracketId(
  admin: SupabaseClient,
  tournamentId: string
): Promise<string | null> {
  const { data } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("name", CONSOLATION_BRACKET_NAME)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function getOrCreateConsolationBracket(
  admin: SupabaseClient,
  tournamentId: string
): Promise<string | null> {
  const existing = await getConsolationBracketId(admin, tournamentId);
  if (existing) return existing;

  const { data: main } = await admin
    .from("matchplay_brackets")
    .select("category_id")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error } = await admin
    .from("matchplay_brackets")
    .insert({
      tournament_id: tournamentId,
      category_id: main?.category_id ?? null,
      name: CONSOLATION_BRACKET_NAME,
      bracket_type: "consolation_match_play",
      status: "published",
      config_json: { kind: "consolation_match_play" },
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    console.error("[consolationMatchPlay] create bracket:", error?.message);
    return null;
  }
  return String(inserted.id);
}

async function ensureConsolationMatch(
  admin: SupabaseClient,
  params: {
    consolationBracketId: string;
    tournamentId: string;
    roundNo: number;
    positionNo: number;
  }
): Promise<string | null> {
  const { data: existing } = await admin
    .from("matchplay_matches")
    .select("id")
    .eq("bracket_id", params.consolationBracketId)
    .eq("round_no", params.roundNo)
    .eq("position_no", params.positionNo)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data: inserted, error } = await admin
    .from("matchplay_matches")
    .insert({
      tournament_id: params.tournamentId,
      bracket_id: params.consolationBracketId,
      round_no: params.roundNo,
      position_no: params.positionNo,
      top_pair_id: null,
      bottom_pair_id: null,
      winner_pair_id: null,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    console.error("[consolationMatchPlay] create match:", error?.message);
    return null;
  }
  return String(inserted.id);
}

/**
 * Crea/actualiza la salida de consolación en la ronda destino.
 * group_no = partidos del cuadro principal en esa ronda + position_no consolación.
 * Ej.: R4 principal tiene G1–G2 (semis) → consolación usa G3–G4.
 */
export async function maybeCreateConsolationRoundGroup(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    nextMatchId: string;
    mainBracketSize: number;
  }
): Promise<MaybeCreateNextRoundGroupResult & { isConsolation?: boolean }> {
  const { data: nextMatch } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, status"
    )
    .eq("id", params.nextMatchId)
    .maybeSingle();

  if (!nextMatch?.top_pair_id || !nextMatch.bottom_pair_id) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
      reason: "waiting_other_pair",
      isConsolation: true,
    };
  }

  const nextRoundNo = Number(nextMatch.round_no);
  const positionNo = Number(nextMatch.position_no ?? 1);
  const mainCount = mainMatchesInRound(params.mainBracketSize, nextRoundNo);
  const groupNo = mainCount + positionNo;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", params.tournamentId)
    .eq("round_no", nextRoundNo)
    .maybeSingle();

  if (!roundRow?.id) {
    return {
      ok: true,
      created: false,
      groupNo,
      roundId: null,
      teeTime: null,
      reason: "round_not_in_calendar",
      isConsolation: true,
    };
  }

  const nextRoundId = String(roundRow.id);

  const parseHHMM = (raw: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
    return h * 60 + mm;
  };
  const formatHHMM = (totalMinutes: number): string => {
    const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  const baseMinutes = roundRow.start_time
    ? parseHHMM(String(roundRow.start_time))
    : null;
  const interval =
    typeof roundRow.interval_minutes === "number" &&
    roundRow.interval_minutes > 0
      ? Math.trunc(roundRow.interval_minutes)
      : 10;
  const teeTime =
    baseMinutes != null
      ? formatHHMM(baseMinutes + (groupNo - 1) * interval)
      : null;

  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed")
    .in("id", [nextMatch.top_pair_id, nextMatch.bottom_pair_id]);
  const topPair = (pairs ?? []).find((p) => p.id === nextMatch.top_pair_id);
  const botPair = (pairs ?? []).find((p) => p.id === nextMatch.bottom_pair_id);
  if (!topPair || !botPair) {
    return {
      ok: false,
      created: false,
      groupNo,
      roundId: nextRoundId,
      teeTime,
      reason: "pairs_missing",
      isConsolation: true,
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
  const notes = `${CONSOLATION_NOTES_PREFIX}${topLabel} vs ${botLabel}`;

  const { data: existing } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", nextRoundId)
    .eq("group_no", groupNo)
    .maybeSingle();

  let groupRecordId: string;
  let created = false;
  let updated = false;
  if (existing?.id) {
    groupRecordId = String(existing.id);
    await admin
      .from("pairing_groups")
      .update({ tee_time: teeTime, notes })
      .eq("id", groupRecordId);
    await admin
      .from("pairing_group_members")
      .delete()
      .eq("group_id", groupRecordId);
    updated = true;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("pairing_groups")
      .insert({
        round_id: nextRoundId,
        group_no: groupNo,
        tee_time: teeTime,
        starting_hole: null,
        notes,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return {
        ok: false,
        created: false,
        groupNo,
        roundId: nextRoundId,
        teeTime,
        reason: "insert_failed",
        isConsolation: true,
      };
    }
    groupRecordId = String(inserted.id);
    created = true;
  }

  if (entryIds.length > 0) {
    await admin.from("pairing_group_members").insert(
      entryIds.map((entry_id, idx) => ({
        group_id: groupRecordId,
        entry_id,
        position: idx + 1,
      }))
    );
  }

  return {
    ok: true,
    created,
    updated,
    groupNo,
    roundId: nextRoundId,
    teeTime,
    isConsolation: true,
  };
}

export type RouteLoserResult = {
  routed: boolean;
  nextMatchId: string | null;
  groupCreated: boolean;
  groupNo: number | null;
  message: string;
};

/**
 * Tras cerrar un match del cuadro principal, coloca al perdedor en el cuadro
 * de consolación MP de la ronda siguiente (misma geometría del bracket:
 * posiciones 1–2 → match consol 1, 3–4 → match consol 2, etc.).
 */
export async function routeLoserToConsolationMp(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    closedRoundNo: number;
    closedPositionNo: number;
    loserPairId: string;
    mainBracketSize: number;
  }
): Promise<RouteLoserResult> {
  const rule = await loadConsolationMpRule(admin, params.tournamentId);
  if (!rule || params.closedRoundNo !== rule.from_round_no) {
    return {
      routed: false,
      nextMatchId: null,
      groupCreated: false,
      groupNo: null,
      message: "Sin consolación MP para esta ronda.",
    };
  }

  const consolationBracketId = await getOrCreateConsolationBracket(
    admin,
    params.tournamentId
  );
  if (!consolationBracketId) {
    return {
      routed: false,
      nextMatchId: null,
      groupCreated: false,
      groupNo: null,
      message: "No se pudo crear el cuadro de consolación.",
    };
  }

  const nextRoundNo = params.closedRoundNo + 1;
  const nextPosition =
    Math.floor((params.closedPositionNo - 1) / 2) + 1;
  const slotIsTop = (params.closedPositionNo - 1) % 2 === 0;

  const nextMatchId = await ensureConsolationMatch(admin, {
    consolationBracketId,
    tournamentId: params.tournamentId,
    roundNo: nextRoundNo,
    positionNo: nextPosition,
  });
  if (!nextMatchId) {
    return {
      routed: false,
      nextMatchId: null,
      groupCreated: false,
      groupNo: null,
      message: "No se pudo crear el match de consolación.",
    };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (slotIsTop) patch.top_pair_id = params.loserPairId;
  else patch.bottom_pair_id = params.loserPairId;

  await admin.from("matchplay_matches").update(patch).eq("id", nextMatchId);

  const { data: nextRow } = await admin
    .from("matchplay_matches")
    .select("id, top_pair_id, bottom_pair_id")
    .eq("id", nextMatchId)
    .maybeSingle();

  let groupCreated = false;
  let groupNo: number | null = null;
  if (nextRow?.top_pair_id && nextRow.bottom_pair_id) {
    const grp = await maybeCreateConsolationRoundGroup(admin, {
      tournamentId: params.tournamentId,
      nextMatchId,
      mainBracketSize: params.mainBracketSize,
    });
    groupCreated = grp.created;
    groupNo = grp.groupNo;
  }

  const mainCount = mainMatchesInRound(params.mainBracketSize, nextRoundNo);
  return {
    routed: true,
    nextMatchId,
    groupCreated,
    groupNo,
    message: groupCreated
      ? `Perdedor a consolación R${nextRoundNo} · salida G${groupNo} (después de G${mainCount}).`
      : `Perdedor registrado en consolación R${nextRoundNo} M${nextPosition} (esperando otro perdedor).`,
  };
}

/** ¿Un perdedor de esta ronda sigue jugando consolación MP? */
export function isConsolationMpEntryRound(
  rule: MatchPlayConsolationRule | null,
  roundNo: number
): boolean {
  return !!rule && rule.from_round_no === roundNo;
}

/**
 * Busca el match del cuadro (principal o consolación) con estas parejas en la
 * ronda indicada.
 */
export async function findBracketMatchForPairs(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    mainBracketId: string;
    roundNo: number;
    topPairId: string;
    bottomPairId: string;
  }
): Promise<{ id: string; bracket_id: string } | null> {
  const bracketIds = [params.mainBracketId];
  const consolId = await getConsolationBracketId(admin, params.tournamentId);
  if (consolId) bracketIds.push(consolId);

  for (const bid of bracketIds) {
    const { data: rows } = await admin
      .from("matchplay_matches")
      .select("id, bracket_id, top_pair_id, bottom_pair_id")
      .eq("bracket_id", bid)
      .eq("round_no", params.roundNo);

    const hit = (rows ?? []).find(
      (m) =>
        (m.top_pair_id === params.topPairId &&
          m.bottom_pair_id === params.bottomPairId) ||
        (m.top_pair_id === params.bottomPairId &&
          m.bottom_pair_id === params.topPairId)
    );
    if (hit) return { id: String(hit.id), bracket_id: String(hit.bracket_id) };
  }
  return null;
}

/**
 * Procesa todos los matches completados de una ronda del cuadro principal y
 * enruta perdedores a consolación (útil si R3 ya cerró antes de activar esto).
 */
export async function backfillConsolationLosersFromRound(
  admin: SupabaseClient,
  tournamentId: string,
  roundNo?: number
): Promise<{ processed: number; groupsCreated: number; messages: string[] }> {
  const rule = await loadConsolationMpRule(admin, tournamentId);
  if (!rule) {
    return { processed: 0, groupsCreated: 0, messages: ["Sin regla consolación MP."] };
  }
  const targetRound = roundNo ?? rule.from_round_no;

  const { data: mainBracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mainBracket?.id) {
    return { processed: 0, groupsCreated: 0, messages: ["Sin cuadro principal."] };
  }

  const { data: completed } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status"
    )
    .eq("bracket_id", mainBracket.id)
    .eq("round_no", targetRound)
    .eq("status", "completed");

  const mainSize = await getMainBracketSize(admin, tournamentId);
  let processed = 0;
  let groupsCreated = 0;
  const messages: string[] = [];

  for (const m of completed ?? []) {
    if (!m.winner_pair_id || !m.top_pair_id || !m.bottom_pair_id) continue;
    const loserPairId =
      m.winner_pair_id === m.top_pair_id ? m.bottom_pair_id : m.top_pair_id;
    const res = await routeLoserToConsolationMp(admin, {
      tournamentId,
      closedRoundNo: Number(m.round_no),
      closedPositionNo: Number(m.position_no),
      loserPairId,
      mainBracketSize: mainSize,
    });
    if (res.routed) {
      processed += 1;
      messages.push(res.message);
      if (res.groupCreated) groupsCreated += 1;
    }
  }

  return { processed, groupsCreated, messages };
}
