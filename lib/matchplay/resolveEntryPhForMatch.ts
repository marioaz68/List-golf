import {
  resolveTournamentEntryHandicap,
  type EntryForHandicap,
  type TournamentHandicapContext,
} from "@/lib/handicap/resolveTournamentEntryHandicap";
import { effectiveEntryHi } from "@/lib/matchplay/entryHi";

export type MatchEntryPhRow = {
  id: string;
  player_id: string;
  category_id?: string | null;
  handicap_index?: number | null;
  playing_handicap?: number | null;
  playing_handicap_override?: number | null;
  player?: {
    gender?: string | null;
    birth_year?: number | null;
    handicap_index?: number | null;
    handicap_torneo?: number | null;
  } | null;
};

/** PH efectivo para match play: override → guardado → WHS (campo + reglas). */
export function effectivePhForMatchEntry(
  entry: MatchEntryPhRow,
  handicapCtx: TournamentHandicapContext | null
): number | null {
  if (entry.playing_handicap_override != null) {
    return Math.round(Number(entry.playing_handicap_override));
  }
  if (
    entry.playing_handicap != null &&
    Number.isFinite(Number(entry.playing_handicap))
  ) {
    return Math.round(Number(entry.playing_handicap));
  }
  if (!handicapCtx) return null;

  const payload: EntryForHandicap = {
    id: entry.id,
    player_id: entry.player_id,
    category_id: entry.category_id ?? null,
    handicap_index: entry.handicap_index,
    playing_handicap_override: null,
    player: entry.player ?? null,
  };
  const calc = resolveTournamentEntryHandicap(payload, handicapCtx);
  return calc?.playing_handicap ?? null;
}

export function hiForMatchEntry(entry: MatchEntryPhRow): number {
  return effectiveEntryHi({
    handicap_index: entry.handicap_index,
    player: entry.player ?? null,
  });
}
