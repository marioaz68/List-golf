"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  HANDICAP_ADJUSTMENT_MAX,
  HANDICAP_ADJUSTMENT_MIN,
  HANDICAP_ADJUSTMENT_STEP,
  formatAdjustmentLabel,
} from "@/lib/handicap-committee/constants";
import type { AppMessages } from "@/lib/i18n/messages";
import { saveHandicapCommitteeVote } from "./actions";
import OpenHandicapFileButton from "./OpenHandicapFileButton";

export type HandicapCommitteeT = AppMessages["handicapCommittee"];

export type HandicapEntryRow = {
  entry_id: string;
  player_id?: string;
  player_name: string;
  ghin_number?: string | null;
  club_label: string | null;
  handicap_index: number | null;
  category_code: string | null;
  gender?: "M" | "F" | null;
  /** Course Handicap calculado con slope/CR/par del campo (entero). */
  course_handicap?: number | null;
  /** Playing Handicap = CH × allowance% (entero). */
  playing_handicap?: number | null;
  /** % de allowance vigente para el torneo (ej. 80 en match play). */
  allowance_pct?: number | null;
  tee_slope?: number | null;
  tee_course_rating?: number | null;
  tee_par?: number | null;
  has_handicap_file?: boolean;
  flagged_for_committee?: boolean;
  flagged_committee_reason?: string | null;
};

export type HandicapVoteRow = {
  entry_id: string;
  adjustment: number | null;
  abstained: boolean;
  disqualify_vote?: boolean;
};

export type HandicapVoteSummaryChip = {
  value: number;
  trimmed: boolean;
  abstained: boolean;
  reason?: "low" | "high" | null;
};

export type HandicapVoteSummaryRow = {
  entry_id: string;
  n_votes: number;
  n_live: number;
  /** Numerador efectivo del promedio (núm. vivos + abstenciones como 0). */
  n_avg_denominator?: number;
  n_abstained?: number;
  avg_adjustment: number | null;
  suggested_hi: number | null;
  n_disqualify?: number;
  disqualified?: boolean;
  /** Distribución anónima (mezclada) de los votos para mostrar al expandir. */
  chips?: HandicapVoteSummaryChip[];
};

type Props = {
  tournamentId: string;
  entries: HandicapEntryRow[];
  myVotes: HandicapVoteRow[];
  committeeOpen: boolean;
  isPresent: boolean;
  isAdmin: boolean;
  voteSummaries?: HandicapVoteSummaryRow[];
  t: HandicapCommitteeT;
};

export default function HandicapCommitteeVoter({
  tournamentId,
  entries,
  myVotes,
  committeeOpen,
  isPresent,
  isAdmin,
  voteSummaries = [],
  t,
}: Props) {
  const vt = t.voter;
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const voteByEntry = useMemo(() => {
    const m = new Map<string, HandicapVoteRow>();
    for (const v of myVotes) m.set(v.entry_id, v);
    return m;
  }, [myVotes]);

  const summaryByEntry = useMemo(() => {
    const m = new Map<string, HandicapVoteSummaryRow>();
    for (const s of voteSummaries) m.set(s.entry_id, s);
    return m;
  }, [voteSummaries]);

  const votedCount = useMemo(
    () => entries.filter((e) => voteByEntry.has(e.entry_id)).length,
    [entries, voteByEntry]
  );

  const qn = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!qn) return entries;
    return entries.filter((e) => {
      const hay = [
        e.player_name,
        e.ghin_number,
        e.club_label,
        e.category_code,
        String(e.handicap_index ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qn);
    });
  }, [entries, qn]);

  const pendingFiltered = useMemo(
    () => filtered.filter((e) => !voteByEntry.has(e.entry_id)),
    [filtered, voteByEntry]
  );
  const votedFiltered = useMemo(
    () => filtered.filter((e) => voteByEntry.has(e.entry_id)),
    [filtered, voteByEntry]
  );

  const pendingTotal = entries.length - votedCount;
  const hasResults = voteSummaries.length > 0;

  type VoteTab = "pending" | "voted" | "results";
  const defaultTab: VoteTab = committeeOpen ? "pending" : "results";
  const [tab, setTab] = useState<VoteTab>(defaultTab);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  // Al regresar del visor del reporte, la URL trae #entry-<id>. Si el
  // jugador está en "Calificados" (ya voté), tenemos que cambiar a esa
  // pestaña antes de que la carta se monte para que el scroll funcione.
  // IMPORTANTE: solo lo aplicamos UNA VEZ al cargar la página; si el efecto
  // dependiera de `tab` o se ejecutara después, se pelearía con el cambio
  // manual del usuario (ej. tocar "Resultados") y revertiría su click.
  const hashAppliedRef = useRef(false);
  useEffect(() => {
    if (hashAppliedRef.current) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#entry-")) {
      hashAppliedRef.current = true;
      return;
    }
    const targetId = hash.slice("#entry-".length);
    if (!targetId) {
      hashAppliedRef.current = true;
      return;
    }

    const isInEntries = entries.some((e) => e.entry_id === targetId);
    if (!isInEntries) {
      hashAppliedRef.current = true;
      return;
    }

    const isInVoted = voteByEntry.has(targetId);
    if (isInVoted) {
      setTab("voted");
    } else if (committeeOpen) {
      setTab("pending");
    }
    hashAppliedRef.current = true;
  }, [voteByEntry, entries, committeeOpen]);

  // Cuando el usuario cambia de pestaña a mano, limpiamos el hash para que
  // no se intente "regresar al jugador" en futuras navegaciones.
  function handleTabClick(next: VoteTab) {
    setTab(next);
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  const canVote = committeeOpen && isPresent;

  return (
    <div className="space-y-3">
      {!isPresent ? (
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">{vt.presenceTitle}</div>
          <p className="mt-1">
            {isAdmin ? vt.presenceAdmin : vt.presenceMember}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {vt.progressLabel}
          </div>
          <div className="text-sm font-bold tabular-nums text-slate-900">
            {votedCount}/{entries.length}
          </div>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{
              width: entries.length
                ? `${Math.round((votedCount / entries.length) * 100)}%`
                : "0%",
            }}
          />
        </div>
        {!committeeOpen ? (
          <p className="mt-1.5 text-xs text-amber-800">{vt.progressClosed}</p>
        ) : (
          <p className="mt-1.5 text-[11px] leading-tight text-slate-600">
            {vt.progressVotePrivate}
          </p>
        )}
      </div>

      {/* Segmented tab bar: Pendientes / Calificados / Resultados */}
      <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-slate-300 bg-white/95 p-1 shadow-sm backdrop-blur">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleTabClick("pending")}
            disabled={!committeeOpen}
            aria-pressed={tab === "pending"}
            className={[
              "flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-[11px] font-bold uppercase tracking-wide shadow-sm transition active:scale-[0.98] active:shadow-inner disabled:opacity-50",
              tab === "pending"
                ? "border-amber-600 bg-amber-500 text-white shadow-md"
                : "border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100 text-amber-900 hover:bg-amber-100",
            ].join(" ")}
          >
            <span>{vt.tabPending}</span>
            <span className="mt-0.5 text-base font-extrabold tabular-nums">
              {pendingTotal}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("voted")}
            aria-pressed={tab === "voted"}
            className={[
              "flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-[11px] font-bold uppercase tracking-wide shadow-sm transition active:scale-[0.98] active:shadow-inner",
              tab === "voted"
                ? "border-emerald-700 bg-emerald-600 text-white shadow-md"
                : "border-emerald-300 bg-gradient-to-b from-emerald-50 to-emerald-100 text-emerald-900 hover:bg-emerald-100",
            ].join(" ")}
          >
            <span>{vt.tabRated}</span>
            <span className="mt-0.5 text-base font-extrabold tabular-nums">
              {votedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleTabClick("results")}
            disabled={!hasResults}
            aria-pressed={tab === "results"}
            className={[
              "flex flex-col items-center justify-center rounded-lg border px-2 py-2 text-[11px] font-bold uppercase tracking-wide shadow-sm transition active:scale-[0.98] active:shadow-inner disabled:opacity-50",
              tab === "results"
                ? "border-slate-950 bg-slate-900 text-white shadow-md"
                : "border-slate-400 bg-gradient-to-b from-slate-50 to-slate-200 text-slate-900 hover:bg-slate-200",
            ].join(" ")}
          >
            <span>{vt.tabResults}</span>
            <span className="mt-0.5 text-base font-extrabold tabular-nums">
              {hasResults ? "✓" : "—"}
            </span>
          </button>
        </div>
      </div>

      {msg ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {msg}
        </div>
      ) : null}

      {tab === "results" && voteSummaries.length > 0 ? (
        <section
          className={[
            "rounded-xl border bg-white p-2 text-slate-900 shadow-sm sm:p-4",
            committeeOpen ? "border-amber-300" : "border-emerald-300",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 sm:px-0">
            <h2 className="text-sm font-bold text-slate-950 sm:text-base">
              {committeeOpen ? vt.resultsLiveTitle : vt.resultsFinalTitle}
            </h2>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                committeeOpen
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white",
              ].join(" ")}
            >
              {committeeOpen ? vt.resultsLiveBadge : vt.resultsFinalBadge}
            </span>
          </div>
          <p className="mt-1 px-1 text-[10px] leading-tight text-slate-600 sm:px-0 sm:text-xs">
            {vt.resultsHelp}
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full table-fixed text-left text-[11px] sm:text-sm">
              <colgroup>
                <col className="w-[36%] sm:w-auto" />
                <col className="w-[10%] sm:w-auto" />
                <col className="w-[12%] sm:w-auto" />
                <col className="w-[10%] sm:w-auto" />
                <col className="w-[12%] sm:w-auto" />
                <col className="w-[10%] sm:w-auto" />
                <col className="w-[10%] sm:w-auto" />
              </colgroup>
              <thead className="bg-slate-100 text-[9px] uppercase text-slate-600 sm:text-xs">
                <tr>
                  <th className="px-1 py-1.5 sm:px-3 sm:py-2">{vt.thPlayer}</th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thHiTitle}
                  >
                    {vt.thHi}
                  </th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thVotesTitle}
                  >
                    {vt.thVotes}
                  </th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thLiveTitle}
                  >
                    {vt.thLive}
                  </th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thAvgTitle}
                  >
                    {vt.thAvg}
                  </th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thHiSugTitle}
                  >
                    {vt.thHiSug}
                  </th>
                  <th
                    className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                    title={vt.thVetosTitle}
                  >
                    {vt.thVetos}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const s = summaryByEntry.get(e.entry_id);
                  const nAbst = s?.n_abstained ?? 0;
                  const totalVotes = (s?.n_votes ?? 0) + nAbst;
                  const liveIncAbst = (s?.n_live ?? 0) + nAbst;
                  const isExpanded = expandedResultId === e.entry_id;
                  const chips = s?.chips ?? [];
                  return (
                    <Fragment key={e.entry_id}>
                      <tr
                        className={[
                          "cursor-pointer border-t border-slate-100 align-top transition hover:bg-slate-50",
                          s?.disqualified ? "bg-rose-50" : "",
                          isExpanded ? "bg-slate-50" : "",
                        ].join(" ")}
                        onClick={() =>
                          setExpandedResultId((prev) =>
                            prev === e.entry_id ? null : e.entry_id
                          )
                        }
                      >
                        <td className="px-1 py-1.5 font-medium sm:px-3 sm:py-2">
                          <div className="flex items-start gap-1">
                            <span
                              className="text-[9px] text-blue-600 sm:text-[10px]"
                              aria-hidden="true"
                            >
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <span className="text-blue-700 underline decoration-blue-500 decoration-dotted underline-offset-2 leading-tight">
                              {e.player_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-center tabular-nums sm:px-3 sm:py-2 sm:text-left">
                          {e.handicap_index ?? "—"}
                        </td>
                        <td
                          className="px-1 py-1.5 text-center tabular-nums sm:px-3 sm:py-2 sm:text-left"
                          title={vt.thVotesTitle}
                        >
                          {totalVotes > 0 ? (
                            <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">
                              {totalVotes}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className="px-1 py-1.5 text-center tabular-nums sm:px-3 sm:py-2 sm:text-left"
                          title={vt.thLiveTitle}
                        >
                          {totalVotes > 0 ||
                          (s?.n_avg_denominator != null &&
                            s.n_avg_denominator > 0) ? (
                            <span className="inline-block rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-800 sm:px-1.5 sm:py-0.5 sm:text-[11px]">
                              {liveIncAbst}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-center tabular-nums sm:px-3 sm:py-2 sm:text-left">
                          {s?.avg_adjustment != null
                            ? formatAdjustmentLabel(s.avg_adjustment)
                            : "—"}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold tabular-nums text-emerald-800 sm:px-3 sm:py-2 sm:text-left sm:font-semibold">
                          {s?.suggested_hi ?? "—"}
                        </td>
                        <td
                          className="px-1 py-1.5 text-center sm:px-3 sm:py-2 sm:text-left"
                          title={vt.thVetosTitle}
                        >
                          {(s?.n_disqualify ?? 0) > 0 ? (
                            <span
                              className={[
                                "inline-block rounded px-1 text-[10px] font-semibold sm:px-2 sm:py-0.5 sm:text-[11px]",
                                s?.disqualified
                                  ? "bg-rose-700 text-white"
                                  : "bg-rose-100 text-rose-800",
                              ].join(" ")}
                            >
                              ⊘ {s?.n_disqualify}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-t border-slate-100 bg-slate-50">
                          <td
                            colSpan={7}
                            className="px-2 py-2 sm:px-3 sm:py-3"
                          >
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {vt.expandedTitle}
                              </div>
                              {chips.length === 0 ? (
                                <div className="text-[11px] text-slate-500">
                                  {vt.expandedNoVotes}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {chips.map((c, idx) => (
                                    <span
                                      key={`${e.entry_id}-c-${idx}`}
                                      title={
                                        c.abstained
                                          ? vt.chipAbstainTitle
                                          : c.trimmed
                                            ? c.reason === "low"
                                              ? vt.chipTrimmedLow
                                              : vt.chipTrimmedHigh
                                            : vt.chipLive
                                      }
                                      className={[
                                        "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                                        c.trimmed
                                          ? "border border-slate-300 bg-white text-slate-500 line-through"
                                          : c.abstained
                                            ? "border border-emerald-600 bg-emerald-50 text-emerald-800"
                                            : "bg-emerald-600 text-white",
                                      ].join(" ")}
                                    >
                                      {c.abstained
                                        ? vt.chipAbst
                                        : formatAdjustmentLabel(c.value)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-700 sm:text-xs">
                                <div className="rounded bg-white px-1.5 py-1 text-center">
                                  <div className="text-[8px] uppercase text-slate-500 sm:text-[10px]">
                                    {vt.expandedHi}
                                  </div>
                                  <div className="font-bold tabular-nums">
                                    {e.handicap_index ?? "—"}
                                  </div>
                                </div>
                                <div className="rounded bg-white px-1.5 py-1 text-center">
                                  <div className="text-[8px] uppercase text-slate-500 sm:text-[10px]">
                                    {vt.expandedAvg}
                                  </div>
                                  <div className="font-bold tabular-nums">
                                    {s?.avg_adjustment != null
                                      ? formatAdjustmentLabel(s.avg_adjustment)
                                      : "—"}
                                  </div>
                                </div>
                                <div className="rounded bg-white px-1.5 py-1 text-center">
                                  <div className="text-[8px] uppercase text-slate-500 sm:text-[10px]">
                                    {vt.expandedHiSug}
                                  </div>
                                  <div className="font-bold tabular-nums text-emerald-700">
                                    {s?.suggested_hi ?? "—"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] leading-tight text-slate-600 sm:text-[11px]">
            <span><b>{vt.thHi}</b> = {vt.legendHi}</span>
            <span><b>{vt.thVotes}</b> = {vt.legendVotes}</span>
            <span><b>{vt.thLive}</b> = {vt.legendLive}</span>
            <span><b>{vt.thAvg}</b> = {vt.legendAvg}</span>
            <span><b>{vt.thHiSug}</b> = {vt.legendHiSug}</span>
            <span><b>⊘ {vt.thVetos}</b> = {vt.legendVetos}</span>
          </div>
        </section>
      ) : null}

      {(tab === "pending" && committeeOpen) || tab === "voted" ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={vt.searchPlaceholder}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                aria-label={vt.clearSearch}
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
            {tab === "pending" ? (
              <>
                <span>
                  {vt.pendingMissing}{" "}
                  <span className="text-base font-extrabold text-amber-700 tabular-nums">
                    {pendingFiltered.length}
                  </span>
                  {qn ? vt.pendingFiltered : ""}
                </span>
                <span className="text-slate-500">
                  {vt.pendingRated} {votedCount}/{entries.length}
                </span>
              </>
            ) : (
              <>
                <span>
                  {vt.ratedShowing}{" "}
                  <span className="text-base font-extrabold text-emerald-700 tabular-nums">
                    {votedFiltered.length}
                  </span>{" "}
                  {vt.ratedSuffix}
                </span>
                <span className="text-slate-500">
                  {vt.ratedRemaining} {pendingTotal} {vt.ratedOf}{" "}
                  {entries.length}
                </span>
              </>
            )}
          </div>

          <div className="space-y-2">
            {(tab === "pending" ? pendingFiltered : votedFiltered).map(
              (entry) => (
                <PlayerVoteCard
                  key={entry.entry_id}
                  entry={entry}
                  tournamentId={tournamentId}
                  initial={voteByEntry.get(entry.entry_id)}
                  summary={summaryByEntry.get(entry.entry_id)}
                  disabled={!canVote || pending}
                  committeeOpen={committeeOpen}
                  collapsedByDefault={tab === "voted"}
                  onSaved={() => setMsg("")}
                  onError={(e) => setMsg(e)}
                  startTransition={startTransition}
                  t={t}
                />
              )
            )}
            {(tab === "pending" ? pendingFiltered : votedFiltered).length ===
            0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
                {tab === "pending"
                  ? qn
                    ? vt.emptyPendingSearch
                    : vt.emptyPendingDone
                  : qn
                    ? vt.emptyRatedSearch
                    : vt.emptyRatedNone}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === "pending" && !committeeOpen ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {vt.closedHint}
        </div>
      ) : null}

      {tab === "results" && voteSummaries.length === 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {vt.resultsEmpty}
        </div>
      ) : null}
    </div>
  );
}

function PlayerVoteCard({
  entry,
  tournamentId,
  initial,
  summary,
  disabled,
  committeeOpen,
  collapsedByDefault = false,
  onSaved,
  onError,
  startTransition,
  t,
}: {
  entry: HandicapEntryRow;
  tournamentId: string;
  initial?: HandicapVoteRow;
  summary?: HandicapVoteSummaryRow;
  disabled: boolean;
  committeeOpen: boolean;
  collapsedByDefault?: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
  startTransition: (fn: () => void) => void;
  t: HandicapCommitteeT;
}) {
  const c = t.card;
  const saved = Boolean(initial);
  const defaultAdjustment =
    initial?.abstained || initial?.adjustment == null
      ? -1.0
      : Number(initial.adjustment);

  const [abstained, setAbstained] = useState(initial?.abstained ?? false);
  const [adjustment, setAdjustment] = useState(defaultAdjustment);
  const [disqualify, setDisqualify] = useState<boolean>(
    initial?.disqualify_vote ?? false
  );
  const [editing, setEditing] = useState(!saved);
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState(!collapsedByDefault);

  const articleId = `entry-${entry.entry_id}`;
  const articleRef = useRef<HTMLElement | null>(null);

  // Si esta carta es la del hash actual (regreso desde el visor de reporte),
  // la abrimos y la centramos en pantalla. Esperamos a que el navegador
  // termine su scroll-restoration y a que el contenido expandido se
  // renderee antes de tomar el control del scroll. Después limpiamos el
  // hash para que el regreso solo ocurra una vez.
  const scrollAppliedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (scrollAppliedRef.current) return;
    if (window.location.hash !== `#${articleId}`) return;
    setOpen(true);
    scrollAppliedRef.current = true;
    let raf = 0;
    const t = window.setTimeout(() => {
      raf = window.requestAnimationFrame(() => {
        articleRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      });
    }, 250);
    return () => {
      window.clearTimeout(t);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [articleId]);

  const lockedByClosing = !committeeOpen;

  async function handleSave() {
    const fd = new FormData();
    fd.set("tournament_id", tournamentId);
    fd.set("entry_id", entry.entry_id);
    fd.set("abstained", abstained ? "true" : "false");
    fd.set("disqualify_vote", disqualify ? "true" : "false");
    if (!abstained) fd.set("adjustment", String(adjustment));

    const res = await saveHandicapCommitteeVote(fd);
    if (!res.ok) {
      onError(res.error ?? c.errorSave);
      return;
    }
    onSaved();
    setJustSaved(true);
    setEditing(false);
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  function handleCancel() {
    setAbstained(initial?.abstained ?? false);
    setAdjustment(defaultAdjustment);
    setDisqualify(initial?.disqualify_vote ?? false);
    setEditing(false);
  }

  const showControls = editing && !lockedByClosing;
  const hiDisplay =
    entry.handicap_index != null ? entry.handicap_index.toFixed(1) : "—";

  const flagged = entry.flagged_for_committee === true;

  return (
    <article
      ref={articleRef}
      id={articleId}
      className={[
        "scroll-mt-20 rounded-lg border shadow-sm",
        flagged
          ? "border-rose-400 bg-rose-50/50 text-slate-900 ring-1 ring-rose-200"
          : saved
            ? "border-emerald-400/70 bg-emerald-50/40 text-slate-900"
            : "border-slate-300 bg-white text-slate-900",
      ].join(" ")}
    >
      {/* Cabecera siempre visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="truncate text-sm font-semibold leading-tight text-slate-950">
              {entry.player_name}
            </span>
            {entry.ghin_number ? (
              <span
                className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-slate-700"
                title={c.ghinTitle}
              >
                {c.ghinChip} {entry.ghin_number}
              </span>
            ) : null}
            {flagged ? (
              <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                {c.reviewBadge}
              </span>
            ) : null}
          </div>
          {flagged && entry.flagged_committee_reason ? (
            <p className="mt-0.5 text-[10px] font-medium text-rose-800">
              {entry.flagged_committee_reason}
            </p>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] leading-tight text-slate-600">
            {entry.club_label ? (
              <span className="truncate">{entry.club_label}</span>
            ) : null}
            {entry.category_code ? (
              <span className="rounded bg-slate-100 px-1 font-semibold text-slate-700">
                {entry.category_code}
              </span>
            ) : null}
            {entry.gender ? (
              <span
                className={[
                  "rounded px-1 font-semibold",
                  entry.gender === "F"
                    ? "bg-pink-100 text-pink-800"
                    : "bg-sky-100 text-sky-800",
                ].join(" ")}
              >
                {entry.gender === "F" ? "♀" : "♂"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-baseline gap-0.5 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <span className="opacity-70">{c.hiLabel}</span>
            <span className="tabular-nums">{hiDisplay}</span>
          </div>
          {entry.course_handicap != null ? (
            <div
              className="flex items-baseline gap-0.5 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
              title={
                entry.tee_slope != null
                  ? `${c.chTitlePrefix} ${entry.tee_slope} · CR ${entry.tee_course_rating} · Par ${entry.tee_par}`
                  : c.chTitleFallback
              }
            >
              <span className="opacity-70">{c.chLabel}</span>
              <span className="tabular-nums">{entry.course_handicap}</span>
            </div>
          ) : null}
          {entry.playing_handicap != null ? (
            <div
              className="flex items-baseline gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
              title={
                entry.allowance_pct != null
                  ? `${c.phTitlePrefix} ${entry.allowance_pct}%)`
                  : c.phTitleFallback
              }
            >
              <span className="opacity-70">{c.phLabel}</span>
              <span className="tabular-nums">{entry.playing_handicap}</span>
              {entry.allowance_pct != null ? (
                <span className="opacity-70">·{entry.allowance_pct}%</span>
              ) : null}
            </div>
          ) : null}
          {saved ? (
            <span
              className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white"
              aria-label={c.savedAria}
            >
              {justSaved ? c.savedJustNow : "✓"}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
              {committeeOpen ? c.pendBadge : "—"}
            </span>
          )}
          <span
            className="ml-0.5 text-[10px] text-slate-400"
            aria-hidden="true"
          >
            {open ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {!open ? null : (
        <div className="px-2.5 pb-2.5">

      {entry.player_id && entry.has_handicap_file ? (
        <div className="mb-2">
          <OpenHandicapFileButton
            playerId={entry.player_id}
            entryId={entry.entry_id}
            hasFile={Boolean(entry.has_handicap_file)}
            compact={false}
            label={c.voteOpenReport}
          />
        </div>
      ) : null}

      {!showControls && saved ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <div className="text-sm text-slate-800">
            {initial?.abstained ? (
              <>
                <span className="font-semibold">{c.youAbstained}</span>{" "}
                {c.onThisPlayer}
              </>
            ) : (
              <>
                {c.ratingSavedPrefix}{" "}
                <span className="font-bold tabular-nums text-slate-950">
                  {formatAdjustmentLabel(initial?.adjustment ?? null)} {c.pts}
                </span>
              </>
            )}
            {initial?.disqualify_vote ? (
              <div className="mt-1 text-xs font-semibold text-rose-700">
                {c.dqMarkedLine}
              </div>
            ) : null}
          </div>

          {lockedByClosing ? (
            <span className="text-[11px] font-semibold uppercase text-amber-800">
              {c.lockedHint}
            </span>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
            >
              {c.editBtn}
            </button>
          )}
        </div>
      ) : null}

      {showControls ? (
        <>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAbstained((v) => !v)}
              aria-pressed={abstained}
              className={[
                "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition disabled:opacity-50",
                abstained
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold",
                  abstained
                    ? "border-white bg-white text-slate-900"
                    : "border-slate-400 bg-white text-transparent",
                ].join(" ")}
                aria-hidden="true"
              >
                ✓
              </span>
              <span className="text-sm font-semibold">{c.abstainBtn}</span>
            </button>

            {!abstained ? (
              <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">
                    {c.lowerHiLabel}
                  </span>
                  <span className="font-bold tabular-nums text-slate-950">
                    {formatAdjustmentLabel(adjustment)} {c.pts}
                  </span>
                </div>
                <input
                  type="range"
                  min={HANDICAP_ADJUSTMENT_MIN}
                  max={HANDICAP_ADJUSTMENT_MAX}
                  step={HANDICAP_ADJUSTMENT_STEP}
                  value={adjustment}
                  disabled={disabled}
                  onChange={(e) => setAdjustment(Number(e.target.value))}
                  className="h-3 w-full accent-slate-800"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{c.sliderMin}</span>
                  <span>{c.sliderMax}</span>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={disabled}
              onClick={() => setDisqualify((v) => !v)}
              aria-pressed={disqualify}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition disabled:opacity-50",
                disqualify
                  ? "border-rose-700 bg-rose-700 text-white shadow-md"
                  : "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-base font-bold",
                    disqualify
                      ? "border-white bg-white text-rose-700"
                      : "border-rose-500 bg-white text-transparent",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-bold leading-tight">
                    {c.dqTitle}
                  </span>
                  <span
                    className={[
                      "mt-0.5 text-xs leading-tight",
                      disqualify ? "text-rose-100" : "text-rose-700",
                    ].join(" ")}
                  >
                    {c.dqHint}
                  </span>
                </span>
              </span>
              <span
                className={[
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
                  disqualify
                    ? "bg-white text-rose-700"
                    : "border border-rose-400 text-rose-700",
                ].join(" ")}
              >
                {disqualify ? c.dqBadgeMarked : c.dqBadgeTap}
              </span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => startTransition(() => handleSave())}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saved ? c.saveBtnUpdate : c.saveBtn}
            </button>
            {saved ? (
              <button
                type="button"
                disabled={disabled}
                onClick={handleCancel}
                className="rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                {c.cancelBtn}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {!showControls && !saved && lockedByClosing ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {c.tooLateClosed}
        </div>
      ) : null}

      {lockedByClosing && summary ? (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {c.summaryHiCurrent}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-950">
              {entry.handicap_index ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {c.summaryAvg}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-950">
              {summary.avg_adjustment != null
                ? formatAdjustmentLabel(summary.avg_adjustment)
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500">
              {summary.n_live} {c.summaryLiveLong} / {summary.n_votes}{" "}
              {c.summaryNumShort}
              {summary.n_avg_denominator ??
                summary.n_live + (summary.n_abstained ?? 0)}
              {(summary.n_abstained ?? 0) > 0
                ? ` (${summary.n_abstained} ${c.summaryAbstSuffix})`
                : ""}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {c.summaryHiSug}
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
              {summary.suggested_hi ?? "—"}
            </div>
          </div>
        </div>
      ) : null}
        </div>
      )}
    </article>
  );
}
