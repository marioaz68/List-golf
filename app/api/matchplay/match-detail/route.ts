import { NextResponse } from "next/server";
import { loadMatchForScoring } from "@/lib/matchplay/loadMatchForScoring";
import {
  isDerivedMatchId,
  loadDerivedMatchDetail,
} from "@/lib/matchplay/loadDerivedMatchDetail";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Detalle público de un match (live + breakdown por hoyo).
 *
 * GET /api/matchplay/match-detail?match_id=<uuid|derived-...>&tournament_id=<uuid>
 *
 * - match_id UUID: match oficial en `matchplay_matches`.
 * - match_id derived-*: match desde salidas + hole_scores (requiere tournament_id).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = (url.searchParams.get("match_id") ?? "").trim();
  const tournamentId = (url.searchParams.get("tournament_id") ?? "").trim();

  if (!matchId) {
    return NextResponse.json(
      { ok: false, error: "match_id requerido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (isDerivedMatchId(matchId)) {
    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "tournament_id requerido para match derivado" },
        { status: 400 }
      );
    }

    const { data: tournament } = await admin
      .from("tournaments")
      .select("is_public")
      .eq("id", tournamentId)
      .maybeSingle();

    if (!tournament || tournament.is_public === false) {
      return NextResponse.json(
        { ok: false, error: "no disponible" },
        { status: 404 }
      );
    }

    const derived = await loadDerivedMatchDetail(admin, tournamentId, matchId);
    if (!derived) {
      return NextResponse.json(
        { ok: false, error: "match derivado no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, match: derived });
  }

  const { data: mp } = await admin
    .from("matchplay_matches")
    .select("tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!mp) {
    return NextResponse.json(
      { ok: false, error: "match no encontrado" },
      { status: 404 }
    );
  }

  const { data: tournament } = await admin
    .from("tournaments")
    .select("is_public")
    .eq("id", mp.tournament_id)
    .maybeSingle();

  if (tournament?.is_public === false) {
    return NextResponse.json(
      { ok: false, error: "no disponible" },
      { status: 404 }
    );
  }

  const match = await loadMatchForScoring(matchId);
  if (!match) {
    return NextResponse.json(
      { ok: false, error: "scoring no disponible" },
      { status: 404 }
    );
  }

  const { data: parRows } = await admin
    .from("tournament_holes")
    .select("hole_number, par")
    .eq("tournament_id", match.tournament_id);
  const parByHole = new Map<number, number>();
  for (const r of (parRows ?? []) as Array<{
    hole_number: number;
    par: number | null;
  }>) {
    if (r.par != null && Number.isFinite(Number(r.par))) {
      parByHole.set(r.hole_number, Number(r.par));
    }
  }

  let topAcc = 0;
  let bottomAcc = 0;
  const lineByHole = match.holes.map((h) => {
    const tp = Number(h.top_points ?? 0);
    const bp = Number(h.bottom_points ?? 0);
    const hasScore =
      h.top_points != null ||
      h.bottom_points != null ||
      h.top_player_a_strokes != null ||
      h.top_player_b_strokes != null ||
      h.bottom_player_a_strokes != null ||
      h.bottom_player_b_strokes != null;
    if (hasScore) {
      topAcc += tp;
      bottomAcc += bp;
    }
    return {
      hole_no: h.hole_no,
      has_score: hasScore,
      top_points: hasScore ? tp : null,
      bottom_points: hasScore ? bp : null,
      top_cum: hasScore ? topAcc : null,
      bottom_cum: hasScore ? bottomAcc : null,
      match_status_after: h.match_status_after,
      top_player_a_strokes: h.top_player_a_strokes,
      top_player_b_strokes: h.top_player_b_strokes,
      bottom_player_a_strokes: h.bottom_player_a_strokes,
      bottom_player_b_strokes: h.bottom_player_b_strokes,
      breakdown: h.detail_json?.breakdown ?? null,
      stroke_index: match.stroke_index_by_hole.get(h.hole_no) ?? null,
      par: parByHole.get(h.hole_no) ?? null,
    };
  });

  const lastHolePlayed = lineByHole
    .filter((h) => h.has_score)
    .reduce((max, h) => Math.max(max, h.hole_no), 0);

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      round_no: match.round_no,
      position_no: match.position_no,
      status: match.status,
      result_text: match.result_text,
      top_label: match.top_label,
      bottom_label: match.bottom_label,
      top_players: match.top_players,
      bottom_players: match.bottom_players,
      pair_format: match.pair_format,
      allowance_pct: match.allowance_pct,
      holes_in_match: match.holes_in_match,
      last_hole_played: lastHolePlayed,
      top_total: topAcc,
      bottom_total: bottomAcc,
      holes: lineByHole,
    },
  });
}
