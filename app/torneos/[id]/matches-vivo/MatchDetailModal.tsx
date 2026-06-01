"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { createClient } from "@/utils/supabase/client";

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
    strokes_received?: {
      top_a: number;
      top_b: number;
      bottom_a: number;
      bottom_b: number;
    };
  } | null;
  stroke_index: number | null;
  par: number | null;
  /** true cuando el hoyo se jugó después de que el match ya estaba
   *  matemáticamente decidido (no contribuye a puntos del match). */
  after_decision?: boolean;
  /** True si el hoyo es del tramo de desempate (hole_no 19-27). */
  is_playoff?: boolean;
  /** Posición dentro del desempate (1-9). */
  playoff_hole?: number;
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
  /** Hoyo en el que el match quedó matemáticamente decidido
   *  (1-27 incluyendo desempate; null si llegó al 18 sin decidir). */
  decided_at_hole?: number | null;
  /** Decisión vino del tramo de desempate (19-27 = 1-9 físicos). */
  via_playoff?: boolean;
  /** Hoyo del desempate (1-9) en el que se decidió. */
  playoff_decided_hole?: number;
  /** AS al 18 con puntos en juego — falta jugar el desempate. */
  needs_playoff?: boolean;
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
  /**
   * Contador incrementado por el grid padre cada vez que recarga los
   * matches en vivo. Nos sirve para refetchear el detalle en el mismo
   * ciclo y no mostrar valores distintos entre resumen y detalle.
   */
  liveTick?: number;
};

function fmtPts(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function fmtPh(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

/**
 * Para el scorecard horizontal — elimina el segundo apellido (y el segundo
 * nombre si existe) para que la columna fija de nombres entre cómoda en
 * pantallas móviles.
 *   "Paulina Septién Lomeli"            → "Paulina Septién"
 *   "Adriana Guadalupe Alvarez Lopez"   → "Adriana Alvarez"
 *   "Mario Arturo Urquiza Vargas"       → "Mario Urquiza"
 */
function shortPlayerLabel(label: string): string {
  if (!label) return "—";
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 2) return label.trim();
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return `${parts[0]} ${parts[parts.length - 2]}`;
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
  liveTick = 0,
}: Props) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const fetchDetail = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (!matchId) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (opts?.showSpinner) setLoading(true);
      try {
        const params = new URLSearchParams({
          match_id: matchId,
          tournament_id: tournamentId,
        });
        const r = await fetch(
          `/api/matchplay/match-detail?${params.toString()}`,
          { cache: "no-store" }
        );
        const j = (await r.json().catch(() => null)) as
          | { ok: true; match: MatchDetail }
          | { ok: false; error: string }
          | null;
        if (!r.ok || !j || j.ok === false) {
          if (opts?.showSpinner) {
            setError(
              (j && "error" in j && j.error) || "No se pudo cargar el detalle."
            );
            setDetail(null);
          }
        } else {
          setDetail(j.match);
          setError(null);
        }
      } catch (e) {
        if (opts?.showSpinner) {
          setError(e instanceof Error ? e.message : "Error de red");
        }
      } finally {
        inFlightRef.current = false;
        if (opts?.showSpinner) setLoading(false);
      }
    },
    [matchId, tournamentId]
  );

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
    void fetchDetail({ showSpinner: true });
  }, [open, matchId, tournamentId, isDerived, fetchDetail]);

  // El grid padre incrementa `liveTick` cada vez que termina una recarga
  // exitosa de los matches. Cuando cambia, refetcheamos el detalle en el
  // mismo ciclo para que resumen y detalle nunca muestren valores
  // distintos del mismo match.
  useEffect(() => {
    if (!open || !matchId) return;
    if (liveTick === 0) return;
    void fetchDetail();
  }, [liveTick, open, matchId, fetchDetail]);

  // Respaldo: para matches oficiales (no derivados) suscribimos al
  // realtime de `matchplay_hole_results` por si el grid no está polling
  // (puede pasar si los matches no son strokeLive, p.ej. matchplay sin
  // captura rápida). El modal y el grid siguen coherentes porque el
  // tick del padre dispara también el refetch del detalle.
  useEffect(() => {
    if (!open || !matchId) return;
    const supabase = createClient();
    const debounceRef: { id: ReturnType<typeof setTimeout> | null } = {
      id: null,
    };
    const scheduleRefresh = () => {
      if (debounceRef.id != null) clearTimeout(debounceRef.id);
      debounceRef.id = setTimeout(() => {
        debounceRef.id = null;
        if (typeof document !== "undefined" && document.hidden) return;
        void fetchDetail();
      }, 600);
    };
    const ch = supabase
      .channel(`mp-modal-${tournamentId}-${matchId}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "matchplay_hole_results" },
        scheduleRefresh
      )
      .subscribe();
    return () => {
      if (debounceRef.id != null) clearTimeout(debounceRef.id);
      supabase.removeChannel(ch);
    };
  }, [open, matchId, tournamentId, fetchDetail]);

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
                holes={detail.holes.filter((h) => h.hole_no <= 18)}
                topPlayers={topPlayers}
                bottomPlayers={bottomPlayers}
                topLabel={topName}
                bottomLabel={bottomName}
                allowancePct={detail.allowance_pct}
                decidedAtHole={
                  detail.decided_at_hole != null && detail.decided_at_hole <= 18
                    ? detail.decided_at_hole
                    : null
                }
              />
            </section>
          ) : null}

          {/* Desempate: tabla compacta para los hoyos 1-9 jugados como playoff */}
          {detail &&
          (detail.needs_playoff ||
            detail.holes.some((h) => h.hole_no > 18)) ? (
            <section>
              <h3 className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
                Desempate · muerte súbita
              </h3>
              <PlayoffTable
                holes={detail.holes.filter((h) => h.hole_no > 18)}
                topPlayers={topPlayers}
                bottomPlayers={bottomPlayers}
                topLabel={topName}
                bottomLabel={bottomName}
                allowancePct={detail.allowance_pct}
                decidedAtPlayoffHole={detail.playoff_decided_hole ?? null}
              />
            </section>
          ) : null}

          {/* Banner ganador/perdedor tras AS al 18 — incluye desempate decidido */}
          {detail && detail.via_playoff && detail.decided_at_hole != null ? (
            <PayerBanner
              topLabel={topName}
              bottomLabel={bottomName}
              topPts={detail.top_total}
              bottomPts={detail.bottom_total}
              playoffHole={detail.playoff_decided_hole ?? null}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PayerBanner({
  topLabel,
  bottomLabel,
  topPts,
  bottomPts,
  playoffHole,
}: {
  topLabel: string;
  bottomLabel: string;
  topPts: number;
  bottomPts: number;
  playoffHole: number | null;
}) {
  const winner = topPts > bottomPts ? topLabel : bottomLabel;
  const loser = topPts > bottomPts ? bottomLabel : topLabel;
  return (
    <div className="rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-950/60 via-amber-900/40 to-amber-950/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
          ✓ Ganadores
        </span>
        <span className="text-[12px] font-bold text-emerald-200">{winner}</span>
        <span className="text-slate-500">·</span>
        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200">
          ✕ Perdedores
        </span>
        <span className="text-[12px] font-bold text-rose-200">{loser}</span>
      </div>
      <p className="mt-1 text-[10px] text-amber-200/80">
        Tras AS al 18 se jugó desempate (muerte súbita). Decidido en H
        {playoffHole ?? "?"} del playoff.
      </p>
    </div>
  );
}

function PlayoffTable({
  holes,
  topPlayers,
  bottomPlayers,
  topLabel,
  bottomLabel,
  allowancePct,
  decidedAtPlayoffHole = null,
}: {
  holes: HoleDetail[];
  topPlayers: PlayerInfo[];
  bottomPlayers: PlayerInfo[];
  topLabel: string;
  bottomLabel: string;
  allowancePct: number;
  decidedAtPlayoffHole?: number | null;
}) {
  // Si no hay ningún hoyo del desempate aún, mostramos placeholder.
  if (holes.length === 0) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-[#1a1208] px-3 py-2 text-[11px] text-amber-200">
        El match quedó empatado al 18. Captura el hoyo 1 del desempate para
        determinar el resultado.
      </div>
    );
  }

  const tA = shortPlayerLabel(topPlayers[0]?.label ?? "—");
  const tB = shortPlayerLabel(topPlayers[1]?.label ?? "—");
  const bA = shortPlayerLabel(bottomPlayers[0]?.label ?? "—");
  const bB = shortPlayerLabel(bottomPlayers[1]?.label ?? "—");

  const tAph = topPlayers[0]?.ph ?? null;
  const tBph = topPlayers[1]?.ph ?? null;
  const bAph = bottomPlayers[0]?.ph ?? null;
  const bBph = bottomPlayers[1]?.ph ?? null;

  const grossOf = (
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): number | null => {
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
  };
  const netOf = (
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): number | null => {
    const nets = h.breakdown?.nets;
    if (!nets) return grossOf(h, who);
    switch (who) {
      case "tA":
        return nets.top_a;
      case "tB":
        return nets.top_b;
      case "bA":
        return nets.bottom_a;
      case "bB":
        return nets.bottom_b;
    }
  };
  const strokesReceivedOnHole = (
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): number => {
    const sr = h.breakdown?.strokes_received;
    if (!sr) return 0;
    switch (who) {
      case "tA":
        return sr.top_a;
      case "tB":
        return sr.top_b;
      case "bA":
        return sr.bottom_a;
      case "bB":
        return sr.bottom_b;
    }
  };
  const role = (
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): "low" | "high" | null => {
    if (!h.breakdown) return null;
    const { nets } = h.breakdown;
    if (who === "tA") return nets.top_a <= nets.top_b ? "low" : "high";
    if (who === "tB") return nets.top_b < nets.top_a ? "low" : "high";
    if (who === "bA") return nets.bottom_a <= nets.bottom_b ? "low" : "high";
    return nets.bottom_b < nets.bottom_a ? "low" : "high";
  };
  const roleTint = (r: "low" | "high" | null): string => {
    if (r === "low") return "bg-emerald-500/30";
    if (r === "high") return "bg-orange-600/35";
    return "";
  };
  const decisionTint = (playoffNo: number): string => {
    if (decidedAtPlayoffHole == null || playoffNo <= decidedAtPlayoffHole)
      return "";
    return "bg-slate-500/10 opacity-60";
  };

  const StrokeMarkInline = ({
    strokes,
    par,
    handicapReceived = 0,
    gross,
  }: {
    strokes: number | null;
    par: number | null;
    handicapReceived?: number;
    gross?: number | null;
  }) => {
    if (strokes == null) return <span className="text-slate-500">—</span>;
    const withHandicap = handicapReceived > 0;
    const scoreClass = withHandicap
      ? "text-amber-300 font-bold"
      : "text-white";
    const title =
      gross != null && withHandicap
        ? `Bruto ${gross} · neto ${strokes} (−${handicapReceived} ventaja)`
        : gross != null
          ? `Bruto ${gross} · neto ${strokes}`
          : undefined;
    if (par == null)
      return (
        <span className={scoreClass} title={title}>
          {strokes}
        </span>
      );
    const diff = Number(strokes) - Number(par);
    if (diff <= -2)
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
          <span
            className={`relative z-10 text-[10px] font-bold ${scoreClass}`}
            title={title}
          >
            {strokes}
          </span>
        </span>
      );
    if (diff === -1)
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-full border border-rose-400 bg-rose-500/15"
          />
          <span
            className={`relative z-10 text-[10px] font-bold ${scoreClass}`}
            title={title}
          >
            {strokes}
          </span>
        </span>
      );
    if (diff === 1)
      return (
        <span className="relative inline-flex h-[20px] w-[20px] items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-sm border border-sky-300/90 bg-sky-500/10"
          />
          <span
            className={`relative z-10 text-[10px] font-bold ${scoreClass}`}
            title={title}
          >
            {strokes}
          </span>
        </span>
      );
    if (diff >= 2)
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
          <span
            className={`relative z-10 text-[10px] font-bold ${scoreClass}`}
            title={title}
          >
            {strokes}
          </span>
        </span>
      );
    return (
      <span className={scoreClass} title={title}>
        {strokes}
      </span>
    );
  };

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
    "sticky left-0 z-30 border-b border-r border-white/10 px-2 py-1 text-left text-[10px] font-semibold leading-tight shadow-[6px_0_12px_-4px_rgba(0,0,0,0.55)] w-[120px] min-w-[120px] max-w-[140px]";
  const holeTh =
    "w-[28px] min-w-[28px] border-b border-white/10 px-0 py-0.5 text-center text-[9px] font-bold text-amber-50";
  const cellTd =
    "w-[28px] min-w-[28px] border-b border-white/10 px-0 py-0.5 text-center text-[10px]";

  return (
    <div className="overflow-x-auto rounded-lg border border-amber-400/30 bg-[#13100a]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-400/20 bg-[#13100a] px-3 py-1.5 text-[9px] text-amber-200/80">
        Desempate en hoyos 1-9. Se respetan las mismas ventajas que la ronda
        normal (mismo stroke index por hoyo), por lo que los altos reciben
        golpe en los mismos hoyos. Muerte súbita: el primer hoyo donde una
        pareja saque ventaja en puntos cierra el match.
      </div>
      <table className="min-w-full border-separate border-spacing-0 text-[10px] text-white">
        <thead>
          <tr className="bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-amber-50">
            <th className={stickyName} style={{ backgroundColor: "#3d2a05" }}>
              Jugador
            </th>
            {holes.map((h) => {
              const p = h.playoff_hole ?? h.hole_no - 18;
              return (
                <th key={`ph-h-${h.hole_no}`} className={holeTh}>
                  <span className="block leading-none">H{p}</span>
                  <span className="block text-[8px] font-normal text-amber-300/80">
                    hoyo {p}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {holes.some((h) => h.stroke_index != null) ? (
            <tr className="bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-amber-950/80 text-amber-100">
              <td
                className={`${stickyName} border-l-2 border-l-amber-500/40`}
                style={{ backgroundColor: "#2a1d04" }}
              >
                <span className="block leading-none">Vent</span>
                <span className="block text-[8px] font-normal text-amber-300/70">
                  stroke index
                </span>
              </td>
              {holes.map((h) => {
                const p = h.playoff_hole ?? h.hole_no - 18;
                return (
                  <td
                    key={`ph-si-${h.hole_no}`}
                    className={`${cellTd} bg-amber-950/40 text-[10px] font-semibold`}
                    title={`Desempate H${p} (hoyo físico ${p}) · Ventaja ${h.stroke_index ?? "—"}`}
                  >
                    {h.stroke_index ?? "—"}
                  </td>
                );
              })}
            </tr>
          ) : null}
          {holes.some((h) => h.par != null) ? (
            <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
              <td
                className={`${stickyName} border-l-2 border-l-emerald-500/50`}
                style={{ backgroundColor: "#022c22" }}
              >
                Par
              </td>
              {holes.map((h) => (
                <td
                  key={`ph-par-${h.hole_no}`}
                  className={`${cellTd} bg-emerald-950/80 text-[10px] font-semibold`}
                >
                  {h.par ?? "—"}
                </td>
              ))}
            </tr>
          ) : null}
          {playerRows.map((p, idx) => {
            const stripe = idx % 2 === 0 ? "bg-[#1a140a]" : "bg-[#181208]";
            const stripeHex = idx % 2 === 0 ? "#1a140a" : "#181208";
            const accent =
              p.team === "top"
                ? "border-l-2 border-l-cyan-500/40"
                : "border-l-2 border-l-fuchsia-500/40";
            return (
              <tr key={`ph-row-${p.key}`} className={stripe}>
                <td
                  className={`${stickyName} ${accent}`}
                  style={{ backgroundColor: stripeHex }}
                >
                  <div className="flex items-center gap-1 truncate">
                    <span className="truncate" title={p.name}>
                      {p.name}
                    </span>
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
                {holes.map((h) => {
                  const r = role(h, p.key);
                  const playoffNo = h.playoff_hole ?? h.hole_no - 18;
                  return (
                    <td
                      key={`ph-c-${p.key}-${h.hole_no}`}
                      className={`${cellTd} ${stripe} ${roleTint(r)} ${decisionTint(playoffNo)}`}
                    >
                      <StrokeMarkInline
                        strokes={netOf(h, p.key)}
                        par={h.par}
                        handicapReceived={strokesReceivedOnHole(h, p.key)}
                        gross={grossOf(h, p.key)}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Diferencial del playoff */}
          {(() => {
            const stripe = "bg-[#10160c]";
            return (
              <tr className={`border-t-2 border-amber-500/30 ${stripe}`}>
                <td
                  className={`${stickyName} border-l-2 border-l-amber-400/60`}
                  style={{ backgroundColor: "#0c1408" }}
                >
                  <span className="block text-amber-200">Puntos</span>
                  <span className="block text-[8px] font-normal text-slate-400">
                    {shortPlayerLabel(topLabel)} −{" "}
                    {shortPlayerLabel(bottomLabel)}
                  </span>
                </td>
                {holes.map((h) => {
                  const d =
                    h.top_points != null && h.bottom_points != null
                      ? h.top_points - h.bottom_points
                      : null;
                  const tone =
                    d == null
                      ? "text-slate-500"
                      : d > 0
                        ? "text-cyan-200"
                        : d < 0
                          ? "text-fuchsia-200"
                          : "text-slate-300";
                  const txt =
                    d == null
                      ? "—"
                      : d === 0
                        ? "AS"
                        : (d > 0 ? "+" : "−") +
                          Math.abs(Number.isInteger(d) ? d : Number(d.toFixed(1)));
                  return (
                    <td
                      key={`ph-d-${h.hole_no}`}
                      className={`${cellTd} ${stripe} font-bold ${tone}`}
                    >
                      {txt}
                    </td>
                  );
                })}
              </tr>
            );
          })()}
        </tbody>
      </table>
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
  const tA = shortPlayerLabel(topPlayers[0]?.label ?? "—");
  const tB = shortPlayerLabel(topPlayers[1]?.label ?? "—");
  const bA = shortPlayerLabel(bottomPlayers[0]?.label ?? "—");
  const bB = shortPlayerLabel(bottomPlayers[1]?.label ?? "—");

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
  const hasSI = holes.some((h) => h.stroke_index != null);

  function grossOf(h: HoleDetail, who: "tA" | "tB" | "bA" | "bB"): number | null {
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

  /** Neto usado para el match (bruto − ventajas del hoyo). */
  function netOf(h: HoleDetail, who: "tA" | "tB" | "bA" | "bB"): number | null {
    const nets = h.breakdown?.nets;
    if (nets) {
      switch (who) {
        case "tA":
          return nets.top_a;
        case "tB":
          return nets.top_b;
        case "bA":
          return nets.bottom_a;
        case "bB":
          return nets.bottom_b;
      }
    }
    return grossOf(h, who);
  }

  function strokesReceivedOnHole(
    h: HoleDetail,
    who: "tA" | "tB" | "bA" | "bB"
  ): number {
    const sr = h.breakdown?.strokes_received;
    if (!sr) return 0;
    switch (who) {
      case "tA":
        return sr.top_a;
      case "tB":
        return sr.top_b;
      case "bA":
        return sr.bottom_a;
      case "bB":
        return sr.bottom_b;
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

  function sumNet(
    who: "tA" | "tB" | "bA" | "bB",
    from: number,
    to: number
  ): number | null {
    let total = 0;
    let any = false;
    for (let h = from; h <= to; h++) {
      const v = netOf(holes[h - 1]!, who);
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
  function netToPar(
    who: "tA" | "tB" | "bA" | "bB",
    from: number,
    to: number
  ): number | null {
    const s = sumNet(who, from, to);
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

  /**
   * Columna fija de nombre. En móvil el usuario hace scroll horizontal
   * para ver todos los hoyos: la columna fija debe quedar ENCIMA del
   * contenido que pasa por debajo, no transparentarse. Por eso usamos
   * `z-30` y aplicamos el color de fondo vía `style` (no como clase
   * Tailwind), para que ninguna otra clase arbitraria pueda ganar la
   * disputa de CSS.
   */
  const stickyName =
    "sticky left-0 z-30 border-b border-r border-white/10 px-2 py-1 text-left text-[10px] font-semibold leading-tight shadow-[6px_0_12px_-4px_rgba(0,0,0,0.55)] w-[120px] min-w-[120px] max-w-[140px]";
  const holeTh =
    "w-[24px] min-w-[24px] border-b border-white/10 px-0 py-0.5 text-center text-[9px] font-bold text-cyan-50 sm:w-7";
  const subTh =
    "w-[30px] min-w-[28px] border-b border-l border-white/10 px-0 py-0.5 text-center text-[9px] font-bold text-cyan-200 sm:w-[34px]";
  const cellTd =
    "w-[24px] min-w-[24px] border-b border-white/10 px-0 py-0.5 text-center text-[10px] sm:w-7";
  const subTd =
    "w-[30px] min-w-[28px] border-b border-l border-white/10 px-0 py-0.5 text-center text-[10px] font-semibold sm:w-[34px]";

  /** Marcador del neto: círculos/cuadros vs par; amarillo si recibió golpe de ventaja. */
  function StrokeMark({
    strokes,
    par,
    handicapReceived = 0,
    gross,
  }: {
    strokes: number | null;
    par: number | null;
    handicapReceived?: number;
    gross?: number | null;
  }) {
    if (strokes == null)
      return <span className="text-slate-500">—</span>;

    const withHandicap = handicapReceived > 0;
    const scoreClass = withHandicap
      ? "text-amber-300 font-bold"
      : "text-white";

    const title =
      gross != null && withHandicap
        ? `Bruto ${gross} · neto ${strokes} (−${handicapReceived} ventaja)`
        : gross != null
          ? `Bruto ${gross} · neto ${strokes}`
          : undefined;

    if (par == null)
      return (
        <span className={scoreClass} title={title}>
          {strokes}
        </span>
      );
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
          <span className={`relative z-10 text-[10px] font-bold ${scoreClass}`} title={title}>
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
          <span className={`relative z-10 text-[10px] font-bold ${scoreClass}`} title={title}>
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
          <span className={`relative z-10 text-[10px] font-bold ${scoreClass}`} title={title}>
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
          <span className={`relative z-10 text-[10px] font-bold ${scoreClass}`} title={title}>
            {strokes}
          </span>
        </span>
      );
    }
    return (
      <span className={scoreClass} title={title}>
        {strokes}
      </span>
    );
  }

  /** Bola baja = verde (mejor neto de la pareja); bola alta = naranja (segundo neto). */
  function roleTint(r: "low" | "high" | null): string {
    if (r === "low") return "bg-emerald-500/30";
    if (r === "high") return "bg-orange-600/35";
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-[#0a1220] px-3 py-1.5 text-[9px] text-slate-400">
        <span>
          <span className="font-semibold text-amber-300">Vent</span> = ventaja
          del hoyo (stroke index, 1 = más difícil). Los altos reciben golpe
          empezando por SI 1 ·{" "}
          <span className="font-semibold text-amber-300">Amarillo</span> =
          neto con golpe de ventaja recibido ·{" "}
          <span className="font-semibold text-emerald-300">Verde</span> =
          bola baja (mejor neto de la pareja) ·{" "}
          <span className="font-semibold text-orange-300">Naranja</span> =
          bola alta (segundo neto de la pareja)
        </span>
      </div>
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
            <th
              className={stickyName}
              style={{ backgroundColor: "#083344" }}
            >
              Jugador
            </th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={`hh-${i + 1}`} className={holeTh}>
                {i + 1}
              </th>
            ))}
            <th className={subTh}>
              OUT
              {hasPar ? (
                <span className="block text-[7px] font-normal text-cyan-300/70">
                  neto vs par
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
                  neto vs par
                </span>
              ) : null}
            </th>
            <th className={subTh}>
              TOT
              {hasPar ? (
                <span className="block text-[7px] font-normal text-cyan-300/70">
                  neto vs par
                </span>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {hasPar ? (
            <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
              <td
                className={`${stickyName} border-l-2 border-l-emerald-500/50`}
                style={{ backgroundColor: "#022c22" }}
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

          {/* Fila Ventaja (stroke index): muestra qué tan difícil es cada
              hoyo. Los altos reciben golpe en los hoyos con SI más bajos
              (1 = más difícil). En el desempate (P1-P9) las ventajas se
              reciben en los mismos hoyos físicos. */}
          {hasSI ? (
            <tr className="bg-gradient-to-r from-amber-950/70 via-amber-900/40 to-amber-950/70 text-amber-100">
              <td
                className={`${stickyName} border-l-2 border-l-amber-500/40`}
                style={{ backgroundColor: "#2a1d04" }}
              >
                <span className="block leading-none">Vent</span>
                <span className="block text-[8px] font-normal text-amber-300/70">
                  stroke index
                </span>
              </td>
              {Array.from({ length: 9 }, (_, i) => (
                <td
                  key={`si-${i + 1}`}
                  className={`${cellTd} bg-amber-950/30 text-[10px] font-semibold`}
                  title={`Hoyo ${i + 1} · Ventaja ${holes[i]?.stroke_index ?? "—"}`}
                >
                  {holes[i]?.stroke_index ?? "—"}
                </td>
              ))}
              <td className={`${subTd} bg-amber-950/30 text-slate-500`}>—</td>
              {Array.from({ length: 9 }, (_, i) => (
                <td
                  key={`si-${i + 10}`}
                  className={`${cellTd} bg-amber-950/30 text-[10px] font-semibold`}
                  title={`Hoyo ${i + 10} · Ventaja ${holes[i + 9]?.stroke_index ?? "—"}`}
                >
                  {holes[i + 9]?.stroke_index ?? "—"}
                </td>
              ))}
              <td className={`${subTd} bg-amber-950/30 text-slate-500`}>—</td>
              <td className={`${subTd} bg-amber-950/30 text-slate-500`}>—</td>
            </tr>
          ) : null}

          {playerRows.map((p, idx) => {
            const stripe =
              idx % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";
            const stripeHex = idx % 2 === 0 ? "#0c1928" : "#0b1728";
            const accent =
              p.team === "top"
                ? "border-l-2 border-l-cyan-500/40"
                : "border-l-2 border-l-fuchsia-500/40";
            const outStr = sumNet(p.key, 1, 9);
            const innStr = sumNet(p.key, 10, 18);
            const totStr =
              outStr != null && innStr != null ? outStr + innStr : null;
            const outTp = hasPar ? netToPar(p.key, 1, 9) : null;
            const innTp = hasPar ? netToPar(p.key, 10, 18) : null;
            const totTp = hasPar ? netToPar(p.key, 1, 18) : null;
            return (
              <tr key={`row-${p.key}`} className={`${stripe}`}>
                <td
                  className={`${stickyName} ${accent}`}
                  style={{ backgroundColor: stripeHex }}
                >
                  <div className="flex items-center gap-1 truncate">
                    <span className="truncate" title={p.name}>
                      {p.name}
                    </span>
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
                      <StrokeMark
                        strokes={netOf(h, p.key)}
                        par={h.par}
                        handicapReceived={strokesReceivedOnHole(h, p.key)}
                        gross={grossOf(h, p.key)}
                      />
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
                      <StrokeMark
                        strokes={netOf(h, p.key)}
                        par={h.par}
                        handicapReceived={strokesReceivedOnHole(h, p.key)}
                        gross={grossOf(h, p.key)}
                      />
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
                    totStr != null && hasPar ? `neto acumulado ${totStr}` : undefined
                  }
                >
                  {hasPar ? fmtToPar(totTp) : fmtStroke(totStr)}
                </td>
              </tr>
            );
          })}

          {(() => {
            const stripe = "bg-[#091624]";
            const stripeHex = "#091624";
            const d9 = diffAt(9);
            const d18 = diffAt(18);
            const dIn =
              d9 != null && d18 != null ? d18 - d9 : null;
            return (
              <tr className={`border-t-2 border-cyan-500/30 ${stripe}`}>
                <td
                  className={`${stickyName} border-l-2 border-l-amber-400/60`}
                  style={{ backgroundColor: stripeHex }}
                >
                  <span className="block text-amber-200">Diferencial</span>
                  <span className="block text-[8px] font-normal text-slate-400">
                    {shortPlayerLabel(topLabel)} −{" "}
                    {shortPlayerLabel(bottomLabel)}
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
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500/60" />
            Bola baja (mejor neto)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-orange-600/70" />
            Bola alta (segundo neto)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-bold text-amber-300">5</span>
            Neto con ventaja (amarillo)
          </span>
        </div>
        {hasPar ? (
          <p>
            Cada hoyo muestra el <strong>neto</strong> (bruto menos ventajas del
            match). OUT / IN / TOT = <strong>neto vs par</strong> (+5, E, −2).
            Número en <strong className="text-amber-300">amarillo</strong> =
            recibió golpe de ventaja en ese hoyo.
          </p>
        ) : null}
      </div>
    </div>
  );
}
