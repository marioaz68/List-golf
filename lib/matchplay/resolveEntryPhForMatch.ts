import {
  effectivePlayingHandicapForEntry,
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
  tee_set_id_override?: string | null;
  player?: {
    gender?: string | null;
    birth_year?: number | null;
    handicap_index?: number | null;
    handicap_torneo?: number | null;
  } | null;
};

/**
 * PH efectivo para match play: override → guardado → WHS (campo + reglas).
 *
 * Envoltura fina sobre `effectivePlayingHandicapForEntry`, el resolvedor
 * canónico del PH de torneo. No dupliques el orden de prioridad aquí:
 * si cambia, cambia en `lib/handicap/resolveTournamentEntryHandicap.ts`.
 */
export function effectivePhForMatchEntry(
  entry: MatchEntryPhRow,
  handicapCtx: TournamentHandicapContext | null
): number | null {
  return effectivePlayingHandicapForEntry(
    {
      id: entry.id,
      player_id: entry.player_id,
      category_id: entry.category_id ?? null,
      handicap_index: entry.handicap_index,
      playing_handicap: entry.playing_handicap,
      playing_handicap_override: entry.playing_handicap_override,
      tee_set_id_override: entry.tee_set_id_override ?? null,
      player: entry.player ?? null,
    },
    handicapCtx
  );
}

export function hiForMatchEntry(entry: MatchEntryPhRow): number {
  return effectiveEntryHi({
    handicap_index: entry.handicap_index,
    player: entry.player ?? null,
  });
}
