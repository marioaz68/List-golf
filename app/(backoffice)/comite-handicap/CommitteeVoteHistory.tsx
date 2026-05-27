"use client";

import { useState } from "react";
import {
  distributionChips,
  formatAdjustmentLabel,
} from "@/lib/handicap-committee/constants";
import type { HandicapCommitteeT } from "./HandicapCommitteeVoter";

export type ArchivedSession = {
  id: string;
  session_no: number;
  name: string | null;
  notes: string | null;
  archived_at: string;
  trim_high: number;
  trim_low: number;
  disqualify_threshold: number;
  n_members_present: number;
  n_voters: number;
  n_entries: number;
};

export type ArchivedSnapshot = {
  id: string;
  session_id: string;
  entry_player_name: string | null;
  entry_handicap_index: number | null;
  entry_category_code: string | null;
  n_votes: number;
  n_abstained: number;
  n_disqualify: number;
  avg_adjustment: number | null;
  suggested_hi: number | null;
  votes_anon: Array<{
    value: number;
    trimmed: boolean;
    reason?: "low" | "high" | null;
  }> | null;
};

type Props = {
  sessions: ArchivedSession[];
  snapshotsBySession: Record<string, ArchivedSnapshot[]>;
  t: HandicapCommitteeT;
  locale: "es" | "en";
};

function formatWhen(iso: string, locale: "es" | "en") {
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function CommitteeVoteHistory({
  sessions,
  snapshotsBySession,
  t,
  locale,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const h = t.history;

  if (sessions.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-sm font-bold text-slate-900">{h.title}</h3>
        <p className="mt-2 text-xs text-slate-600">{h.empty}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-sm font-bold text-slate-900">
        {h.titleWithCount.replace("{n}", String(sessions.length))}
      </h3>
      <p className="text-xs text-slate-600">{h.subtitle}</p>

      <ul className="space-y-2">
        {sessions.map((s) => {
          const snaps = snapshotsBySession[s.id] ?? [];
          const isOpen = openId === s.id;
          return (
            <li
              key={s.id}
              className="overflow-hidden rounded-lg border border-slate-300 bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : s.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
              >
                <span className="font-semibold">
                  {s.name ?? `${h.sessionFallback} ${s.session_no}`}
                </span>
                <span className="text-xs text-slate-500">
                  {formatWhen(s.archived_at, locale)} · {s.n_voters}{" "}
                  {h.summaryVoters} · {s.n_entries} {h.summaryPlayers}
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-slate-200 px-3 py-2">
                  <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                    <span>
                      {h.trimSummary
                        .replace("{soft}", String(s.trim_low))
                        .replace("{hard}", String(s.trim_high))}
                    </span>
                    <span>
                      {h.vetoThreshold}{" "}
                      {s.disqualify_threshold || h.thresholdOff}
                    </span>
                    <span>
                      {h.presentLabel} {s.n_members_present}
                    </span>
                    {s.notes ? (
                      <span>
                        {h.notesLabel} {s.notes}
                      </span>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-900">
                      <thead className="bg-slate-100 uppercase text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5">{h.thPlayer}</th>
                          <th className="px-2 py-1.5">{h.thHi}</th>
                          <th className="px-2 py-1.5">{h.thVotes}</th>
                          <th className="px-2 py-1.5">{h.thAvg}</th>
                          <th className="px-2 py-1.5">{h.thHiSug}</th>
                          <th className="px-2 py-1.5">{h.thNoPlay}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snaps.map((row) => {
                          const over =
                            s.disqualify_threshold > 0 &&
                            row.n_disqualify >= s.disqualify_threshold;
                          const chips = distributionChips(
                            (row.votes_anon ?? []).map((v) => ({
                              value: Number(v.value),
                              trimmed: Boolean(v.trimmed),
                              reason:
                                v.reason === "low" || v.reason === "high"
                                  ? v.reason
                                  : null,
                            })),
                            row.n_abstained
                          );
                          return (
                            <tr
                              key={row.id}
                              className="border-t border-slate-100 align-top"
                            >
                              <td className="px-2 py-1.5 font-medium">
                                {row.entry_player_name ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.entry_handicap_index ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap gap-0.5">
                                  {chips.length === 0 ? (
                                    <span className="text-slate-400">—</span>
                                  ) : (
                                    chips.map((v, i) => (
                                      <span
                                        key={i}
                                        title={
                                          v.abstained
                                            ? h.chipAbstention
                                            : v.trimmed
                                              ? h.chipTrimmed
                                              : h.chipLive
                                        }
                                        className={[
                                          "rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums",
                                          v.trimmed
                                            ? "bg-slate-100 text-slate-500 line-through"
                                            : v.abstained
                                              ? "border border-emerald-600 bg-emerald-50 text-emerald-800"
                                              : "bg-emerald-600 text-white",
                                        ].join(" ")}
                                      >
                                        {v.abstained
                                          ? h.chipAbst
                                          : formatAdjustmentLabel(v.value)}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {row.avg_adjustment != null
                                  ? formatAdjustmentLabel(row.avg_adjustment)
                                  : "—"}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums font-semibold">
                                {row.suggested_hi ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                {row.n_disqualify > 0 ? (
                                  <span
                                    className={[
                                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                      over
                                        ? "bg-rose-700 text-white"
                                        : "bg-rose-100 text-rose-800",
                                    ].join(" ")}
                                  >
                                    {row.n_disqualify}
                                    {over ? h.notAuthorized : ""}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
