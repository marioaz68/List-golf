import {
  isCategoryRoundFullyClosed,
  type RoundForGate,
  type TournamentEntryForGate,
} from "@/lib/rounds/categoryRoundGate";
import type { LockedScorecardLookups } from "@/lib/leaderboard/lockedScorecards";
import type { TournamentSettings } from "@/types/tournament";

export type RoundClosuresMap = Record<string, string>;

export type TournamentSettingsWithClosures = TournamentSettings & {
  round_closures?: RoundClosuresMap;
};

export function getRoundClosures(
  settings: unknown
): RoundClosuresMap {
  if (!settings || typeof settings !== "object") return {};
  const raw = (settings as TournamentSettingsWithClosures).round_closures;
  if (!raw || typeof raw !== "object") return {};
  const out: RoundClosuresMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      out[String(key)] = value.trim();
    }
  }
  return out;
}

export function isTournamentRoundOfficiallyClosed(
  settings: unknown,
  roundNo: number
): boolean {
  if (!Number.isFinite(roundNo) || roundNo < 1) return false;
  return Boolean(getRoundClosures(settings)[String(roundNo)]);
}

export function mergeRoundClosure(
  settings: unknown,
  roundNo: number,
  closedAtIso: string
): TournamentSettingsWithClosures {
  const base =
    settings && typeof settings === "object"
      ? { ...(settings as TournamentSettings) }
      : {};
  const closures = getRoundClosures(base);
  return {
    ...base,
    round_closures: {
      ...closures,
      [String(roundNo)]: closedAtIso,
    },
  };
}

/** Todas las categorías con inscritos activos tienen la ronda cerrada (tarjetas locked). */
export function isTournamentRoundReadyToConfirm(
  entries: TournamentEntryForGate[],
  rounds: RoundForGate[],
  roundNo: number,
  lookups: LockedScorecardLookups
): boolean {
  const categoryIds = [
    ...new Set(
      entries
        .map((e) => String(e.category_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  if (categoryIds.length === 0) {
    return isCategoryRoundFullyClosed(entries, rounds, roundNo, null, lookups);
  }

  return categoryIds.every((categoryId) =>
    isCategoryRoundFullyClosed(entries, rounds, roundNo, categoryId, lookups)
  );
}

export type TournamentRoundCloseStatus = {
  roundNo: number;
  readyToConfirm: boolean;
  officiallyClosed: boolean;
  closedAt: string | null;
};

export function buildTournamentRoundCloseStatus(
  entries: TournamentEntryForGate[],
  rounds: RoundForGate[],
  roundNo: number,
  settings: unknown,
  lookups: LockedScorecardLookups
): TournamentRoundCloseStatus {
  const officiallyClosed = isTournamentRoundOfficiallyClosed(settings, roundNo);
  return {
    roundNo,
    readyToConfirm: isTournamentRoundReadyToConfirm(
      entries,
      rounds,
      roundNo,
      lookups
    ),
    officiallyClosed,
    closedAt: getRoundClosures(settings)[String(roundNo)] ?? null,
  };
}
