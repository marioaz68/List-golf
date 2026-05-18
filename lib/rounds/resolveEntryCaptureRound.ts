import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatRoundSelectLabelShort,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { getRoundForCategory, type RoundForGate } from "@/lib/rounds/categoryRoundGate";
import {
  resolveOpenCaptureRoundForEntry,
  type OpenCaptureRoundResult,
} from "@/lib/rounds/resolveOpenCaptureRoundForEntry";
import type { LockedScorecardLookups } from "@/lib/leaderboard/lockedScorecards";
import { resolveEntryCategoryRoundId } from "@/lib/rounds/resolveRoundForEntry";

export type EntryCaptureRoundResult = OpenCaptureRoundResult & {
  /** Etiqueta legible: día, turno AM/PM, categoría (desde rounds / salidas). */
  sessionLabel?: string;
};

export function isEntryCaptureRoundClosed(
  result: EntryCaptureRoundResult
): boolean {
  return result.ok === true && result.roundClosed === true;
}

/**
 * Ronda efectiva para capturar: categoría de la inscripción, número de ronda
 * pendiente, día y turno desde `rounds` y —si existe— la salida en tee-sheet.
 */
export async function resolveEntryCaptureRound(
  supabase: SupabaseClient,
  params: {
    entryId: string;
    entryCategoryId: string | null;
    tournamentId: string;
    rounds: Array<RoundForGate & SessionRoundFields>;
    lookups: LockedScorecardLookups;
    tournamentSettings?: unknown;
    /** Ronda de la sesión en score-entry (día/turno del operador). */
    sessionRoundId?: string | null;
  }
): Promise<EntryCaptureRoundResult> {
  const open = resolveOpenCaptureRoundForEntry(
    params.entryId,
    params.entryCategoryId,
    params.rounds,
    params.lookups,
    params.tournamentSettings
  );

  if (!open.ok) return open;

  const entryCat = String(params.entryCategoryId ?? "").trim();
  const roundNo = open.roundNo;

  let roundId = open.roundId;

  const pairingRoundIds = new Set<string>();
  const { data: memberRows } = await supabase
    .from("pairing_group_members")
    .select("group_id")
    .eq("entry_id", params.entryId);

  const groupIds = (memberRows ?? [])
    .map((r) => String(r.group_id ?? "").trim())
    .filter(Boolean);

  if (groupIds.length > 0) {
    const { data: groupRows } = await supabase
      .from("pairing_groups")
      .select("round_id")
      .in("id", groupIds);

    for (const g of groupRows ?? []) {
      const rid = String(g.round_id ?? "").trim();
      if (rid) pairingRoundIds.add(rid);
    }
  }

  if (pairingRoundIds.size > 0) {
    const candidates = params.rounds.filter((r) => {
      if (r.round_no !== roundNo) return false;
      if (!pairingRoundIds.has(r.id)) return false;
      if (!entryCat) return true;
      const rc = String(r.category_id ?? "").trim();
      return !rc || rc === entryCat;
    });
    if (candidates.length === 1) {
      roundId = candidates[0]!.id;
    } else if (candidates.length > 1) {
      roundId =
        [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0]?.id ??
        roundId;
    }
  }

  const sessionRoundId = String(params.sessionRoundId ?? "").trim();
  if (sessionRoundId) {
    const fromSession = resolveEntryCategoryRoundId(
      params.rounds,
      sessionRoundId,
      entryCat || null
    );
    const sessionRow = params.rounds.find((r) => r.id === fromSession);
    if (sessionRow && sessionRow.round_no === roundNo) {
      roundId = fromSession;
    }
  }

  const roundRow =
    params.rounds.find((r) => r.id === roundId) ??
    getRoundForCategory(params.rounds, roundNo, entryCat || null);

  const sessionLabel = roundRow
    ? formatRoundSelectLabelShort(roundRow as SessionRoundFields)
    : undefined;

  return {
    ok: true,
    roundId,
    roundNo,
    sessionLabel,
    roundClosed: open.roundClosed,
  };
}
