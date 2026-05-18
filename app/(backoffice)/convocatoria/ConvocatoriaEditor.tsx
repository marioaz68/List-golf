"use client";

import { useCallback, useMemo, useState } from "react";
import type { ConvocatoriaWorkflowStatus } from "@/lib/convocatoria/draftUtils";
import { refreshCutRulesFromMeta } from "@/lib/convocatoria/draftUtils";
import type {
  ConvocatoriaDraft,
  ConvocatoriaReference,
  DraftCategory,
  DraftCompetitionRule,
  DraftCutRule,
  DraftPrizeRule,
} from "@/lib/convocatoria/types";
import {
  applyConvocatoriaToTournament,
  closeConvocatoria,
  reopenConvocatoria,
  saveConvocatoriaDraft,
} from "./actions";

const inputClass =
  "w-full min-w-0 rounded border border-white/15 bg-[#0a1220] px-1.5 py-1 text-[11px] text-white";

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "32px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #166534",
};

const warnStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#f59e0b, #b45309)",
  border: "1px solid #92400e",
};

type Tab =
  | "meta"
  | "reference"
  | "categories"
  | "competition"
  | "cuts"
  | "prizes";

export type ConvocatoriaEditorLabels = {
  statusEditing: string;
  statusClosed: string;
  statusApplied: string;
  tabMeta: string;
  tabReference: string;
  tabCategories: string;
  tabCompetition: string;
  tabCuts: string;
  tabPrizes: string;
  saveDraft: string;
  closeConvocatoria: string;
  reopenConvocatoria: string;
  generateParams: string;
  generateBlocked: string;
  confirmClose: string;
  confirmGenerate: string;
  metaTitle: string;
  metaHoles: string;
  metaCutHoles: string;
  metaCutPct: string;
  metaRounds: string;
  metaPracticeDay: string;
  metaHandicapDate: string;
  refSystem: string;
  refGentlemen: string;
  refLadies: string;
  refSeniorsAges: string;
  refCutPolicy: string;
  refCutTiebreakGross: string;
  refCutTiebreakStableford: string;
  refCutTiebreakSeniors: string;
  refTrophyTiebreak: string;
  refTrophies: string;
  refOutOfScope: string;
  colCode: string;
  colName: string;
  colHcp: string;
  colCut: string;
  colGroup: string;
  colGender: string;
  addCategory: string;
  warnings: string;
  readOnlyHint: string;
};

type Props = {
  tournamentId: string;
  initialDraft: ConvocatoriaDraft;
  workflowStatus: ConvocatoriaWorkflowStatus;
  templateName: string | null;
  hasEntries: boolean;
  labels: ConvocatoriaEditorLabels;
};

export default function ConvocatoriaEditor({
  tournamentId,
  initialDraft,
  workflowStatus: initialStatus,
  templateName,
  hasEntries,
  labels,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [tab, setTab] = useState<Tab>("meta");
  const [status, setStatus] = useState(initialStatus);

  const readOnly = status === "closed" || status === "applied";
  const canGenerate = status === "closed" && !hasEntries;
  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);

  const patch = useCallback((next: ConvocatoriaDraft) => {
    setDraft(refreshCutRulesFromMeta(next));
  }, []);

  const updateMeta = (key: keyof ConvocatoriaDraft["meta"], value: string) => {
    const stringKeys: (keyof ConvocatoriaDraft["meta"])[] = [
      "title",
      "practice_day",
      "handicap_index_date",
    ];
    const next =
      stringKeys.includes(key) || value === ""
        ? value || null
        : Number.isFinite(Number(value))
          ? Number(value)
          : value || null;
    patch({
      ...draft,
      meta: { ...draft.meta, [key]: next },
    });
  };

  const updateReference = (
    key: keyof ConvocatoriaReference,
    value: string
  ) => {
    patch({
      ...draft,
      reference: {
        ...(draft.reference ?? ({} as ConvocatoriaReference)),
        [key]: value,
      },
    });
  };

  const updateCategory = (index: number, partial: Partial<DraftCategory>) => {
    const categories = draft.categories.map((c, i) =>
      i === index ? { ...c, ...partial } : c
    );
    patch({ ...draft, categories });
  };

  const updateCompetition = (
    index: number,
    partial: Partial<DraftCompetitionRule>
  ) => {
    const competition_rules = draft.competition_rules.map((r, i) =>
      i === index ? { ...r, ...partial } : r
    );
    patch({ ...draft, competition_rules });
  };

  const updateCut = (index: number, partial: Partial<DraftCutRule>) => {
    const cut_rules = draft.cut_rules.map((r, i) =>
      i === index ? { ...r, ...partial } : r
    );
    patch({ ...draft, cut_rules });
  };

  const updatePrize = (index: number, partial: Partial<DraftPrizeRule>) => {
    const prize_rules = draft.prize_rules.map((r, i) =>
      i === index ? { ...r, ...partial } : r
    );
    patch({ ...draft, prize_rules });
  };

  const statusLabel =
    status === "applied"
      ? labels.statusApplied
      : status === "closed"
        ? labels.statusClosed
        : labels.statusEditing;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2">
        <div>
          <p className="text-[12px] font-semibold text-cyan-50">
            {draft.meta.title ?? templateName ?? "Convocatoria"}
          </p>
          <p className="text-[11px] text-cyan-200/80">{statusLabel}</p>
        </div>
        {readOnly ? (
          <p className="text-[10px] text-amber-200/90">{labels.readOnlyHint}</p>
        ) : null}
      </div>

      {draft.warnings.length > 0 ? (
        <ul className="list-disc space-y-0.5 rounded border border-amber-500/30 bg-amber-950/30 px-4 py-2 text-[10px] text-amber-100">
          <li className="font-semibold">{labels.warnings}</li>
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["meta", labels.tabMeta],
            ["reference", labels.tabReference],
            ["categories", labels.tabCategories],
            ["competition", labels.tabCompetition],
            ["cuts", labels.tabCuts],
            ["prizes", labels.tabPrizes],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              ...buttonStyle,
              minHeight: "28px",
              fontSize: "11px",
              ...(tab === id
                ? { background: "#0e7490", borderColor: "#22d3ee" }
                : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0f172a] p-3">
        {tab === "meta" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-[10px] text-slate-400">
              {labels.metaTitle}
              <input
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.title ?? ""}
                onChange={(e) =>
                  patch({
                    ...draft,
                    meta: { ...draft.meta, title: e.target.value },
                  })
                }
              />
            </label>
            <label className="block text-[10px] text-slate-400">
              {labels.metaHoles}
              <input
                type="number"
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.total_holes ?? ""}
                onChange={(e) => updateMeta("total_holes", e.target.value)}
              />
            </label>
            <label className="block text-[10px] text-slate-400">
              {labels.metaCutHoles}
              <input
                type="number"
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.cut_after_holes ?? ""}
                onChange={(e) => updateMeta("cut_after_holes", e.target.value)}
              />
            </label>
            <label className="block text-[10px] text-slate-400">
              {labels.metaCutPct}
              <input
                type="number"
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.cut_percent ?? ""}
                onChange={(e) => updateMeta("cut_percent", e.target.value)}
              />
            </label>
            <label className="block text-[10px] text-slate-400">
              {labels.metaRounds}
              <input
                type="number"
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.round_count ?? ""}
                onChange={(e) => updateMeta("round_count", e.target.value)}
              />
            </label>
            <label className="block text-[10px] text-slate-400 sm:col-span-2">
              {labels.metaPracticeDay}
              <input
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.practice_day ?? ""}
                onChange={(e) => updateMeta("practice_day", e.target.value)}
              />
            </label>
            <label className="block text-[10px] text-slate-400 sm:col-span-2">
              {labels.metaHandicapDate}
              <input
                className={inputClass}
                disabled={readOnly}
                value={draft.meta.handicap_index_date ?? ""}
                onChange={(e) =>
                  updateMeta("handicap_index_date", e.target.value)
                }
              />
            </label>
          </div>
        ) : null}

        {tab === "reference" ? (
          <div className="grid gap-2">
            {(
              [
                ["system", labels.refSystem],
                ["gentlemen", labels.refGentlemen],
                ["ladies", labels.refLadies],
                ["seniors_ages", labels.refSeniorsAges],
                ["cut_policy", labels.refCutPolicy],
                ["cut_tiebreak_gross", labels.refCutTiebreakGross],
                ["cut_tiebreak_stableford", labels.refCutTiebreakStableford],
                ["cut_tiebreak_seniors", labels.refCutTiebreakSeniors],
                ["trophy_tiebreak", labels.refTrophyTiebreak],
                ["trophies", labels.refTrophies],
                ["out_of_scope", labels.refOutOfScope],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[10px] text-slate-400">
                {label}
                <textarea
                  className={`${inputClass} min-h-[52px] resize-y`}
                  disabled={readOnly}
                  rows={2}
                  value={draft.reference?.[key] ?? ""}
                  onChange={(e) => updateReference(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        ) : null}

        {tab === "categories" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[10px] text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="p-1">{labels.colCode}</th>
                  <th className="p-1">{labels.colName}</th>
                  <th className="p-1">H.I. min</th>
                  <th className="p-1">H.I. max</th>
                  <th className="p-1">{labels.colGender}</th>
                  <th className="p-1">{labels.colGroup}</th>
                  <th className="p-1">{labels.colCut}</th>
                </tr>
              </thead>
              <tbody>
                {draft.categories.map((c, i) => (
                  <tr key={c.code + i} className="border-b border-white/5">
                    <td className="p-1">
                      <input
                        className={inputClass}
                        disabled={readOnly}
                        value={c.code}
                        onChange={(e) =>
                          updateCategory(i, {
                            code: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <input
                        className={inputClass}
                        disabled={readOnly}
                        value={c.name}
                        onChange={(e) =>
                          updateCategory(i, { name: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        step="0.1"
                        className={inputClass}
                        disabled={readOnly}
                        value={c.handicap_min}
                        onChange={(e) =>
                          updateCategory(i, {
                            handicap_min: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        step="0.1"
                        className={inputClass}
                        disabled={readOnly}
                        value={c.handicap_max}
                        onChange={(e) =>
                          updateCategory(i, {
                            handicap_max: Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <select
                        className={inputClass}
                        disabled={readOnly}
                        value={c.gender}
                        onChange={(e) =>
                          updateCategory(i, {
                            gender: e.target.value as DraftCategory["gender"],
                          })
                        }
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="X">X</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        className={inputClass}
                        disabled={readOnly}
                        value={c.category_group}
                        onChange={(e) =>
                          updateCategory(i, {
                            category_group: e.target
                              .value as DraftCategory["category_group"],
                          })
                        }
                      >
                        <option value="main">main</option>
                        <option value="senior">senior</option>
                        <option value="super_senior">super_senior</option>
                        <option value="ladies">ladies</option>
                        <option value="mixed">mixed</option>
                      </select>
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={c.has_cut}
                        onChange={(e) =>
                          updateCategory(i, { has_cut: e.target.checked })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "competition" ? (
          <div className="overflow-x-auto space-y-2">
            {draft.competition_rules.map((r, i) => (
              <div
                key={r.category_code + i}
                className="grid gap-1 border-b border-white/5 pb-2 sm:grid-cols-6"
              >
                <span className="font-semibold text-white">{r.category_code}</span>
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={r.scoring_format}
                  onChange={(e) =>
                    updateCompetition(i, {
                      scoring_format: e.target
                        .value as DraftCompetitionRule["scoring_format"],
                    })
                  }
                >
                  <option value="stroke_play">stroke_play</option>
                  <option value="stableford">stableford</option>
                </select>
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={r.leaderboard_basis}
                  onChange={(e) =>
                    updateCompetition(i, {
                      leaderboard_basis: e.target
                        .value as DraftCompetitionRule["leaderboard_basis"],
                    })
                  }
                >
                  <option value="gross">gross</option>
                  <option value="net">net</option>
                  <option value="both">both</option>
                  <option value="stableford">stableford</option>
                </select>
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={r.handicap_percentage}
                  onChange={(e) =>
                    updateCompetition(i, {
                      handicap_percentage: Number(e.target.value),
                    })
                  }
                  title="HCP %"
                />
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={r.gross_prize_places}
                  onChange={(e) =>
                    updateCompetition(i, {
                      gross_prize_places: Number(e.target.value),
                    })
                  }
                  title="Plazas gross"
                />
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={r.net_prize_places ?? ""}
                  onChange={(e) =>
                    updateCompetition(i, {
                      net_prize_places: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  title="Plazas neto"
                />
              </div>
            ))}
          </div>
        ) : null}

        {tab === "cuts" ? (
          <div className="space-y-3">
            {draft.cut_rules.map((r, i) => (
              <div
                key={i}
                className="grid gap-1 rounded border border-white/5 p-2 sm:grid-cols-4"
              >
                <input
                  className={inputClass}
                  disabled={readOnly}
                  value={r.category_codes.join(",")}
                  onChange={(e) => {
                    const codes = e.target.value
                      .split(/[,;\s]+/)
                      .map((c) => c.trim().toUpperCase())
                      .filter(Boolean);
                    updateCut(i, {
                      category_codes: codes,
                      scope_value:
                        r.scope_type === "category_code_list"
                          ? codes.join(",")
                          : codes[0] ?? "",
                    });
                  }}
                  placeholder="Códigos"
                />
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={r.ranking_basis}
                  onChange={(e) =>
                    updateCut(i, {
                      ranking_basis: e.target
                        .value as DraftCutRule["ranking_basis"],
                    })
                  }
                >
                  <option value="gross_total">gross_total</option>
                  <option value="net_total">net_total</option>
                  <option value="points_total">points_total</option>
                </select>
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={r.advancement_value}
                  onChange={(e) =>
                    updateCut(i, {
                      advancement_value: Number(e.target.value),
                    })
                  }
                  title="% o N"
                />
                <label className="flex items-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={r.gross_exemption_enabled}
                    onChange={(e) =>
                      updateCut(i, {
                        gross_exemption_enabled: e.target.checked,
                      })
                    }
                  />
                  Exención gross
                  <input
                    type="number"
                    className={`${inputClass} w-12`}
                    disabled={readOnly || !r.gross_exemption_enabled}
                    value={r.gross_exemption_top_n}
                    onChange={(e) =>
                      updateCut(i, {
                        gross_exemption_top_n: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "prizes" ? (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {draft.prize_rules.map((p, i) => (
              <div key={i} className="grid gap-1 sm:grid-cols-4">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  value={p.category_code}
                  onChange={(e) =>
                    updatePrize(i, {
                      category_code: e.target.value.toUpperCase(),
                    })
                  }
                />
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={p.prize_position}
                  onChange={(e) =>
                    updatePrize(i, { prize_position: Number(e.target.value) })
                  }
                />
                <input
                  className={`${inputClass} sm:col-span-2`}
                  disabled={readOnly}
                  value={p.prize_label}
                  onChange={(e) =>
                    updatePrize(i, { prize_label: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {!readOnly ? (
          <form action={saveConvocatoriaDraft}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            <button type="submit" style={buttonStyle}>
              {labels.saveDraft}
            </button>
          </form>
        ) : null}

        {status === "editing" ? (
          <form action={closeConvocatoria}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            <p className="sr-only">{labels.confirmClose}</p>
            <button type="submit" style={warnStyle}>
              {labels.closeConvocatoria}
            </button>
          </form>
        ) : null}

        {status === "closed" ? (
          <form action={reopenConvocatoria}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button type="submit" style={buttonStyle}>
              {labels.reopenConvocatoria}
            </button>
          </form>
        ) : null}

        {status === "closed" ? (
          <form action={applyConvocatoriaToTournament}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            {hasEntries ? (
              <p className="mb-1 w-full text-[11px] text-red-300">
                {labels.generateBlocked}
              </p>
            ) : (
              <p className="mb-1 w-full text-[11px] text-slate-400">
                {labels.confirmGenerate}
              </p>
            )}
            <button
              type="submit"
              style={canGenerate ? primaryStyle : buttonStyle}
              disabled={!canGenerate}
              className={!canGenerate ? "cursor-not-allowed opacity-50" : ""}
            >
              {labels.generateParams}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
