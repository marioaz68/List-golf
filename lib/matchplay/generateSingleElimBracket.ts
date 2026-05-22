import {
  bracketCapacity,
  firstRoundSeedPairs,
  roundCountForBracketSize,
} from "./bracketUtils";
import { assignSeedNumbers, sortTeamsForSeeding } from "./sortTeamsForSeeding";
import type { MatchPlaySeedingMethod } from "./types";
import type { MatchPlayTeamRow } from "./teamTypes";

export type GeneratedMatch = {
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: "scheduled" | "bye" | "completed";
  result_text: string | null;
  _key: string;
  _next_key: string | null;
};

export type GenerateBracketResult = {
  bracketSize: number;
  roundCount: number;
  teamCount: number;
  byeCount: number;
  matches: GeneratedMatch[];
  seedAssignments: Array<{ team_id: string; seed: number }>;
};

function resolveBye(m: GeneratedMatch) {
  const top = m.top_pair_id;
  const bottom = m.bottom_pair_id;
  if (top && !bottom) {
    m.winner_pair_id = top;
    m.status = "bye";
    m.result_text = "BYE";
  } else if (!top && bottom) {
    m.winner_pair_id = bottom;
    m.status = "bye";
    m.result_text = "BYE";
  } else if (!top && !bottom) {
    m.status = "bye";
    m.result_text = "Vacío";
  }
}

function advanceWinners(
  roundMatches: GeneratedMatch[][],
  fromRound: number
) {
  const current = roundMatches[fromRound];
  const next = roundMatches[fromRound + 1];
  if (!next) return;

  for (let p = 0; p < current.length; p++) {
    const m = current[p];
    if (!m.winner_pair_id) continue;
    const nextMatch = next[Math.floor(p / 2)];
    if (!nextMatch) continue;
    if (p % 2 === 0) {
      nextMatch.top_pair_id = m.winner_pair_id;
    } else {
      nextMatch.bottom_pair_id = m.winner_pair_id;
    }
  }

  for (const nm of next) {
    resolveBye(nm);
  }
}

export function generateSingleElimBracket(params: {
  teams: MatchPlayTeamRow[];
  seeding_method: MatchPlaySeedingMethod;
  max_bracket_size?: number | null;
}): GenerateBracketResult {
  const { teams, seeding_method } = params;
  const maxCap = params.max_bracket_size ?? 64;

  if (teams.length < 2) {
    throw new Error("Se necesitan al menos 2 equipos para generar el cuadro.");
  }

  const ordered = assignSeedNumbers(
    sortTeamsForSeeding(teams, seeding_method)
  );
  const bracketSize = bracketCapacity(ordered.length, maxCap);
  const roundCount = roundCountForBracketSize(bracketSize);
  const pairs = firstRoundSeedPairs(bracketSize);

  const slots: Array<string | null> = new Array(bracketSize).fill(null);
  for (let i = 0; i < ordered.length; i++) {
    slots[i] = ordered[i].id;
  }

  const roundMatches: GeneratedMatch[][] = [];
  roundMatches[0] = [];

  for (let r = 1; r <= roundCount; r++) {
    const count = bracketSize / Math.pow(2, r);
    roundMatches[r] = [];
    for (let p = 0; p < count; p++) {
      const nextKey = r < roundCount ? `r${r + 1}-p${Math.floor(p / 2)}` : null;
      roundMatches[r].push({
        round_no: r,
        position_no: p + 1,
        top_pair_id: null,
        bottom_pair_id: null,
        winner_pair_id: null,
        status: "scheduled",
        result_text: null,
        _key: `r${r}-p${p}`,
        _next_key: nextKey,
      });
    }
  }

  const r1 = roundMatches[1];
  for (let p = 0; p < pairs.length; p++) {
    const [topSeed, bottomSeed] = pairs[p];
    const m = r1[p];
    m.top_pair_id = slots[topSeed - 1] ?? null;
    m.bottom_pair_id = slots[bottomSeed - 1] ?? null;
    resolveBye(m);
  }

  for (let r = 1; r < roundCount; r++) {
    advanceWinners(roundMatches, r);
  }

  const matches: GeneratedMatch[] = [];
  for (let r = 1; r <= roundCount; r++) {
    matches.push(...roundMatches[r]);
  }

  const byeCount = r1.filter((m) => m.status === "bye").length;

  return {
    bracketSize,
    roundCount,
    teamCount: ordered.length,
    byeCount,
    matches,
    seedAssignments: ordered.map((t, i) => ({
      team_id: t.id,
      seed: i + 1,
    })),
  };
}
