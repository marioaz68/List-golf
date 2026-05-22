"use client";

import { useMemo, useState } from "react";
import {
  scoreLowHighHole,
  aggregateLowHighTotals,
  formatLowHighMatchStatus,
} from "@/lib/matchplay/scoring/lowHigh";
import type { MatchForScoring } from "@/lib/matchplay/loadMatchForScoring";
import { saveLowHighMatchScores } from "./actions";

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "11px",
  cursor: "pointer",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #14532d",
};

const inputClass =
  "h-7 w-10 rounded border border-white/20 bg-[#0f172a] px-1 text-center text-[11px] text-white";

type HoleState = {
  hole_no: number;
  top_player_a_strokes: number | null;
  top_player_b_strokes: number | null;
  bottom_player_a_strokes: number | null;
  bottom_player_b_strokes: number | null;
};

function parseStroke(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 15) return null;
  return Math.round(n);
}

export default function MatchPlayLowHighScorePanel({
  match,
  flashStatus,
  flashMessage,
}: {
  match: MatchForScoring;
  flashStatus?: string | null;
  flashMessage?: string | null;
}) {
  const [holes, setHoles] = useState<HoleState[]>(() =>
    match.holes.map((h) => ({
      hole_no: h.hole_no,
      top_player_a_strokes: h.top_player_a_strokes,
      top_player_b_strokes: h.top_player_b_strokes,
      bottom_player_a_strokes: h.bottom_player_a_strokes,
      bottom_player_b_strokes: h.bottom_player_b_strokes,
    }))
  );

  const hiTuple: [number, number, number, number] = useMemo(
    () => [
      match.top_players[0].hi,
      match.top_players[1].hi,
      match.bottom_players[0].hi,
      match.bottom_players[1].hi,
    ],
    [match]
  );

  const preview = useMemo(() => {
    let topRunning = 0;
    let bottomRunning = 0;
    const rows: Array<{
      hole_no: number;
      top_pts: number | null;
      bottom_pts: number | null;
      status: string | null;
      breakdown: string | null;
    }> = [];

    for (const h of holes) {
      const gross = {
        top_a: h.top_player_a_strokes,
        top_b: h.top_player_b_strokes,
        bottom_a: h.bottom_player_a_strokes,
        bottom_b: h.bottom_player_b_strokes,
      };
      if (
        gross.top_a == null ||
        gross.top_b == null ||
        gross.bottom_a == null ||
        gross.bottom_b == null
      ) {
        rows.push({
          hole_no: h.hole_no,
          top_pts: null,
          bottom_pts: null,
          status: null,
          breakdown: null,
        });
        continue;
      }

      const r = scoreLowHighHole({
        hole_no: h.hole_no,
        gross,
        hi: hiTuple,
        allowance_pct: match.allowance_pct,
        strokeIndexByHole: match.stroke_index_by_hole,
        top_total_before: topRunning,
        bottom_total_before: bottomRunning,
        holes_in_match: match.holes_in_match,
      });

      if (!r) continue;

      topRunning += r.top_points;
      bottomRunning += r.bottom_points;

      const b = r.breakdown;
      rows.push({
        hole_no: h.hole_no,
        top_pts: r.top_points,
        bottom_pts: r.bottom_points,
        status: r.match_status_after,
        breakdown: `Baja ${b.top.low}→${formatPts(b.top.low_pts)} · Alta ${b.top.high}→${formatPts(b.top.high_pts)} | vs Baja ${b.bottom.low} · Alta ${b.bottom.high}`,
      });
    }

    const totals = aggregateLowHighTotals(
      rows
        .filter((r) => r.top_pts != null && r.bottom_pts != null)
        .map((r) => ({
          top_points: r.top_pts!,
          bottom_points: r.bottom_pts!,
        }))
    );

    return {
      rows,
      totals,
      status: formatLowHighMatchStatus(
        totals.top,
        totals.bottom,
        rows.filter((r) => r.top_pts != null).length,
        match.holes_in_match
      ),
    };
  }, [holes, hiTuple, match]);

  function updateHole(
    holeNo: number,
    field: keyof Omit<HoleState, "hole_no">,
    value: string
  ) {
    setHoles((prev) =>
      prev.map((h) =>
        h.hole_no === holeNo ? { ...h, [field]: parseStroke(value) } : h
      )
    );
  }

  return (
    <div className="space-y-3">
      {flashMessage ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[12px] text-cyan-100">
        <p>
          <strong>Hándicap:</strong> {match.allowance_pct}% por jugador · relativo
          al más bajo del partido.
        </p>
        <p className="mt-1">
          <strong>Marcador:</strong> {preview.status || "Sin hoyos completos"}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Cada hoyo: 1 pt bola baja neta vs baja · 1 pt bola alta neta vs alta (máx.
          2 pts por equipo).
        </p>
      </div>

      <form action={saveLowHighMatchScores}>
        <input type="hidden" name="tournament_id" value={match.tournament_id} />
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="holes_json" value={JSON.stringify(holes)} />

        <div
          className="overflow-x-auto rounded border border-white/10"
          style={{ maxHeight: "70vh" }}
        >
          <table className="min-w-[720px] w-full border-collapse text-[10px] text-slate-200">
            <thead className="sticky top-0 z-10 bg-[#1e293b]">
              <tr>
                <th className="border border-white/10 px-1 py-1">Hoyo</th>
                <th
                  colSpan={2}
                  className="border border-white/10 px-1 py-1 text-cyan-300"
                >
                  {match.top_label}
                </th>
                <th
                  colSpan={2}
                  className="border border-white/10 px-1 py-1 text-amber-300"
                >
                  {match.bottom_label}
                </th>
                <th className="border border-white/10 px-1 py-1">Pts</th>
                <th className="border border-white/10 px-1 py-1">Detalle</th>
              </tr>
              <tr className="text-[9px] text-slate-500">
                <th className="border border-white/10 px-1" />
                <th className="border border-white/10 px-1">
                  {match.top_players[0].label} (HI {match.top_players[0].hi})
                </th>
                <th className="border border-white/10 px-1">
                  {match.top_players[1].label} (HI {match.top_players[1].hi})
                </th>
                <th className="border border-white/10 px-1">
                  {match.bottom_players[0].label} (HI{" "}
                  {match.bottom_players[0].hi})
                </th>
                <th className="border border-white/10 px-1">
                  {match.bottom_players[1].label} (HI{" "}
                  {match.bottom_players[1].hi})
                </th>
                <th className="border border-white/10 px-1" />
                <th className="border border-white/10 px-1" />
              </tr>
            </thead>
            <tbody>
              {holes.map((h) => {
                const row = preview.rows.find((r) => r.hole_no === h.hole_no);
                return (
                  <tr key={h.hole_no} className="bg-[#0f172a]">
                    <td className="border border-white/10 px-1 py-0.5 text-center font-semibold">
                      {h.hole_no}
                    </td>
                    <td className="border border-white/10 px-1 py-0.5">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        className={inputClass}
                        value={h.top_player_a_strokes ?? ""}
                        onChange={(e) =>
                          updateHole(
                            h.hole_no,
                            "top_player_a_strokes",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="border border-white/10 px-1 py-0.5">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        className={inputClass}
                        value={h.top_player_b_strokes ?? ""}
                        onChange={(e) =>
                          updateHole(
                            h.hole_no,
                            "top_player_b_strokes",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="border border-white/10 px-1 py-0.5">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        className={inputClass}
                        value={h.bottom_player_a_strokes ?? ""}
                        onChange={(e) =>
                          updateHole(
                            h.hole_no,
                            "bottom_player_a_strokes",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="border border-white/10 px-1 py-0.5">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        className={inputClass}
                        value={h.bottom_player_b_strokes ?? ""}
                        onChange={(e) =>
                          updateHole(
                            h.hole_no,
                            "bottom_player_b_strokes",
                            e.target.value
                          )
                        }
                      />
                    </td>
                    <td className="border border-white/10 px-1 py-0.5 text-center text-amber-300">
                      {row?.top_pts != null
                        ? `${formatPts(row.top_pts)}–${formatPts(row.bottom_pts ?? 0)}`
                        : "—"}
                    </td>
                    <td className="border border-white/10 px-1 py-0.5 text-[9px] text-slate-500 max-w-[200px] truncate">
                      {row?.breakdown ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" style={buttonStyle}>
            Guardar avance
          </button>
          <button
            type="submit"
            name="finalize"
            value="1"
            style={primaryStyle}
            onClick={(e) => {
              if (
                !confirm(
                  "¿Cerrar el partido con el marcador actual y registrar al ganador en el cuadro?"
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            Guardar y cerrar partido
          </button>
        </div>
      </form>
    </div>
  );
}

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}
