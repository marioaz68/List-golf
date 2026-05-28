"use client";

import { useEffect, useState } from "react";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";

type PlayerInfo = {
  label: string;
  hi: number;
  ph: number | null;
};

type HoleDetail = {
  hole_no: number;
  has_score: boolean;
  top_points: number | null;
  bottom_points: number | null;
  top_cum: number | null;
  bottom_cum: number | null;
  match_status_after: string | null;
  top_player_a_strokes: number | null;
  top_player_b_strokes: number | null;
  bottom_player_a_strokes: number | null;
  bottom_player_b_strokes: number | null;
  breakdown: {
    top: { low: number; high: number; low_pts: number; high_pts: number };
    bottom: { low: number; high: number; low_pts: number; high_pts: number };
    nets: { top_a: number; top_b: number; bottom_a: number; bottom_b: number };
  } | null;
  stroke_index: number | null;
};

type MatchDetail = {
  id: string;
  round_no: number;
  position_no: number;
  status: string;
  result_text: string | null;
  top_label: string;
  bottom_label: string;
  top_players: [PlayerInfo, PlayerInfo];
  bottom_players: [PlayerInfo, PlayerInfo];
  pair_format: string;
  allowance_pct: number;
  holes_in_match: number;
  last_hole_played: number;
  top_total: number;
  bottom_total: number;
  holes: HoleDetail[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  matchId: string | null;
  /** true cuando es un match derivado de pairings (scoring desde hole_scores). */
  isDerived: boolean;
  topTeam: MatchPlayTeamRow | null;
  bottomTeam: MatchPlayTeamRow | null;
  roundLabel?: string;
  positionNo: number;
  holesPerMatch: number;
};

function fmtPts(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function fmtPh(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

export default function MatchDetailModal({
  open,
  onClose,
  tournamentId,
  matchId,
  isDerived,
  topTeam,
  bottomTeam,
  roundLabel,
  positionNo,
  holesPerMatch,
}: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError(null);
      return;
    }
    if (!matchId) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      match_id: matchId,
      tournament_id: tournamentId,
    });
    fetch(`/api/matchplay/match-detail?${params.toString()}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as
          | { ok: true; match: MatchDetail }
          | { ok: false; error: string }
          | null;
        if (cancelled) return;
        if (!r.ok || !j || j.ok === false) {
          setError((j && "error" in j && j.error) || "No se pudo cargar el detalle.");
          setDetail(null);
        } else {
          setDetail(j.match);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error de red");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, matchId, tournamentId, isDerived]);

  if (!open) return null;

  // Fallback de jugadores desde los teams cuando el match es derivado
  // (sin scoring real todavía).
  const fallbackTopPlayers: PlayerInfo[] = isDerived
    ? [topTeam?.player_a, topTeam?.player_b].filter(Boolean).map((e) => ({
        label: formatPlayerName(e!.player),
        hi: Number(e!.effective_hi ?? e!.player.handicap_index ?? 0),
        ph:
          e!.playing_handicap != null
            ? Number(e!.playing_handicap)
            : e!.course_handicap != null
              ? Number(e!.course_handicap)
              : null,
      }))
    : [];
  const fallbackBottomPlayers: PlayerInfo[] = isDerived
    ? [bottomTeam?.player_a, bottomTeam?.player_b].filter(Boolean).map((e) => ({
        label: formatPlayerName(e!.player),
        hi: Number(e!.effective_hi ?? e!.player.handicap_index ?? 0),
        ph:
          e!.playing_handicap != null
            ? Number(e!.playing_handicap)
            : e!.course_handicap != null
              ? Number(e!.course_handicap)
              : null,
      }))
    : [];

  const topPlayers = detail?.top_players ?? fallbackTopPlayers;
  const bottomPlayers = detail?.bottom_players ?? fallbackBottomPlayers;
  const topName = detail?.top_label ?? topTeam?.team_name ?? "Equipo Top";
  const bottomName = detail?.bottom_label ?? bottomTeam?.team_name ?? "Equipo Bottom";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#0c1728] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-white/10 bg-[#0c1728]/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">
              {roundLabel ?? `R${detail?.round_no ?? "?"}`} · M{positionNo}
            </div>
            <h2 className="mt-0.5 truncate text-lg font-extrabold">
              {topName} <span className="text-slate-500">vs</span> {bottomName}
            </h2>
            {detail?.result_text ? (
              <p className="mt-0.5 text-[11px] font-bold text-emerald-300">
                {detail.result_text}
              </p>
            ) : null}
            {detail ? (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {detail.last_hole_played > 0
                  ? `Va en hoyo ${detail.last_hole_played} de ${detail.holes_in_match} · Allowance ${detail.allowance_pct}%`
                  : `Aún no inicia · Allowance ${detail.allowance_pct}%`}
                {isDerived ? (
                  <span className="text-amber-200">
                    {" "}
                    · Calculado desde captura de tarjetas
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-semibold hover:bg-white/20"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-3 py-3 sm:px-4">
          {loading ? (
            <div className="rounded border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              Cargando detalle…
            </div>
          ) : null}
          {error ? (
            <div className="rounded border border-rose-400/40 bg-rose-950/30 p-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {/* Marcador grande */}
          <section className="grid grid-cols-2 gap-2">
            <ScoreboardSide
              name={topName}
              players={topPlayers}
              total={detail ? detail.top_total : 0}
              tone="top"
            />
            <ScoreboardSide
              name={bottomName}
              players={bottomPlayers}
              total={detail ? detail.bottom_total : 0}
              tone="bottom"
            />
          </section>

          {/* Gráfica de puntos acumulados */}
          {detail ? (
            <section>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Marcador hoyo por hoyo
              </h3>
              <PointsChart
                holes={detail.holes}
                holesInMatch={detail.holes_in_match}
                topLabel={topName}
                bottomLabel={bottomName}
              />
            </section>
          ) : null}

          {/* Tabla de hoyos */}
          {detail ? (
            <section>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Detalle por hoyo
              </h3>
              <HoleTable
                holes={detail.holes}
                topPlayers={topPlayers}
                bottomPlayers={bottomPlayers}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoreboardSide({
  name,
  players,
  total,
  tone,
}: {
  name: string;
  players: PlayerInfo[];
  total: number;
  tone: "top" | "bottom";
}) {
  const color = tone === "top" ? "border-cyan-400/40 bg-cyan-950/30" : "border-fuchsia-400/40 bg-fuchsia-950/20";
  const dot = tone === "top" ? "bg-cyan-400" : "bg-fuchsia-400";
  return (
    <div className={`rounded-xl border p-2.5 ${color}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 truncate">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate text-[12px] font-bold">{name}</span>
        </div>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[14px] font-extrabold">
          {fmtPts(total)}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px]">
        {players.length === 0 ? (
          <li className="italic text-slate-500">Por definir</li>
        ) : (
          players.map((p, i) => (
            <li key={`${p.label}-${i}`} className="flex items-center justify-between gap-1">
              <span className="truncate">{p.label}</span>
              <span className="shrink-0 text-slate-300">
                HI {Number.isFinite(p.hi) ? p.hi.toFixed(1) : "—"} · PH {fmtPh(p.ph)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PointsChart({
  holes,
  holesInMatch,
  topLabel,
  bottomLabel,
}: {
  holes: HoleDetail[];
  holesInMatch: number;
  topLabel: string;
  bottomLabel: string;
}) {
  const width = 720;
  const height = 200;
  const padL = 32;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // Sólo hoyos con score, empezando en 0.
  const played = holes.filter((h) => h.has_score);
  const maxY = Math.max(
    2,
    ...played.map((h) =>
      Math.max(
        Number(h.top_cum ?? 0),
        Number(h.bottom_cum ?? 0)
      )
    )
  );

  function xFor(hole: number): number {
    return padL + (innerW * hole) / holesInMatch;
  }
  function yFor(val: number): number {
    return padT + innerH - (innerH * val) / maxY;
  }

  const topPath = [
    `M ${xFor(0)} ${yFor(0)}`,
    ...played.map((h) => `L ${xFor(h.hole_no)} ${yFor(Number(h.top_cum ?? 0))}`),
  ].join(" ");
  const bottomPath = [
    `M ${xFor(0)} ${yFor(0)}`,
    ...played.map((h) => `L ${xFor(h.hole_no)} ${yFor(Number(h.bottom_cum ?? 0))}`),
  ].join(" ");

  // Cuadrícula horizontal.
  const yTicks: number[] = [];
  for (let v = 0; v <= maxY; v += Math.max(1, Math.ceil(maxY / 4))) {
    yTicks.push(v);
  }
  if (yTicks[yTicks.length - 1] !== maxY) yTicks.push(maxY);

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1220] p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
        {/* Ejes / grid */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="2 3"
            />
            <text
              x={padL - 6}
              y={yFor(v) + 3}
              fontSize={9}
              textAnchor="end"
              fill="rgba(148,163,184,0.85)"
            >
              {v}
            </text>
          </g>
        ))}
        {/* Hoyo ticks */}
        {Array.from({ length: holesInMatch }, (_, i) => i + 1).map((h) => (
          <g key={h}>
            <line
              x1={xFor(h)}
              x2={xFor(h)}
              y1={padT + innerH}
              y2={padT + innerH + 3}
              stroke="rgba(148,163,184,0.6)"
            />
            {h % 3 === 0 || h === 1 || h === holesInMatch ? (
              <text
                x={xFor(h)}
                y={padT + innerH + 14}
                fontSize={9}
                textAnchor="middle"
                fill="rgba(148,163,184,0.85)"
              >
                {h}
              </text>
            ) : null}
          </g>
        ))}

        {/* Líneas */}
        {played.length > 0 ? (
          <>
            <path
              d={topPath}
              fill="none"
              stroke="rgb(34,211,238)"
              strokeWidth={2.2}
            />
            <path
              d={bottomPath}
              fill="none"
              stroke="rgb(232,121,249)"
              strokeWidth={2.2}
            />
            {played.map((h) => (
              <g key={`pts-${h.hole_no}`}>
                <circle
                  cx={xFor(h.hole_no)}
                  cy={yFor(Number(h.top_cum ?? 0))}
                  r={2.8}
                  fill="rgb(34,211,238)"
                />
                <circle
                  cx={xFor(h.hole_no)}
                  cy={yFor(Number(h.bottom_cum ?? 0))}
                  r={2.8}
                  fill="rgb(232,121,249)"
                />
              </g>
            ))}
          </>
        ) : (
          <text
            x={padL + innerW / 2}
            y={padT + innerH / 2}
            fontSize={11}
            textAnchor="middle"
            fill="rgba(148,163,184,0.7)"
          >
            Aún no hay hoyos capturados.
          </text>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-cyan-400" /> {topLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-fuchsia-400" /> {bottomLabel}
        </span>
      </div>
    </div>
  );
}

function HoleTable({
  holes,
  topPlayers,
  bottomPlayers,
}: {
  holes: HoleDetail[];
  topPlayers: PlayerInfo[];
  bottomPlayers: PlayerInfo[];
}) {
  const tA = topPlayers[0]?.label ?? "Top A";
  const tB = topPlayers[1]?.label ?? "Top B";
  const bA = bottomPlayers[0]?.label ?? "Bot A";
  const bB = bottomPlayers[1]?.label ?? "Bot B";

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0a1220]">
      <table className="min-w-full text-[11px]">
        <thead className="bg-white/5 text-slate-300">
          <tr>
            <th className="px-2 py-1.5 text-center">H</th>
            <th className="px-2 py-1.5 text-center" title="Stroke index">SI</th>
            <th className="px-2 py-1.5 text-center" title="Bruto / Neto" colSpan={2}>
              {tA}
            </th>
            <th className="px-2 py-1.5 text-center" colSpan={2}>{tB}</th>
            <th className="px-2 py-1.5 text-center" colSpan={2}>{bA}</th>
            <th className="px-2 py-1.5 text-center" colSpan={2}>{bB}</th>
            <th className="px-2 py-1.5 text-center text-cyan-200">Pts Top</th>
            <th className="px-2 py-1.5 text-center text-fuchsia-200">Pts Bot</th>
            <th className="px-2 py-1.5 text-left">Acumulado</th>
          </tr>
          <tr className="text-[9px] text-slate-500">
            <th />
            <th />
            <th className="px-1 text-center">Br</th>
            <th className="px-1 text-center">Net</th>
            <th className="px-1 text-center">Br</th>
            <th className="px-1 text-center">Net</th>
            <th className="px-1 text-center">Br</th>
            <th className="px-1 text-center">Net</th>
            <th className="px-1 text-center">Br</th>
            <th className="px-1 text-center">Net</th>
            <th />
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => (
            <tr
              key={h.hole_no}
              className={
                h.has_score ? "border-t border-white/5" : "border-t border-white/5 text-slate-500"
              }
            >
              <td className="px-2 py-1 text-center font-bold">{h.hole_no}</td>
              <td className="px-2 py-1 text-center text-slate-400">
                {h.stroke_index ?? "—"}
              </td>
              {/* TopA */}
              <td className="px-1 text-center">{h.top_player_a_strokes ?? "—"}</td>
              <td className="px-1 text-center text-slate-300">
                {h.breakdown ? formatNet(h.breakdown.nets.top_a) : "—"}
              </td>
              {/* TopB */}
              <td className="px-1 text-center">{h.top_player_b_strokes ?? "—"}</td>
              <td className="px-1 text-center text-slate-300">
                {h.breakdown ? formatNet(h.breakdown.nets.top_b) : "—"}
              </td>
              {/* BotA */}
              <td className="px-1 text-center">{h.bottom_player_a_strokes ?? "—"}</td>
              <td className="px-1 text-center text-slate-300">
                {h.breakdown ? formatNet(h.breakdown.nets.bottom_a) : "—"}
              </td>
              {/* BotB */}
              <td className="px-1 text-center">{h.bottom_player_b_strokes ?? "—"}</td>
              <td className="px-1 text-center text-slate-300">
                {h.breakdown ? formatNet(h.breakdown.nets.bottom_b) : "—"}
              </td>
              <td className="px-2 py-1 text-center font-bold text-cyan-200">
                {fmtPts(h.top_points)}
              </td>
              <td className="px-2 py-1 text-center font-bold text-fuchsia-200">
                {fmtPts(h.bottom_points)}
              </td>
              <td className="px-2 py-1 text-[10px] text-slate-300">
                {h.has_score
                  ? `${fmtPts(h.top_cum)}–${fmtPts(h.bottom_cum)}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatNet(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
