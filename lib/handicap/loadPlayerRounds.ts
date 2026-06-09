/**
 * Carga el histórico de rondas (de torneos y rondas diarias) de un jugador
 * para mostrarle en su Mini App.
 *
 * Devuelve por ronda:
 *   - fecha, nombre del torneo, kind (competition | daily_round | practice)
 *   - score total (gross), thru (hoyos jugados)
 *   - diferencial WHS aproximado (cuando hay slope/rating del tee jugado)
 *   - detalle hoyo por hoyo opcional
 *
 * NO calcula el HI todavía (eso es fase 4 — WHS oficial con últimos 20).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDifferential } from "./whsDifferential";

export interface PlayerRoundSummary {
  scorecardId: string;
  entryId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentKind: "competition" | "daily_round" | "practice";
  isPrivate: boolean;
  playedAt: string | null; // YYYY-MM-DD
  teeName: string | null;
  teeColor: string | null;
  par: number | null;
  slope: number | null;
  courseRating: number | null;
  grossScore: number | null;
  thru: number; // hoyos con score capturado
  toPar: number | null;
  differential: number | null;
  isLocked: boolean;
  holes: PlayerHoleScore[];
}

export interface PlayerHoleScore {
  holeNo: number;
  par: number | null;
  strokes: number | null;
  toPar: number | null;
}

export interface PlayerRoundsResult {
  player: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    gender: "M" | "F" | "X" | null;
  } | null;
  rounds: PlayerRoundSummary[];
}

const KIND_VALUES = new Set(["competition", "daily_round", "practice"]);

export async function loadPlayerRoundsByTelegram(
  admin: SupabaseClient,
  telegramUserId: string,
  opts: { limit?: number } = {}
): Promise<PlayerRoundsResult> {
  const limit = opts.limit ?? 40;

  const { data: pl } = await admin
    .from("players")
    .select("id, first_name, last_name, gender")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (!pl) return { player: null, rounds: [] };

  return loadPlayerRoundsById(admin, String((pl as { id: string }).id), { limit });
}

export async function loadPlayerRoundsById(
  admin: SupabaseClient,
  playerId: string,
  opts: { limit?: number } = {}
): Promise<PlayerRoundsResult> {
  const limit = opts.limit ?? 40;

  const { data: playerRow } = await admin
    .from("players")
    .select("id, first_name, last_name, gender")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerRow) return { player: null, rounds: [] };
  const p = playerRow as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
  };
  const player = {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    fullName: [p.first_name, p.last_name]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ") || "Jugador",
    gender: (p.gender === "M" || p.gender === "F" || p.gender === "X"
      ? p.gender
      : null) as "M" | "F" | "X" | null,
  };

  // 1) Cargar todos los entries del jugador
  const { data: entriesRaw } = await admin
    .from("tournament_entries")
    .select("id, tournament_id, tee_set_id, handicap_index")
    .eq("player_id", p.id);
  const entries = (entriesRaw ?? []) as Array<{
    id: string;
    tournament_id: string;
    tee_set_id: string | null;
    handicap_index: number | null;
  }>;
  if (entries.length === 0) return { player, rounds: [] };

  const entryIds = entries.map((e) => e.id);
  const tournamentIds = Array.from(new Set(entries.map((e) => e.tournament_id)));

  // 2) Torneos con su fecha + kind + privacidad
  const { data: tournamentsRaw } = await admin
    .from("tournaments")
    .select("id, name, start_date, kind, is_private")
    .in("id", tournamentIds)
    .order("start_date", { ascending: false, nullsFirst: false });
  const tournaments = (tournamentsRaw ?? []) as Array<{
    id: string;
    name: string;
    start_date: string | null;
    kind: string | null;
    is_private: boolean | null;
  }>;
  const tournamentById = new Map(tournaments.map((t) => [t.id, t]));

  // 3) Tee sets para WHS
  const teeSetIds = Array.from(
    new Set(entries.map((e) => e.tee_set_id).filter(Boolean) as string[])
  );
  type TeeSetRow = {
    id: string;
    name: string | null;
    color: string | null;
    par: number | null;
    slope_men: number | null;
    slope_women: number | null;
    course_rating_men: number | null;
    course_rating_women: number | null;
  };
  const teeSetById = new Map<string, TeeSetRow>();
  if (teeSetIds.length > 0) {
    const { data: teeSetsRaw } = await admin
      .from("course_tee_sets")
      .select(
        "id, name, color, par, slope_men, slope_women, course_rating_men, course_rating_women"
      )
      .in("id", teeSetIds);
    for (const t of (teeSetsRaw ?? []) as TeeSetRow[]) {
      teeSetById.set(t.id, t);
    }
  }

  // 4) Scorecards del jugador
  const { data: scorecardsRaw } = await admin
    .from("scorecards")
    .select("id, entry_id, gross_score, locked_at, created_at")
    .in("entry_id", entryIds);
  const scorecards = (scorecardsRaw ?? []) as Array<{
    id: string;
    entry_id: string;
    gross_score: number | null;
    locked_at: string | null;
    created_at: string;
  }>;
  if (scorecards.length === 0) return { player, rounds: [] };

  const scorecardIds = scorecards.map((s) => s.id);

  // 5) Hole scores por scorecard
  const { data: holesRaw } = await admin
    .from("hole_scores")
    .select("scorecard_id, hole_no, hole_number, strokes")
    .in("scorecard_id", scorecardIds);
  type HoleRow = {
    scorecard_id: string;
    hole_no: number | null;
    hole_number: number | null;
    strokes: number | null;
  };
  const holesByScorecard = new Map<string, PlayerHoleScore[]>();
  for (const h of (holesRaw ?? []) as HoleRow[]) {
    const sid = String(h.scorecard_id);
    const arr = holesByScorecard.get(sid) ?? [];
    const holeNo = Number(h.hole_no ?? h.hole_number ?? 0);
    if (holeNo > 0) {
      arr.push({
        holeNo,
        par: null, // se llena en el merge con tournament_holes si está
        strokes: typeof h.strokes === "number" ? h.strokes : null,
        toPar: null,
      });
    }
    holesByScorecard.set(sid, arr);
  }
  // Ordenar hoyos por número
  for (const [sid, arr] of holesByScorecard) {
    arr.sort((a, b) => a.holeNo - b.holeNo);
    holesByScorecard.set(sid, arr);
  }

  // 6) Componer summary por scorecard
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const rounds: PlayerRoundSummary[] = [];
  for (const sc of scorecards) {
    const entry = entryById.get(sc.entry_id);
    if (!entry) continue;
    const tournament = tournamentById.get(entry.tournament_id);
    if (!tournament) continue;
    const teeSet = entry.tee_set_id ? teeSetById.get(entry.tee_set_id) : null;
    const par = teeSet?.par ?? null;
    const useWomen = player.gender === "F";
    const slope = useWomen
      ? teeSet?.slope_women ?? teeSet?.slope_men ?? null
      : teeSet?.slope_men ?? teeSet?.slope_women ?? null;
    const courseRating = useWomen
      ? teeSet?.course_rating_women ?? teeSet?.course_rating_men ?? null
      : teeSet?.course_rating_men ?? teeSet?.course_rating_women ?? null;

    const holes = holesByScorecard.get(sc.id) ?? [];
    const thru = holes.filter((h) => h.strokes != null).length;
    const computedGross =
      sc.gross_score ??
      (thru > 0
        ? holes.reduce(
            (s, h) => (h.strokes != null ? s + h.strokes : s),
            0
          )
        : null);

    const toPar =
      computedGross != null && par != null && thru === 18
        ? computedGross - par
        : null;

    const diff =
      computedGross != null && slope != null && courseRating != null && thru === 18
        ? computeDifferential({
            adjustedGross: computedGross,
            courseRating,
            slope,
          })
        : null;

    const kindNormalized = KIND_VALUES.has(tournament.kind ?? "")
      ? ((tournament.kind ?? "competition") as
          | "competition"
          | "daily_round"
          | "practice")
      : "competition";

    rounds.push({
      scorecardId: sc.id,
      entryId: sc.entry_id,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentKind: kindNormalized,
      isPrivate: Boolean(tournament.is_private),
      playedAt: tournament.start_date,
      teeName: teeSet?.name ?? null,
      teeColor: teeSet?.color ?? null,
      par,
      slope,
      courseRating,
      grossScore: computedGross,
      thru,
      toPar,
      differential: diff,
      isLocked: Boolean(sc.locked_at),
      holes,
    });
  }

  // Ordenar por fecha desc, luego por createdAt como fallback
  rounds.sort((a, b) => {
    const ad = a.playedAt ?? "";
    const bd = b.playedAt ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    return 0;
  });

  return { player, rounds: rounds.slice(0, limit) };
}
