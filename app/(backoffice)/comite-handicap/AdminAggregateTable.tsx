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
  hp_current: number | null;
  avg_adjustment: number | null;
  suggested_hi: number | null;
  liveCount: number;
  liveIncAbst: number;
  n_abstained: number;
  totalVotesIncAbst: number;
  averageDenominator: number;
  liveAbstainedAsZero: number;
  disqualifyVotes: number;
  discarded_veto_note?: string | null;
  discarded_adj_note?: string | null;
  trim_annulled?: boolean;
  trim_annulled_note?: string | null;
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

function roundToStroke(value: number): number {
  return Math.round(value);
}

/** Ajuste en golpes al HP de torneo: enteros de -5 a 0. */
function clampHpAdjustment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = roundToStroke(value);
  if (rounded > 0) return 0;
  if (rounded < -5) return -5;
  return rounded;
}

function defaultAdjustment(avg: number | null): number {
  if (avg == null || !Number.isFinite(avg)) return 0;
  return clampHpAdjustment(avg);
}

function computeFinalHp(
  current: number | null,
  adjustment: number
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  return Math.max(0, current + adjustment);
}

function formatHpAdj(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
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
      // Por defecto solo preseleccionamos filas con votos y ajuste distinto de cero.
      const adj = defaultAdjustment(r.avg_adjustment);
      init[r.entry_id] =
        r.hp_current != null &&
        r.avg_adjustment != null &&
        r.liveCount > 0 &&
        adj !== 0;
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
    setAdjustments((prev) => ({ ...prev, [entryId]: clampHpAdjustment(raw) }));
  }

  function toggleSelected(entryId: string) {
    setSelected((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  }

  function selectAllEligible() {
    const next: Record<string, boolean> = {};
    for (const r of rows) {
      next[r.entry_id] = r.hp_current != null;
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
          r.hp_current != null
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
            onClick={selectAllEligible}
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
                        selected[r.entry_id] || r.hp_current == null
                    )
                  }
                  onChange={(e) => {
                    if (e.target.checked) selectAllEligible();
                    else clearAllSelected();
                  }}
                  className="h-4 w-4 accent-emerald-700"
                  disabled={anyDisabled}
                />
              </th>
              <th className="px-3 py-2">{tA.thPlayer}</th>
              <th className="px-3 py-2">{tA.thHiCurrent}</th>
              <th className="px-3 py-2">{tA.thVotesAnon}</th>
              <th className="px-3 py-2" title={tA.thLiveAvgTitle}>
                {tA.thLiveAvg}
              </th>
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
              const finalHp = computeFinalHp(r.hp_current, adj);
              const hasVotes =
                r.totalVotesIncAbst > 0 ||
                r.chips.length > 0 ||
                Boolean(r.trim_annulled) ||
                Boolean(r.discarded_veto_note) ||
                Boolean(r.discarded_adj_note);
              const canEdit = r.hp_current != null;
              const isSel = !!selected[r.entry_id];
              const isBusy = busyEntry === r.entry_id;
              const disableApply = anyDisabled || !canEdit || adj === 0;
              const over =
                disqualifyThreshold > 0 &&
                r.disqualifyVotes >= disqualifyThreshold;
              return (
                <tr
                  key={r.entry_id}
                  className={[
                    "border-t border-slate-100 align-top",
                    isSel ? "bg-emerald-50/40" : "",
                    !hasVotes ? "bg-slate-50/60" : "",
                    r.trim_annulled ? "bg-amber-50/70" : "",
                  ].join(" ")}
                >
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelected(r.entry_id)}
                      disabled={anyDisabled || !canEdit}
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
                    {r.discarded_veto_note ? (
                      <p className="mt-1 rounded border border-rose-600 bg-rose-100 px-1.5 py-1 text-[10px] font-bold leading-snug text-rose-950">
                        {r.discarded_veto_note}
                      </p>
                    ) : null}
                    {r.discarded_adj_note ? (
                      <p className="mt-1 rounded border border-orange-500 bg-orange-100 px-1.5 py-1 text-[10px] font-bold leading-snug text-orange-950">
                        {r.discarded_adj_note}
                      </p>
                    ) : null}
                    {r.trim_annulled && r.trim_annulled_note ? (
                      <p className="mt-1 rounded border border-amber-500 bg-amber-100 px-1.5 py-1 text-[10px] font-bold leading-snug text-amber-950">
                        {r.trim_annulled_note}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.hp_current != null ? r.hp_current : "—"}
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
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span title={tA.thAdjTitle}>
                        <span className="text-[10px] font-semibold uppercase text-slate-500">
                          {tA.thAdjShort}
                        </span>{" "}
                        {r.liveCount}
                      </span>
                      <span title={tA.thAbstTitle}>
                        <span className="text-[10px] font-semibold uppercase text-slate-500">
                          {tA.thAbstShort}
                        </span>{" "}
                        {r.n_abstained}
                      </span>
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
                      ? formatHpAdj(clampHpAdjustment(r.avg_adjustment))
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <input
                        type="number"
                        min={-5}
                        max={0}
                        step={1}
                        value={adj}
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
                        title={
                          !hasVotes ? tA.manualAdjNoVotesHint : undefined
                        }
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-semibold">
                    {canEdit && finalHp != null ? (
                      <span
                        className={[
                          "rounded px-2 py-1 tabular-nums",
                          adj === 0
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-100 text-emerald-900",
                        ].join(" ")}
                      >
                        {finalHp}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.disqualifyVotes === 0 && !r.discarded_veto_note ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span
                        className={[
                          "inline-flex flex-col items-start gap-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                          over
                            ? "bg-rose-700 text-white"
                            : r.discarded_veto_note
                              ? "bg-orange-200 text-orange-950"
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
                      disabled={disableApply}
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
