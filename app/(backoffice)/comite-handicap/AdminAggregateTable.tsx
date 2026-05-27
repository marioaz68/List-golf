"use client";

import { useMemo, useState, useTransition } from "react";
import { formatAdjustmentLabel } from "@/lib/handicap-committee/constants";
import {
  applyHandicapCommitteeSuggestion,
  applyHandicapCommitteeSuggestionsBulk,
} from "./actions";
import type { HandicapCommitteeT } from "./HandicapCommitteeVoter";

export type AdminAggregateRow = {
  entry_id: string;
  player_name: string;
  ghin_number: string | null;
  hi_current: number | null;
  avg_adjustment: number | null;
  suggested_hi: number | null;
  liveCount: number;
  liveIncAbst: number;
  totalVotesIncAbst: number;
  averageDenominator: number;
  liveAbstainedAsZero: number;
  disqualifyVotes: number;
  chips: Array<{
    value: number;
    trimmed: boolean;
    abstained: boolean;
    reason: "low" | "high" | null;
  }>;
};

type Props = {
  rows: AdminAggregateRow[];
  tournamentId: string;
  disqualifyThreshold: number;
  t: HandicapCommitteeT;
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Limita un ajuste a [-5, 0] redondeado a paso 0.1. */
function clampAdjustment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = roundToTenth(value);
  if (rounded > 0) return 0;
  if (rounded < -5) return -5;
  return rounded;
}

function defaultAdjustment(avg: number | null): number {
  if (avg == null || !Number.isFinite(avg)) return 0;
  return clampAdjustment(avg);
}

function computeFinalHi(
  current: number | null,
  adjustment: number
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  return Math.round((current + adjustment) * 10) / 10;
}

export default function AdminAggregateTable({
  rows,
  tournamentId,
  disqualifyThreshold,
  t,
}: Props) {
  const tA = t.admin;

  const [adjustments, setAdjustments] = useState<Record<string, number>>(
    () => {
      const init: Record<string, number> = {};
      for (const r of rows) {
        init[r.entry_id] = defaultAdjustment(r.avg_adjustment);
      }
      return init;
    }
  );

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const r of rows) {
      // Por defecto, marcamos las filas con votos vivos y promedio calculado.
      init[r.entry_id] =
        r.avg_adjustment != null && r.liveCount > 0;
    }
    return init;
  });

  const [pending, startTransition] = useTransition();
  const [busyEntry, setBusyEntry] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedCount = useMemo(
    () =>
      Object.entries(selected).filter(
        ([id, on]) => on && adjustments[id] != null && adjustments[id] !== 0
      ).length,
    [selected, adjustments]
  );

  function updateAdjustment(entryId: string, raw: number) {
    setAdjustments((prev) => ({ ...prev, [entryId]: clampAdjustment(raw) }));
  }

  function toggleSelected(entryId: string) {
    setSelected((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  }

  function selectAllWithVotes() {
    const next: Record<string, boolean> = {};
    for (const r of rows) {
      next[r.entry_id] =
        r.avg_adjustment != null && r.liveCount > 0;
    }
    setSelected(next);
  }

  function clearAllSelected() {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.entry_id] = false;
    setSelected(next);
  }

  function handleApplyOne(entryId: string) {
    const adj = adjustments[entryId];
    if (adj == null || adj === 0) return;
    setBusyEntry(entryId);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("tournament_id", tournamentId);
        fd.set("entry_id", entryId);
        fd.set("adjustment_override", String(adj));
        await applyHandicapCommitteeSuggestion(fd);
      } finally {
        setBusyEntry(null);
      }
    });
  }

  function handleApplyBulk() {
    const ids = rows
      .filter(
        (r) =>
          selected[r.entry_id] &&
          adjustments[r.entry_id] != null &&
          adjustments[r.entry_id] !== 0 &&
          r.hi_current != null
      )
      .map((r) => r.entry_id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("tournament_id", tournamentId);
        fd.set("entry_ids", ids.join(","));
        for (const id of ids) {
          fd.set(`adj_${id}`, String(adjustments[id]));
        }
        await applyHandicapCommitteeSuggestionsBulk(fd);
      } finally {
        setBulkBusy(false);
      }
    });
  }

  const anyDisabled = pending || bulkBusy;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-950">
            {tA.bulkBarTitle}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">{tA.bulkBarHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAllWithVotes}
            disabled={anyDisabled}
            className="rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {tA.bulkBarSelectAll}
          </button>
          <button
            type="button"
            onClick={clearAllSelected}
            disabled={anyDisabled}
            className="rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {tA.bulkBarClear}
          </button>
          <button
            type="button"
            onClick={handleApplyBulk}
            disabled={anyDisabled || selectedCount === 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
          >
            {bulkBusy
              ? tA.bulkBarApplying
              : `${tA.applyAllBtn} (${selectedCount})`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm text-slate-900">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  aria-label={tA.bulkBarSelectAll}
                  checked={
                    rows.length > 0 &&
                    rows.every(
                      (r) =>
                        selected[r.entry_id] ||
                        r.avg_adjustment == null ||
                        r.liveCount === 0
                    )
                  }
                  onChange={(e) => {
                    if (e.target.checked) selectAllWithVotes();
                    else clearAllSelected();
                  }}
                  className="h-4 w-4 accent-emerald-700"
                  disabled={anyDisabled}
                />
              </th>
              <th className="px-3 py-2">{tA.thPlayer}</th>
              <th className="px-3 py-2">{tA.thHiCurrent}</th>
              <th className="px-3 py-2">{tA.thVotesAnon}</th>
              <th className="px-3 py-2">{tA.thLiveAvg}</th>
              <th className="px-3 py-2">{tA.thAvgTrim}</th>
              <th className="px-3 py-2" title={tA.thRoundedAdjTitle}>
                {tA.thRoundedAdj}
              </th>
              <th className="px-3 py-2" title={tA.thFinalHiTitle}>
                {tA.thFinalHi}
              </th>
              <th className="px-3 py-2">{tA.thNoPlay}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const adj = adjustments[r.entry_id] ?? 0;
              const finalHi = computeFinalHi(r.hi_current, adj);
              const hasVotes = r.avg_adjustment != null && r.liveCount > 0;
              const isSel = !!selected[r.entry_id];
              const isBusy = busyEntry === r.entry_id;
              const disableRow = anyDisabled || !hasVotes || r.hi_current == null;
              const over =
                disqualifyThreshold > 0 &&
                r.disqualifyVotes >= disqualifyThreshold;
              return (
                <tr
                  key={r.entry_id}
                  className={[
                    "border-t border-slate-100 align-top",
                    isSel ? "bg-emerald-50/40" : "",
                  ].join(" ")}
                >
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelected(r.entry_id)}
                      disabled={anyDisabled || !hasVotes || r.hi_current == null}
                      className="h-4 w-4 accent-emerald-700"
                      aria-label={r.player_name}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span>{r.player_name}</span>
                      {r.ghin_number ? (
                        <span
                          className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-slate-700"
                          title={tA.ghinTitle}
                        >
                          GHIN {r.ghin_number}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.hi_current != null ? r.hi_current.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.chips.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          {tA.noVotes}
                        </span>
                      ) : (
                        r.chips.map((v, idx) => (
                          <span
                            key={`${r.entry_id}-${idx}`}
                            title={
                              v.abstained
                                ? tA.chipAbstain
                                : v.trimmed
                                  ? v.reason === "low"
                                    ? tA.chipTrimmedLow
                                    : tA.chipTrimmedHigh
                                  : tA.chipLive
                            }
                            className={[
                              "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                              v.trimmed
                                ? "border border-slate-300 bg-slate-100 text-slate-500 line-through"
                                : v.abstained
                                  ? "border border-emerald-600 bg-emerald-50 text-emerald-800"
                                  : "bg-emerald-600 text-white",
                            ].join(" ")}
                          >
                            {v.abstained
                              ? tA.chipAbst
                              : formatAdjustmentLabel(v.value)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <div>
                      {r.liveIncAbst} / {r.totalVotesIncAbst}
                    </div>
                    <div className="text-[10px] font-normal text-slate-500">
                      {tA.avgDivisor}
                      {r.averageDenominator}
                      {r.liveAbstainedAsZero > 0
                        ? ` (${r.liveAbstainedAsZero} ${tA.abstAsZero})`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.avg_adjustment != null
                      ? formatAdjustmentLabel(r.avg_adjustment)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {hasVotes ? (
                      <input
                        type="number"
                        min={-5}
                        max={0}
                        step={0.1}
                        value={Number(adj.toFixed(1))}
                        disabled={anyDisabled}
                        onChange={(ev) =>
                          updateAdjustment(r.entry_id, Number(ev.target.value))
                        }
                        className={[
                          "w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm font-bold tabular-nums",
                          adj === 0
                            ? "text-slate-400"
                            : "text-emerald-800",
                        ].join(" ")}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">
                        {tA.noLiveVotes}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-semibold">
                    {hasVotes && finalHi != null ? (
                      <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900">
                        {finalHi.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.disqualifyVotes === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span
                        className={[
                          "inline-flex flex-col items-start gap-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                          over
                            ? "bg-rose-700 text-white"
                            : "bg-rose-100 text-rose-800",
                        ].join(" ")}
                        title={
                          over
                            ? tA.thresholdAuto
                            : disqualifyThreshold > 0
                              ? `${tA.thresholdConfigured} ${disqualifyThreshold}`
                              : tA.thresholdInfo
                        }
                      >
                        <span>
                          {r.disqualifyVotes}
                          {disqualifyThreshold > 0
                            ? ` / ${disqualifyThreshold}`
                            : ""}{" "}
                          {tA.votesWord}
                        </span>
                        {over ? (
                          <span className="text-[10px] uppercase tracking-wide">
                            {tA.notAuthorized}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleApplyOne(r.entry_id)}
                      disabled={disableRow || adj === 0}
                      className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {isBusy ? tA.bulkBarApplying : tA.applyHi}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
