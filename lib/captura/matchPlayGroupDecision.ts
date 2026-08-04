import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import {
  deriveMatchHolesFromStrokes,
  type DerivedMatchDecision,
} from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import { findBracketMatchForPairs } from "@/lib/matchplay/consolationMatchPlay";
import type { GroupMatchPlayProgressionRow } from "@/lib/captura/types";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { loadCourseLayoutForTournament } from "@/lib/matchplay/loadCourseLayout";
import { pairLowHighStrokes } from "@/lib/matchplay/scoring/lowHigh";
import {
  strokeIndexForHole,
  strokesReceivedOnHole,
} from "@/lib/leaderboard/handicapStrokes";
import {
  effectivePhForMatchEntry,
  type MatchEntryPhRow,
} from "@/lib/matchplay/resolveEntryPhForMatch";

export type GroupMatchPlayStatus = {
  decidedAtHole: number | null;
  resultText: string;
  holesRequired: number;
  viaPlayoff?: boolean;
  playoffHole?: number;
  needsPlayoff?: boolean;
  playoffPendingHole?: number;
  progression?: GroupMatchPlayProgressionRow[];
  topLabel?: string | null;
  bottomLabel?: string | null;
  topShort?: string | null;
  bottomShort?: string | null;
  strokesByEntry?: Record<string, Partial<Record<number, number>>>;
  phByEntry?: Record<string, number | null>;
  ballRoleByEntry?: Record<string, "baja" | "alta">;
  sideByEntry?: Record<string, "top" | "bottom">;
  topEntryIds?: string[];
  bottomEntryIds?: string[];
  matchplayMatchId?: string | null;
  matchplayCompleted?: boolean;
};

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  // Nombre + 1er apellido (sin segundo)
  return `${parts[0]} ${parts[1]}`;
}

function initialsOf(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]![0] ?? "") + (parts[1]![0] ?? "")).toUpperCase();
  }
  return (parts[0] ?? "—").slice(0, 2).toUpperCase();
}

/**
 * Etiqueta corta del estado del match tras un hoyo:
 *  - "AS" cuando empatados
 *  - "A+N" / "B+N" con iniciales de cada pareja (A=top, B=bottom)
 */
function buildProgression(
  top: number,
  bottom: number,
  topShort: string,
  botShort: string
): Pick<GroupMatchPlayProgressionRow, "label" | "lead"> {
  if (top === bottom) return { label: "AS", lead: "as" };
  if (top > bottom) {
    return {
      label: `${topShort}+${formatPts(top - bottom)}`,
      lead: "top",
    };
  }
  return {
    label: `${botShort}+${formatPts(bottom - top)}`,
    lead: "bottom",
  };
}

function formatDecisionLabel(decision: DerivedMatchDecision): string {
  const diffAbs = Math.abs(decision.top_total - decision.bottom_total);
  const lead = Number.isInteger(diffAbs)
    ? String(diffAbs)
    : diffAbs.toFixed(1).replace(/\.0$/, "");

  if (decision.via_playoff && decision.playoff_hole != null) {
    return `Desempate H${decision.playoff_hole} · ${lead} arriba`;
  }

  const pointsLeft = Math.max(0, 18 - decision.decided_at_hole) * 2;
  const tail = pointsLeft > 0 ? ` · ${pointsLeft} por jugar` : "";
  if (diffAbs === 0) {
    return `H${decision.decided_at_hole} · AS${tail}`;
  }
  return `H${decision.decided_at_hole} · ${lead} arriba${tail}`;
}

function liveResultText(
  topAcc: number,
  botAcc: number,
  holeNo: number,
  topLabel: string,
  botLabel: string
): string {
  if (topAcc === botAcc) {
    return `Empatados · H${holeNo} (${formatPts(topAcc)}-${formatPts(botAcc)})`;
  }
  const lead = Math.abs(topAcc - botAcc);
  const name = topAcc > botAcc ? topLabel : botLabel;
  return `${name} · ${formatPts(lead)} arriba · H${holeNo}`;
}

/**
 * Calcula golpes de ventaja por hoyo para los 4 jugadores del match
 * (bola baja vs baja, alta vs alta), sin depender de scores capturados.
 */
async function computeStrokesForMatch(
  admin: SupabaseClient,
  tournamentId: string,
  entryIds: [string, string, string, string]
): Promise<{
  strokesByEntry: Record<string, Partial<Record<number, number>>>;
  phByEntry: Record<string, number | null>;
  ballRoleByEntry: Record<string, "baja" | "alta">;
  sideByEntry: Record<string, "top" | "bottom">;
  names: Record<string, string>;
}> {
  const empty = {
    strokesByEntry: {} as Record<string, Partial<Record<number, number>>>,
    phByEntry: {} as Record<string, number | null>,
    ballRoleByEntry: {} as Record<string, "baja" | "alta">,
    sideByEntry: {} as Record<string, "top" | "bottom">,
    names: {} as Record<string, string>,
  };

  const [layout, handicapCtx, entriesRes] = await Promise.all([
    loadCourseLayoutForTournament(admin, tournamentId),
    loadTournamentHandicapContext(admin, tournamentId),
    admin
      .from("tournament_entries")
      .select(
        "id, player_id, category_id, handicap_index, playing_handicap, playing_handicap_override, players(first_name, last_name, gender, birth_year, handicap_index, handicap_torneo)"
      )
      .in("id", entryIds),
  ]);

  const byId = new Map(
    ((entriesRes.data ?? []) as Array<Record<string, unknown>>).map((e) => [
      String(e.id),
      e,
    ])
  );

  const phList: number[] = [];
  const names: Record<string, string> = {};

  for (const eid of entryIds) {
    const raw = byId.get(eid);
    const p = raw?.players;
    const player = (Array.isArray(p) ? p[0] : p) as {
      first_name?: string | null;
      last_name?: string | null;
      gender?: string | null;
      birth_year?: number | null;
      handicap_index?: number | null;
      handicap_torneo?: number | null;
    } | null;

    names[eid] = `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "—";

    if (!raw) {
      phList.push(0);
      continue;
    }
    const row: MatchEntryPhRow = {
      id: eid,
      player_id: String(raw.player_id ?? ""),
      category_id: (raw.category_id as string | null) ?? null,
      handicap_index:
        raw.handicap_index != null ? Number(raw.handicap_index) : null,
      playing_handicap:
        raw.playing_handicap != null ? Number(raw.playing_handicap) : null,
      playing_handicap_override:
        raw.playing_handicap_override != null
          ? Number(raw.playing_handicap_override)
          : null,
      player: player ?? null,
    };
    const ph = effectivePhForMatchEntry(row, handicapCtx);
    phList.push(ph != null && Number.isFinite(ph) ? Number(ph) : 0);
  }

  const phTuple = phList as [number, number, number, number];
  const relative = pairLowHighStrokes(phTuple);

  // Dentro de cada pareja: menor PH = baja.
  const topALow = phTuple[0] <= phTuple[1];
  const botALow = phTuple[2] <= phTuple[3];
  const roles: Array<"baja" | "alta"> = [
    topALow ? "baja" : "alta",
    topALow ? "alta" : "baja",
    botALow ? "baja" : "alta",
    botALow ? "alta" : "baja",
  ];
  const sides: Array<"top" | "bottom"> = ["top", "top", "bottom", "bottom"];

  const strokesByEntry: Record<string, Partial<Record<number, number>>> = {};
  const phByEntry: Record<string, number | null> = {};
  const ballRoleByEntry: Record<string, "baja" | "alta"> = {};
  const sideByEntry: Record<string, "top" | "bottom"> = {};

  entryIds.forEach((eid, i) => {
    phByEntry[eid] = phList[i] ?? 0;
    ballRoleByEntry[eid] = roles[i]!;
    sideByEntry[eid] = sides[i]!;
    const byHole: Partial<Record<number, number>> = {};
    for (let hole = 1; hole <= 18; hole++) {
      const si = strokeIndexForHole(hole, layout.strokeIndexByHole);
      const n = strokesReceivedOnHole(relative[i]!, si);
      if (n > 0) byHole[hole] = n;
    }
    // Desempate 19-27 = SI de 1-9
    for (let hole = 19; hole <= 27; hole++) {
      const src = hole - 18;
      const si = strokeIndexForHole(src, layout.strokeIndexByHole);
      const n = strokesReceivedOnHole(relative[i]!, si);
      if (n > 0) byHole[hole] = n;
    }
    strokesByEntry[eid] = byHole;
  });

  return {
    strokesByEntry,
    phByEntry,
    ballRoleByEntry,
    sideByEntry,
    names,
  };
}

/**
 * Si el grupo pertenece a un torneo match play (bola baja + alta),
 * devuelve estado del partido + ventajas por hoyo + progresión.
 * Aplica igual a Calcutta y Ryder (parejas).
 */
export async function loadGroupMatchPlayStatus(
  admin: SupabaseClient,
  groupId: string
): Promise<GroupMatchPlayStatus | null> {
  const gid = groupId.trim();
  if (!gid) return null;

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", gid)
    .maybeSingle();

  const roundId = String(groupRow?.round_id ?? "").trim();
  const groupNo =
    typeof groupRow?.group_no === "number" ? groupRow.group_no : null;
  if (!roundId || groupNo == null) return null;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const tournamentId = String(roundRow?.tournament_id ?? "").trim();
  if (!tournamentId) return null;

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (rules?.pair_format !== "low_high") return null;

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const matchId = `derived-${roundId}-g${groupNo}`;
  const match = derived.matches.find((m) => m.id === matchId);
  if (
    !match ||
    !match.top_a_entry_id ||
    !match.top_b_entry_id ||
    !match.bottom_a_entry_id ||
    !match.bottom_b_entry_id
  ) {
    return null;
  }

  const topEntryIds = [match.top_a_entry_id, match.top_b_entry_id];
  const bottomEntryIds = [match.bottom_a_entry_id, match.bottom_b_entry_id];
  const entryIds = [
    match.top_a_entry_id,
    match.top_b_entry_id,
    match.bottom_a_entry_id,
    match.bottom_b_entry_id,
  ] as [string, string, string, string];

  // Match real en cuadro (cierre / avance).
  let matchplayMatchId: string | null = null;
  let matchplayCompleted = false;
  if (match.top_pair_id && match.bottom_pair_id) {
    const { data: mainBracket } = await admin
      .from("matchplay_brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .neq("name", "Consolación Match Play")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mainBracket?.id) {
      const ref = await findBracketMatchForPairs(admin, {
        tournamentId,
        mainBracketId: String(mainBracket.id),
        roundNo: match.round_no,
        topPairId: match.top_pair_id,
        bottomPairId: match.bottom_pair_id,
      });
      if (ref) {
        const { data: real } = await admin
          .from("matchplay_matches")
          .select("id, status")
          .eq("id", ref.id)
          .maybeSingle();
        if (real) {
          matchplayMatchId = String(real.id);
          matchplayCompleted = real.status === "completed";
        }
      }
    }
  }

  // Ventajas + nombres (siempre; aunque aún no haya scores).
  let strokePack: Awaited<ReturnType<typeof computeStrokesForMatch>>;
  try {
    strokePack = await computeStrokesForMatch(admin, tournamentId, entryIds);
  } catch {
    strokePack = {
      strokesByEntry: {},
      phByEntry: {},
      ballRoleByEntry: {},
      sideByEntry: {},
      names: {},
    };
  }

  const topNames = topEntryIds.map(
    (id) => strokePack.names[id] ?? "—"
  );
  const botNames = bottomEntryIds.map(
    (id) => strokePack.names[id] ?? "—"
  );
  const topLabel = topNames.map(shortName).join(" / ");
  const bottomLabel = botNames.map(shortName).join(" / ");
  const topShort = initialsOf(topNames[0] ?? "A");
  const bottomShort = initialsOf(botNames[0] ?? "B");

  const baseFields = {
    topLabel,
    bottomLabel,
    topShort,
    bottomShort,
    strokesByEntry: strokePack.strokesByEntry,
    phByEntry: strokePack.phByEntry,
    ballRoleByEntry: strokePack.ballRoleByEntry,
    sideByEntry: strokePack.sideByEntry,
    topEntryIds,
    bottomEntryIds,
    matchplayMatchId,
    matchplayCompleted,
  };

  const { decisions, summaries, holes } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    [match]
  );
  const decision = decisions.get(matchId);
  const summary = summaries.get(matchId);

  const matchHoles = holes
    .filter((h) => h.match_id === matchId)
    .sort((a, b) => a.hole_no - b.hole_no);
  let topAcc = 0;
  let bottomAcc = 0;
  const progression: GroupMatchPlayProgressionRow[] = [];
  for (const h of matchHoles) {
    if (
      decision?.decided_at_hole != null &&
      h.hole_no > decision.decided_at_hole &&
      h.top_points === 0 &&
      h.bottom_points === 0
    ) {
      continue;
    }
    // Sólo hoyos con score real (o puntos no triviales / con captura)
    if (h.top_points == null && h.bottom_points == null) continue;

    topAcc += Number(h.top_points ?? 0);
    bottomAcc += Number(h.bottom_points ?? 0);
    const prog = buildProgression(
      topAcc,
      bottomAcc,
      topShort,
      bottomShort
    );
    progression.push({
      hole_no: h.hole_no,
      top_cum: topAcc,
      bottom_cum: bottomAcc,
      label: prog.label,
      lead: prog.lead,
    });
  }

  if (decision?.decided_at_hole) {
    return {
      decidedAtHole: decision.decided_at_hole,
      resultText: formatDecisionLabel(decision),
      holesRequired: decision.decided_at_hole,
      viaPlayoff: decision.via_playoff,
      playoffHole: decision.playoff_hole,
      progression,
      ...baseFields,
    };
  }

  if (summary?.needs_playoff) {
    const pending = summary.playoff_pending_hole;
    return {
      decidedAtHole: null,
      resultText:
        pending != null
          ? `Desempate P${pending} · faltan scores para calcular puntos`
          : "Empate al 18 — definiendo en desempate",
      holesRequired: 18,
      needsPlayoff: true,
      playoffPendingHole: pending,
      progression,
      ...baseFields,
    };
  }

  if (progression.length > 0) {
    const last = progression[progression.length - 1]!;
    return {
      decidedAtHole: null,
      resultText: liveResultText(
        last.top_cum,
        last.bottom_cum,
        last.hole_no,
        topLabel,
        bottomLabel
      ),
      holesRequired: 18,
      progression,
      ...baseFields,
    };
  }

  // Sin scores: igual devolvemos ventajas + etiquetas para la mini app.
  return {
    decidedAtHole: null,
    resultText: "Match aún sin puntos",
    holesRequired: 18,
    progression: [],
    ...baseFields,
  };
}
