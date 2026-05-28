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
  par: number | null;
  /** true cuando el hoyo se jugó después de que el match ya estaba
   *  matemáticamente decidido (no contribuye a puntos del match). */
  after_decision?: boolean;
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
  /** Hoyo en el que el match quedó matemáticamente decidido (null si llegó al 18). */
  decided_at_hole?: number | null;
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
                {detail.decided_at_hole != null ? (
                  <span className="font-semibold text-emerald-300">
                    Match decidido en hoyo {detail.decided_at_hole} de {detail.holes_in_match}
                  </span>
                ) : detail.last_hole_played > 0 ? (
                  `Va en hoyo ${detail.last_hole_played} de ${detail.holes_in_match} · Allowance ${detail.allowance_pct}%`
                ) : (
                  `Aún no inicia · Allowance ${detail.allowance_pct}%`
                )}
                {detail.decided_at_hole != null ? (
                  <span className="text-slate-400">
                    {" "}· Allowance {detail.allowance_pct}%
                  </span>
                ) : null}
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
                Diferencial acumulado por hoyo
              </h3>
              <PointsChart
                holes={detail.holes}
                holesInMatch={detail.holes_in_match}
                topLabel={topName}
                bottomLabel={bottomName}
                decidedAtHole={detail.decided_at_hole ?? null}
              />
            </section>
          ) : null}

          {/* Tabla de hoyos: scorecard horizontal estilo "resultados en vivo" */}
          {detail ? (
            <section>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Tarjeta del match (brutos)
              </h3>
              <HoleTable
                holes={detail.holes}
                topPlayers={topPlayers}
                bottomPlayers={bottomPlayers}
                topLabel={topName}
                bottomLabel={bottomName}
                allowancePct={detail.allowance_pct}
                decidedAtHole={detail.decided_at_hole ?? null}
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
  decidedAtHole = null,
}: {
  holes: HoleDetail[];
  holesInMatch: number;
  topLabel: string;
  bottomLabel: string;
  decidedAtHole?: number | null;
}) {
  const width = 720;
  const height = 220;
  const padL = 36;
  const padR = 12;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const played = holes.filter((h) => h.has_score);
  const diffs = played.map(
    (h) => Number(h.top_cum ?? 0) - Number(h.bottom_cum ?? 0)
  );
  const maxAbs = Math.max(2, ...diffs.map((d) => Math.abs(d)));

  const slotW = innerW / holesInMatch;
  const barW = Math.max(8, Math.min(28, slotW * 0.7));

  function xCenter(hole: number): number {
    return padL + slotW * (hole - 0.5);
  }
  function yFor(val: number): number {
    return padT + innerH / 2 - (innerH / 2) * (val / maxAbs);
  }
  const yZero = yFor(0);

  const tickStep = Math.max(1, Math.ceil(maxAbs / 3));
  const yTicks: number[] = [];
  for (let v = -maxAbs; v <= maxAbs; v += tickStep) yTicks.push(v);
  if (!yTicks.includes(0)) yTicks.push(0);

  function fmt(v: number): string {
    if (v === 0) return "AS";
    const s = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
    return (v > 0 ? "+" : "−") + s;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1220] p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke={
                v === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"
              }
              strokeDasharray={v === 0 ? "0" : "2 3"}
            />
            <text
              x={padL - 6}
              y={yFor(v) + 3}
              fontSize={9}
              textAnchor="end"
              fill={
                v === 0 ? "rgba(226,232,240,0.85)" : "rgba(148,163,184,0.85)"
              }
            >
              {fmt(v)}
            </text>
          </g>
        ))}

        {Array.from({ length: holesInMatch }, (_, i) => i + 1).map((h) => (
          <g key={h}>
            <line
              x1={xCenter(h)}
              x2={xCenter(h)}
              y1={padT + innerH}
              y2={padT + innerH + 3}
              stroke="rgba(148,163,184,0.6)"
            />
            {h % 3 === 0 || h === 1 || h === holesInMatch ? (
              <text
                x={xCenter(h)}
                y={padT + innerH + 16}
                fontSize={9}
                textAnchor="middle"
                fill="rgba(148,163,184,0.85)"
              >
                {h}
              </text>
            ) : null}
          </g>
        ))}

        {decidedAtHole != null && decidedAtHole < holesInMatch ? (
          <g>
            {/* Banda gris semitransparente sobre hoyos después de la decisión */}
            <rect
              x={xCenter(decidedAtHole) + slotW / 2}
              y={padT}
              width={Math.max(0, padL + innerW - (xCenter(decidedAtHole) + slotW / 2))}
              height={innerH}
              fill="rgba(148,163,184,0.07)"
            />
            <line
              x1={xCenter(decidedAtHole) + slotW / 2}
              x2={xCenter(decidedAtHole) + slotW / 2}
              y1={padT}
              y2={padT + innerH}
              stroke="rgba(52,211,153,0.55)"
              strokeDasharray="4 3"
            />
            <text
              x={xCenter(decidedAtHole) + slotW / 2 + 4}
              y={padT + 10}
              fontSize={9}
              fill="rgba(52,211,153,0.85)"
              fontWeight={700}
            >
              Decidido en H{decidedAtHole}
            </text>
          </g>
        ) : null}

        {played.length > 0 ? (
          played.map((h) => {
            const diff =
              Number(h.top_cum ?? 0) - Number(h.bottom_cum ?? 0);
            const cx = xCenter(h.hole_no);
            const yV = yFor(diff);
            const barTop = Math.min(yZero, yV);
            const barH = Math.max(0.5, Math.abs(yV - yZero));
            const isAfter = h.after_decision === true;
            const color =
              diff > 0
                ? "rgb(34,211,238)"
                : diff < 0
                  ? "rgb(232,121,249)"
                  : "rgba(148,163,184,0.6)";
            const labelY =
              diff >= 0 ? barTop - 4 : barTop + barH + 10;
            return (
              <g key={`bar-${h.hole_no}`}>
                <rect
                  x={cx - barW / 2}
                  y={barTop}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={color}
                  opacity={isAfter ? 0.25 : diff === 0 ? 0.5 : 0.9}
                />
                {diff !== 0 && !isAfter ? (
                  <text
                    x={cx}
                    y={labelY}
                    fontSize={9}
                    textAnchor="middle"
                    fill={color}
                    fontWeight={700}
                  >
                    {fmt(diff)}
                  </text>
                ) : null}
              </g>
            );
          })
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
          <span className="h-2 w-3 rounded-sm bg-cyan-400" /> {topLabel} arriba
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-fuchsia-400" /> {bottomLabel}{" "}
          arriba
        </span>
        <span className="text-slate-500">Línea AS = empate acumulado</span>
        {decidedAtHole != null ? (
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <span className="inline-block h-3 w-3 border-l-2 border-dashed border-emerald-400" />
            Match decidido en H{decidedAtHole}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HoleTable({
  holes,
  topPlayers,
  bottomPlayers,
  topLabel,
  bottomLabel,
  allowancePct,
  decidedAtHole = null,
}: {
  holes: HoleDetail[];
  topPlayers: PlayerInfo[];
  bottomPlayers: PlayerInfo[];
  topLabel: string;
  bottomLabel: string;
  allowancePct: number;
  decidedAtHole?: number | null;
}) {
  const tA = topPlayers[0]?.label ?? "—";
  const tB = topPlayers[1]?.label ?? "—";
  const bA = bottomPlayers[0]?.label ?? "—";
  const bB = bottomPlayers[1]?.label ?? "—";

  /** PH del torneo (CH del campo × % competencia). No usar HI×% directo. */
  function tournamentPh(p: PlayerInfo | undefined): number | null {
    if (!p) return null;
    if (p.ph != null && Number.isFinite(Number(p.ph))) return Number(p.ph);
    return null;
  }

  const tAph = tournamentPh(topPlayers[0]);
  const tBph = tournamentPh(topPlayers[1]);
  const bAph = tournamentPh(bottomPlayers[0]);
  const bBph = tournamentPh(bottomPlayers[1]);

  const hasPar = holes.some((h) => h.par != null);

  function strokeOf(h: HoleDetail, who: "tA" | "tB" | "bA" | "bB"): number | null {
    switch (who) {
      case "tA":
        return h.top_player_a_strokes;
      case "tB":
        return h.top_player_b_strokes;
      case "bA":
        return h.bottom_player_a_strokes;
      case "bB":
        return h.bottom_player_b_strokes;
    }
  }

  /** Devuelve "low" (bola baja de la pareja) o "high" (bola alta) para
   *  cada jugador en cada hoyo, usando `breakdown.nets` cuando hay tarjeta
   *  capturada. Empate dentro de la pareja → A queda como low, B como high
   *  (mismo criterio que `pairLowHighStrokes`). */
  function role(
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): "low" | "high" | null {
    if (!h.breakdown) return null;
    const { nets } = h.breakdown;
    if (who === "tA") return nets.top_a <= nets.top_b ? "low" : "high";
    if (who === "tB") return nets.top_b < nets.top_a ? "low" : "high";
    if (who === "bA") return nets.bottom_a <= nets.bottom_b ? "low" : "high";
    return nets.bottom_b < nets.bottom_a ? "low" : "high";
  }

  function sumStrokes(
    who: "tA" | "tB" | "bA" | "bB",
    from: number,
    to: number
  ): number | null {
    let total = 0;
    let any = false;
    for (let h = from; h <= to; h++) {
      const v = strokeOf(holes[h - 1]!, who);
      if (v == null) return null;
      total += Number(v);
      any = true;
    }
    return any ? total : null;
  }

  function sumPar(from: number, to: number): number | null {
    let total = 0;
    for (let h = from; h <= to; h++) {
      const p = holes[h - 1]?.par;
      if (p == null) return null;
      total += Number(p);
    }
    return total;
  }

  /** Total a par para el rango (bruto − par). Si falta par o algún
   *  bruto del jugador en el rango, devuelve null. */
  function strokesToPar(
    who: "tA" | "tB" | "bA" | "bB",
    from: number,
    to: number
  ): number | null {
    const s = sumStrokes(who, from, to);
    const p = sumPar(from, to);
    if (s == null || p == null) return null;
    return s - p;
  }

  function fmtToPar(n: number | null): string {
    if (n == null) return "—";
    if (n === 0) return "E";
    return (n > 0 ? "+" : "−") + Math.abs(n);
  }

  function toParTone(n: number | null): string {
    if (n == null) return "text-slate-500";
    if (n < 0) return "text-rose-200";
    if (n > 0) return "text-sky-200";
    return "text-emerald-200";
  }

  function diffAt(holeNo: number): number | null {
    const h = holes[holeNo - 1];
    if (!h || !h.has_score) return null;
    return Number(h.top_cum ?? 0) - Number(h.bottom_cum ?? 0);
  }

  function fmtStroke(n: number | null): string {
    if (n == null) return "—";
    return String(n);
  }

  function fmtDiff(n: number | null): string {
    if (n == null) return "—";
    if (n === 0) return "AS";
    const v = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
    return (n > 0 ? "+" : "−") + v;
  }

  function diffTone(n: number | null): string {
    if (n == null) return "text-slate-500";
    if (n > 0) return "text-cyan-200";
    if (n < 0) return "text-fuchsia-200";
    return "text-slate-300";
  }

  const playerRows: Array<{
    key: "tA" | "tB" | "bA" | "bB";
    name: string;
    team: "top" | "bottom";
    ph: number | null;
  }> = [
    { key: "tA", name: tA, team: "top", ph: tAph },
    { key: "tB", name: tB, team: "top", ph: tBph },
    { key: "bA", name: bA, team: "bottom", ph: bAph },
    { key: "bB", name: bB, team: "bottom", ph: bBph },
  ];

  const stickyName =
    "sticky left-0 z-10 border-b border-r border-white/10 bg-[#0a1220] px-2 py-1 text-left text-[10px] font-semibold leading-tight shadow-[6px_0_12px_-4px_rgba(0,0,0,0.45)]";
  const holeTh =
    "w-[24px] min-w-[24px] border-b border-white/10 px-0 py-0.5 text-center text-[9px] font-bold text-cyan-50 sm:w-7";
  const subTh =
    "w-[30px] min-w-[28px] border-b border-l border-white/10 px-0 py-0.5 text-center text-[9px] font-bold text-cyan-200 sm:w-[34px]";
  const cellTd =
    "w-[24px] min-w-[24px] border-b border-white/10 px-0 py-0.5 text-center text-[10px] sm:w-7";
  const subTd =
    "w-[30px] min-w-[28px] border-b border-l border-white/10 px-0 py-0.5 text-center text-[10px] font-semibold sm:w-[34px]";

  /** Marcador del bruto: rojo con círculo cuando es bajo par, azul/cuadro
   *  cuando es arriba de par; plano cuando es par o no hay par. */
  function StrokeMark({
    strokes,
    par,
  }: {
    strokes: number | null;
    par: number | null;
  }) {
    if (strokes == null)
      return <span className="text-slate-500">—</span>;
    if (par == null)
      return <span className="text-white">{strokes}</span>;
    const diff = Number(strokes) - Number(par);
    if (diff <= -2) {
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-full border-2 border-rose-400 bg-rose-500/15"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[3px] block rounded-full border border-rose-300/90"
          />
          <span className="relative z-10 text-[10px] font-bold text-rose-50">
            {strokes}
          </span>
        </span>
      );
    }
    if (diff === -1) {
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-full border border-rose-400 bg-rose-500/15"
          />
          <span className="relative z-10 text-[10px] font-bold text-rose-100">
            {strokes}
          </span>
        </span>
      );
    }
    if (diff === 1) {
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-sm border border-sky-300/90 bg-sky-500/10"
          />
          <span className="relative z-10 text-[10px] font-bold text-sky-100">
            {strokes}
          </span>
        </span>
      );
    }
    if (diff >= 2) {
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-sm border-2 border-sky-300/90 bg-sky-500/15"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[3px] block rounded-sm border border-sky-200/80"
          />
          <span className="relative z-10 text-[10px] font-bold text-sky-50">
            {strokes}
          </span>
        </span>
      );
    }
    return <span className="text-white">{strokes}</span>;
  }

  /** Tint de fondo según rol: amarillo = bola baja de la pareja, azul
   *  marino = bola alta. Se aplica encima del stripe. */
  function roleTint(r: "low" | "high" | null): string {
    if (r === "low") return "bg-amber-400/20";
    if (r === "high") return "bg-indigo-700/30";
    return "";
  }

  /** Marca visual para hoyos jugados después de la decisión del match
   *  (los strokes se siguen capturando pero no aportan puntos). */
  function decisionTint(holeNo: number): string {
    if (decidedAtHole == null || holeNo <= decidedAtHole) return "";
    return "bg-slate-500/10 opacity-60";
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0a1220]">
      {decidedAtHole != null ? (
        <div className="flex items-center gap-2 border-b border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          Match decidido en H{decidedAtHole}. Los hoyos posteriores se siguen
          capturando para stroke play, pero no aportan puntos al match.
        </div>
      ) : null}
      <table className="min-w-full border-separate border-spacing-0 text-[10px] text-white">
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th className={`${stickyName} z-20 bg-cyan-950`}>Jugador</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={`hh-${i + 1}`} className={holeTh}>
                {i + 1}
              </th>
            ))}
            <th className={subTh}>
              OUT
              {hasPar ? (
                <span className="block text-[7px] font-normal text-cyan-300/70">
                  vs par
                </span>
              ) : null}
            </th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={`hh-${i + 10}`} className={holeTh}>
                {i + 10}
              </th>
            ))}
            <th className={subTh}>
              IN
              {hasPar ? (
                <span className="block text-[7px] font-normal text-cyan-300/70">
                  vs par
                </span>
              ) : null}
            </th>
            <th className={subTh}>
              TOT
              {hasPar ? (
                <span className="block text-[7px] font-normal text-cyan-300/70">
                  vs par
                </span>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {hasPar ? (
            <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
              <td
                className={`${stickyName} bg-emerald-950 border-l-2 border-l-emerald-500/50`}
              >
                Par
              </td>
              {Array.from({ length: 9 }, (_, i) => (
                <td
                  key={`par-${i + 1}`}
                  className={`${cellTd} bg-emerald-950/80 text-[10px] font-semibold`}
                >
                  {holes[i]?.par ?? "—"}
                </td>
              ))}
              <td className={`${subTd} bg-emerald-950/80`}>
                {holes
                  .slice(0, 9)
                  .every((h) => h.par != null)
                  ? holes
                      .slice(0, 9)
                      .reduce((acc, h) => acc + Number(h.par ?? 0), 0)
                  : "—"}
              </td>
              {Array.from({ length: 9 }, (_, i) => (
                <td
                  key={`par-${i + 10}`}
                  className={`${cellTd} bg-emerald-950/80 text-[10px] font-semibold`}
                >
                  {holes[i + 9]?.par ?? "—"}
                </td>
              ))}
              <td className={`${subTd} bg-emerald-950/80`}>
                {holes
                  .slice(9, 18)
                  .every((h) => h.par != null)
                  ? holes
                      .slice(9, 18)
                      .reduce((acc, h) => acc + Number(h.par ?? 0), 0)
                  : "—"}
              </td>
              <td className={`${subTd} bg-emerald-950/80`}>
                {holes.every((h) => h.par != null)
                  ? holes.reduce((acc, h) => acc + Number(h.par ?? 0), 0)
                  : "—"}
              </td>
            </tr>
          ) : null}

          {playerRows.map((p, idx) => {
            const stripe =
              idx % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";
            const accent =
              p.team === "top"
                ? "border-l-2 border-l-cyan-500/40"
                : "border-l-2 border-l-fuchsia-500/40";
            const outStr = sumStrokes(p.key, 1, 9);
            const innStr = sumStrokes(p.key, 10, 18);
            const totStr =
              outStr != null && innStr != null ? outStr + innStr : null;
            const outTp = hasPar ? strokesToPar(p.key, 1, 9) : null;
            const innTp = hasPar ? strokesToPar(p.key, 10, 18) : null;
            const totTp = hasPar ? strokesToPar(p.key, 1, 18) : null;
            return (
              <tr key={`row-${p.key}`} className={`${stripe}`}>
                <td className={`${stickyName} ${stripe} ${accent}`}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="truncate">{p.name}</span>
                    {p.ph != null ? (
                      <span
                        className="shrink-0 rounded bg-amber-500/20 px-1 py-px text-[8px] font-bold leading-none text-amber-200"
                        title={`Handicap del torneo al ${allowancePct}%`}
                      >
                        PH {p.ph}
                      </span>
                    ) : null}
                  </div>
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const h = holes[i]!;
                  const r = role(h, p.key);
                  return (
                    <td
                      key={`c-${p.key}-${i + 1}`}
                      className={`${cellTd} ${stripe} ${roleTint(r)} ${decisionTint(i + 1)}`}
                    >
                      <StrokeMark strokes={strokeOf(h, p.key)} par={h.par} />
                    </td>
                  );
                })}
                <td className={`${subTd} ${stripe} ${hasPar ? toParTone(outTp) : ""}`}>
                  {hasPar ? fmtToPar(outTp) : fmtStroke(outStr)}
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const h = holes[i + 9]!;
                  const r = role(h, p.key);
                  return (
                    <td
                      key={`c-${p.key}-${i + 10}`}
                      className={`${cellTd} ${stripe} ${roleTint(r)} ${decisionTint(i + 10)}`}
                    >
                      <StrokeMark strokes={strokeOf(h, p.key)} par={h.par} />
                    </td>
                  );
                })}
                <td className={`${subTd} ${stripe} ${hasPar ? toParTone(innTp) : ""}`}>
                  {hasPar ? fmtToPar(innTp) : fmtStroke(innStr)}
                </td>
                <td
                  className={`${subTd} ${stripe} font-bold ${
                    hasPar ? toParTone(totTp) : "text-white"
                  }`}
                  title={
                    totStr != null && hasPar ? `bruto ${totStr}` : undefined
                  }
                >
                  {hasPar ? fmtToPar(totTp) : fmtStroke(totStr)}
                </td>
              </tr>
            );
          })}

          {(() => {
            const stripe = "bg-[#091624]";
            const d9 = diffAt(9);
            const d18 = diffAt(18);
            const dIn =
              d9 != null && d18 != null ? d18 - d9 : null;
            return (
              <tr className={`border-t-2 border-cyan-500/30 ${stripe}`}>
                <td
                  className={`${stickyName} ${stripe} border-l-2 border-l-amber-400/60`}
                >
                  <span className="block text-amber-200">Diferencial</span>
                  <span className="block text-[8px] font-normal text-slate-400">
                    {topLabel} − {bottomLabel}
                  </span>
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const d = diffAt(i + 1);
                  return (
                    <td
                      key={`d-${i + 1}`}
                      className={`${cellTd} ${stripe} font-bold ${diffTone(d)} ${decisionTint(i + 1)}`}
                    >
                      {fmtDiff(d)}
                    </td>
                  );
                })}
                <td className={`${subTd} ${stripe} ${diffTone(d9)}`}>
                  {fmtDiff(d9)}
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const d = diffAt(i + 10);
                  return (
                    <td
                      key={`d-${i + 10}`}
                      className={`${cellTd} ${stripe} font-bold ${diffTone(d)} ${decisionTint(i + 10)}`}
                    >
                      {fmtDiff(d)}
                    </td>
                  );
                })}
                <td className={`${subTd} ${stripe} ${diffTone(dIn)}`}>
                  {fmtDiff(dIn)}
                </td>
                <td className={`${subTd} ${stripe} ${diffTone(d18)}`}>
                  {fmtDiff(d18)}
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
      <div className="space-y-1 border-t border-white/10 px-2 py-1.5 text-[9px] text-slate-400">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-rose-400 bg-rose-500/15" />
            Bajo par (eagle/birdie)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-3 w-3 items-center justify-center rounded-sm border border-sky-300/90 bg-sky-500/10" />
            Arriba de par (bogey+)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-400/40" />
            Bola baja de la pareja
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-indigo-700/60" />
            Bola alta de la pareja
          </span>
        </div>
        {hasPar ? (
          <p>
            OUT / IN / TOT muestran el resultado <strong>bruto vs par</strong>{" "}
            (+5, E, −2) para comparar a los 4 jugadores sin sus ventajas de
            hándicap. La ventaja del match (bola baja / alta) sólo aplica a
            los puntos de la pareja.
          </p>
        ) : null}
        <p>
          Diferencial = puntos acumulados de{" "}
          <span className="text-cyan-300">{topLabel}</span> menos{" "}
          <span className="text-fuchsia-300">{bottomLabel}</span>. Positivo =
          va arriba <span className="text-cyan-300">{topLabel}</span>; negativo
          = va arriba{" "}
          <span className="text-fuchsia-300">{bottomLabel}</span>; AS = empate
          acumulado.
        </p>
      </div>
    </div>
  );
}
