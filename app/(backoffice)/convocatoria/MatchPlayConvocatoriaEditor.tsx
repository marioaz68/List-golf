"use client";

import { useCallback, useMemo, useState } from "react";
import type { ConvocatoriaWorkflowStatus } from "@/lib/convocatoria/draftUtils";
import type {
  ConvocatoriaDraft,
  DraftCategory,
  DraftPrizeRule,
} from "@/lib/convocatoria/types";
import {
  MATCHPLAY_BRACKET_LABELS,
  MATCHPLAY_MATCH_TYPE_LABELS,
  MATCHPLAY_PAIR_COMPOSITION_LABELS,
  MATCHPLAY_PAIR_FORMAT_LABELS,
  MATCHPLAY_SEEDING_LABELS,
  type MatchPlayBracketType,
  type MatchPlayCategoryBasis,
  type MatchPlayConsolationRule,
  type MatchPlayConvocatoriaConfig,
  type MatchPlayHandicapAllowance,
  type MatchPlayMatchType,
  type MatchPlayPairComposition,
  type MatchPlayPairFormat,
  type MatchPlayPrizeShare,
  type MatchPlaySeedingMethod,
  type MatchPlayTiebreaker,
} from "@/lib/matchplay/types";
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

type Tab = "meta" | "rules" | "auction" | "consolations" | "prizes_shares" | "categories" | "prizes";

export type MatchPlayEditorLabels = {
  statusEditing: string;
  statusClosed: string;
  statusApplied: string;
  tabMeta: string;
  tabRules: string;
  tabCategories: string;
  tabPrizes: string;
  saveDraft: string;
  closeConvocatoria: string;
  reopenConvocatoria: string;
  generateParams: string;
  generateBlocked: string;
  confirmClose: string;
  confirmGenerate: string;
  metaTitle: string;
  metaRounds: string;
  metaHandicapDate: string;
  colCode: string;
  colName: string;
  colHcp: string;
  colGroup: string;
  colGender: string;
  addCategory: string;
  warnings: string;
  readOnlyHint: string;
  matchPlayBadge: string;
};

type Props = {
  tournamentId: string;
  initialDraft: ConvocatoriaDraft;
  workflowStatus: ConvocatoriaWorkflowStatus;
  templateName: string | null;
  hasEntries: boolean;
  labels: MatchPlayEditorLabels;
};

function syncMetaFromMatchplay(draft: ConvocatoriaDraft): ConvocatoriaDraft {
  const mp = draft.matchplay!;
  return {
    ...draft,
    meta: {
      ...draft.meta,
      total_holes: mp.holes_per_match,
      round_count: mp.bracket_round_count,
      cut_after_holes: null,
      cut_percent: null,
    },
  };
}

export default function MatchPlayConvocatoriaEditor({
  tournamentId,
  initialDraft,
  workflowStatus: initialStatus,
  templateName,
  hasEntries,
  labels,
}: Props) {
  const [draft, setDraft] = useState(() => syncMetaFromMatchplay(initialDraft));
  const [tab, setTab] = useState<Tab>("rules");
  const [workflowStatus, setWorkflowStatus] = useState(initialStatus);

  const readOnly =
    workflowStatus === "closed" || workflowStatus === "applied" || hasEntries;

  const mp = draft.matchplay!;

  const setMatchplay = useCallback(
    (patch: Partial<MatchPlayConvocatoriaConfig>) => {
      setDraft((prev) => {
        const nextMp = { ...prev.matchplay!, ...patch };
        return syncMetaFromMatchplay({ ...prev, matchplay: nextMp });
      });
    },
    []
  );

  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);

  const statusLabel =
    workflowStatus === "applied"
      ? labels.statusApplied
      : workflowStatus === "closed"
        ? labels.statusClosed
        : labels.statusEditing;

  return (
    <div className="space-y-3 rounded-lg border border-cyan-500/30 bg-[#0f172a] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-cyan-900/60 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
          {labels.matchPlayBadge}
        </span>
        <span className="text-[12px] text-slate-300">{statusLabel}</span>
        {templateName ? (
          <span className="text-[11px] text-slate-500">· {templateName}</span>
        ) : null}
      </div>

      {readOnly ? (
        <p className="text-[11px] text-amber-200/90">{labels.readOnlyHint}</p>
      ) : null}

      {(draft.warnings ?? []).length > 0 ? (
        <div className="rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-100">
          <strong>{labels.warnings}:</strong>
          <ul className="mt-1 list-inside list-disc">
            {draft.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["rules", labels.tabRules],
            ["auction", "Subasta/Bolsa"],
            ["consolations", "Consolaciones"],
            ["prizes_shares", "Reparto bolsa"],
            ["meta", labels.tabMeta],
            ["categories", labels.tabCategories],
            ["prizes", labels.tabPrizes],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              ...buttonStyle,
              ...(tab === key
                ? { background: "linear-gradient(#0891b2, #0e7490)" }
                : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rules" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-slate-300 sm:col-span-2">
            Tipo de match play
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.match_type ?? "pairs"}
              onChange={(e) => {
                const next = e.target.value as MatchPlayMatchType;
                setMatchplay(
                  next === "individual"
                    ? {
                        match_type: next,
                        pair_composition: undefined,
                        combined_hi_min: null,
                        combined_hi_max: null,
                        male_individual_hi_max: null,
                        female_individual_hi_max: null,
                        handicap_allowance: "full_relative",
                      }
                    : { match_type: next }
                );
              }}
            >
              {Object.entries(MATCHPLAY_MATCH_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {mp.match_type !== "individual" ? (
            <label className="text-[11px] text-slate-300">
              Formato de pareja
              <select
                className={inputClass}
                disabled={readOnly}
                value={mp.pair_format}
                onChange={(e) => {
                  const next = e.target.value as MatchPlayPairFormat;
                  if (next === "low_high") {
                    setMatchplay({
                      pair_format: next,
                      handicap_allowance: "custom",
                      handicap_allowance_custom_pct:
                        mp.handicap_allowance_custom_pct ?? 80,
                    });
                  } else {
                    setMatchplay({ pair_format: next });
                  }
                }}
              >
                {Object.entries(MATCHPLAY_PAIR_FORMAT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-[11px] text-slate-300">
            Tipo de cuadro
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.bracket_type}
              onChange={(e) =>
                setMatchplay({
                  bracket_type: e.target.value as MatchPlayBracketType,
                })
              }
            >
              {Object.entries(MATCHPLAY_BRACKET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Categorías por
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.category_basis}
              onChange={(e) =>
                setMatchplay({
                  category_basis: e.target.value as MatchPlayCategoryBasis,
                })
              }
            >
              <option value="combined_hi">HI combinado pareja</option>
              <option value="individual_hi">HI individual (ambos en rango)</option>
              <option value="flights">Flights</option>
              <option value="open">Abierta</option>
              <option value="by_age">Edad / sexo</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Allowance hándicap
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.handicap_allowance}
              onChange={(e) =>
                setMatchplay({
                  handicap_allowance: e.target
                    .value as MatchPlayHandicapAllowance,
                })
              }
            >
              <option value="scratch">Scratch (sin hándicap)</option>
              <option value="fourball_85">Four-Ball 85%</option>
              <option value="foursomes_50_combined">Foursomes 50% combinado</option>
              <option value="full_relative">100% relativo al match</option>
              <option value="custom">Personalizado %</option>
            </select>
          </label>
          {mp.handicap_allowance === "custom" ? (
            <label className="text-[11px] text-slate-300">
              % personalizado
              <input
                type="number"
                className={inputClass}
                disabled={readOnly}
                min={0}
                max={100}
                value={mp.handicap_allowance_custom_pct ?? 85}
                onChange={(e) =>
                  setMatchplay({
                    handicap_allowance_custom_pct: Number(e.target.value),
                  })
                }
              />
            </label>
          ) : null}
          <label className="text-[11px] text-slate-300">
            Desempate de match (empate al 18)
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.match_tiebreaker}
              onChange={(e) =>
                setMatchplay({
                  match_tiebreaker: e.target.value as MatchPlayTiebreaker,
                })
              }
            >
              <option value="sudden_death">Muerte súbita (desde hoyo 1)</option>
              <option value="sudden_death_18">Muerte súbita hoyo 18</option>
              <option value="extra_3_holes">3 hoyos extra</option>
              <option value="lowest_hi">HI combinado más bajo</option>
              <option value="play_until_decided">Jugar hasta definir</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Hoyos por match
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.holes_per_match}
              onChange={(e) =>
                setMatchplay({
                  holes_per_match: Number(e.target.value) as 9 | 18,
                })
              }
            >
              <option value={18}>18 hoyos</option>
              <option value={9}>9 hoyos</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Rondas del cuadro
            <input
              type="number"
              className={inputClass}
              disabled={readOnly}
              min={1}
              max={8}
              value={mp.bracket_round_count}
              onChange={(e) =>
                setMatchplay({ bracket_round_count: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-[11px] text-slate-300">
            Tamaño máximo del cuadro
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.max_pairs_per_category ?? "variable"}
              onChange={(e) => {
                const v = e.target.value;
                setMatchplay({
                  max_pairs_per_category:
                    v === "variable" ? null : Number(v),
                  bracket_round_count:
                    v === "variable"
                      ? mp.bracket_round_count
                      : Math.ceil(Math.log2(Number(v))),
                });
              }}
            >
              <option value="variable">
                Variable (BYEs según inscritos)
              </option>
              <option value={4}>4 {mp.match_type === "individual" ? "jugadores" : "parejas"}</option>
              <option value={8}>8 {mp.match_type === "individual" ? "jugadores" : "parejas"}</option>
              <option value={16}>16 {mp.match_type === "individual" ? "jugadores" : "parejas"}</option>
              <option value={32}>32 {mp.match_type === "individual" ? "jugadores" : "parejas"}</option>
              <option value={64}>64 {mp.match_type === "individual" ? "jugadores" : "parejas"}</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Seeding
            <select
              className={inputClass}
              disabled={readOnly}
              value={mp.seeding_method}
              onChange={(e) =>
                setMatchplay({
                  seeding_method: e.target.value as MatchPlaySeedingMethod,
                })
              }
            >
              {Object.entries(MATCHPLAY_SEEDING_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {mp.match_type !== "individual" ? (
            <>
              <label className="text-[11px] text-slate-300">
                Composición de pareja
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={mp.pair_composition ?? "open"}
                  onChange={(e) =>
                    setMatchplay({
                      pair_composition: e.target
                        .value as MatchPlayPairComposition,
                    })
                  }
                >
                  {Object.entries(MATCHPLAY_PAIR_COMPOSITION_LABELS).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label className="text-[11px] text-slate-300">
                Suma HI mínima de pareja
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  disabled={readOnly}
                  value={mp.combined_hi_min ?? 0}
                  onChange={(e) =>
                    setMatchplay({ combined_hi_min: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-[11px] text-slate-300">
                Suma HI máxima de pareja
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  disabled={readOnly}
                  value={mp.combined_hi_max ?? 0}
                  onChange={(e) =>
                    setMatchplay({ combined_hi_max: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-[11px] text-slate-300">
                Tope individual caballeros (M)
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  disabled={readOnly}
                  placeholder="sin tope"
                  value={mp.male_individual_hi_max ?? ""}
                  onChange={(e) =>
                    setMatchplay({
                      male_individual_hi_max:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-[11px] text-slate-300">
                Tope individual damas (F)
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  disabled={readOnly}
                  placeholder="sin tope"
                  value={mp.female_individual_hi_max ?? ""}
                  onChange={(e) =>
                    setMatchplay({
                      female_individual_hi_max:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
            </>
          ) : null}
          <label className="text-[11px] text-slate-300">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={mp.play_in_enabled ?? false}
              onChange={(e) =>
                setMatchplay({ play_in_enabled: e.target.checked })
              }
            />{" "}
            Ronda clasificatoria (play-in) si excede al cuadro principal
          </label>
          <label className="text-[11px] text-slate-300">
            {mp.match_type === "individual"
              ? "Jugadores del cuadro principal"
              : "Parejas del cuadro principal"}
            <input
              type="number"
              className={inputClass}
              disabled={readOnly}
              value={mp.bracket_main_pairs ?? 16}
              onChange={(e) =>
                setMatchplay({ bracket_main_pairs: Number(e.target.value) })
              }
            />
          </label>
          <label className="col-span-full text-[11px] text-slate-300">
            Notas / texto convocatoria
            <textarea
              className={inputClass}
              rows={3}
              disabled={readOnly}
              value={mp.reference_notes ?? ""}
              onChange={(e) =>
                setMatchplay({ reference_notes: e.target.value || null })
              }
            />
          </label>
          <label className="col-span-full text-[11px] text-slate-300">
            Reglas detalladas (incluye desempates por retrocesión, etc.)
            <textarea
              className={inputClass}
              rows={4}
              disabled={readOnly}
              value={mp.rules_text ?? ""}
              onChange={(e) =>
                setMatchplay({ rules_text: e.target.value || null })
              }
            />
          </label>
        </div>
      ) : null}

      {tab === "auction" ? (
        <AuctionPanel
          mp={mp}
          readOnly={readOnly}
          onChange={setMatchplay}
        />
      ) : null}

      {tab === "consolations" ? (
        <ConsolationsPanel
          mp={mp}
          readOnly={readOnly}
          onChange={(consolations) => setMatchplay({ consolations })}
        />
      ) : null}

      {tab === "prizes_shares" ? (
        <PrizeSharesPanel
          mp={mp}
          readOnly={readOnly}
          onChange={(prize_shares) => setMatchplay({ prize_shares })}
        />
      ) : null}

      {tab === "meta" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-slate-300">
            {labels.metaTitle}
            <input
              className={inputClass}
              disabled={readOnly}
              value={draft.meta.title ?? ""}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  meta: { ...p.meta, title: e.target.value || null },
                }))
              }
            />
          </label>
          <label className="text-[11px] text-slate-300">
            {labels.metaRounds}
            <input
              className={inputClass}
              readOnly
              value={draft.meta.round_count ?? mp.bracket_round_count}
            />
          </label>
          <label className="text-[11px] text-slate-300">
            {labels.metaHandicapDate}
            <input
              className={inputClass}
              disabled={readOnly}
              value={draft.meta.handicap_index_date ?? ""}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  meta: {
                    ...p.meta,
                    handicap_index_date: e.target.value || null,
                  },
                }))
              }
            />
          </label>
        </div>
      ) : null}

      {tab === "categories" ? (
        <CategoryTable
          categories={draft.categories}
          readOnly={readOnly}
          labels={labels}
          onChange={(categories) => setDraft((p) => ({ ...p, categories }))}
        />
      ) : null}

      {tab === "prizes" ? (
        <PrizeTable
          prizes={draft.prize_rules}
          categories={draft.categories}
          readOnly={readOnly}
          onChange={(prize_rules) => setDraft((p) => ({ ...p, prize_rules }))}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {!readOnly ? (
          <form action={saveConvocatoriaDraft}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            <button type="submit" style={buttonStyle}>
              {labels.saveDraft}
            </button>
          </form>
        ) : null}

        {workflowStatus === "editing" && !hasEntries ? (
          <form
            action={closeConvocatoria}
            onSubmit={(e) => {
              if (!confirm(labels.confirmClose)) e.preventDefault();
            }}
          >
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            <button type="submit" style={warnStyle}>
              {labels.closeConvocatoria}
            </button>
          </form>
        ) : null}

        {workflowStatus === "closed" && !hasEntries ? (
          <form
            action={applyConvocatoriaToTournament}
            onSubmit={(e) => {
              if (!confirm(labels.confirmGenerate)) e.preventDefault();
            }}
          >
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="draft_json" value={draftJson} />
            <button type="submit" style={primaryStyle}>
              {labels.generateParams}
            </button>
          </form>
        ) : null}

        {workflowStatus === "closed" && !hasEntries ? (
          <form action={reopenConvocatoria}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button type="submit" style={buttonStyle}>
              {labels.reopenConvocatoria}
            </button>
          </form>
        ) : null}

        {hasEntries ? (
          <span className="text-[11px] text-amber-200">{labels.generateBlocked}</span>
        ) : null}
      </div>
    </div>
  );
}

function CategoryTable({
  categories,
  readOnly,
  labels,
  onChange,
}: {
  categories: DraftCategory[];
  readOnly: boolean;
  labels: MatchPlayEditorLabels;
  onChange: (c: DraftCategory[]) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px] text-slate-200">
        <thead>
          <tr className="border-b border-white/10 text-slate-400">
            <th className="p-1">{labels.colCode}</th>
            <th className="p-1">{labels.colName}</th>
            <th className="p-1">HI min</th>
            <th className="p-1">HI max</th>
            <th className="p-1">{labels.colGender}</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c.code} className="border-b border-white/5">
              <td className="p-1">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  value={c.code}
                  onChange={(e) => {
                    const next = [...categories];
                    next[i] = { ...c, code: e.target.value.toUpperCase() };
                    onChange(next);
                  }}
                />
              </td>
              <td className="p-1">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  value={c.name}
                  onChange={(e) => {
                    const next = [...categories];
                    next[i] = { ...c, name: e.target.value };
                    onChange(next);
                  }}
                />
              </td>
              <td className="p-1">
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={c.handicap_min}
                  onChange={(e) => {
                    const next = [...categories];
                    next[i] = { ...c, handicap_min: Number(e.target.value) };
                    onChange(next);
                  }}
                />
              </td>
              <td className="p-1">
                <input
                  type="number"
                  className={inputClass}
                  disabled={readOnly}
                  value={c.handicap_max}
                  onChange={(e) => {
                    const next = [...categories];
                    next[i] = { ...c, handicap_max: Number(e.target.value) };
                    onChange(next);
                  }}
                />
              </td>
              <td className="p-1">
                <select
                  className={inputClass}
                  disabled={readOnly}
                  value={c.gender}
                  onChange={(e) => {
                    const next = [...categories];
                    next[i] = {
                      ...c,
                      gender: e.target.value as DraftCategory["gender"],
                    };
                    onChange(next);
                  }}
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                  <option value="X">X</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly ? (
        <button
          type="button"
          style={{ ...buttonStyle, marginTop: 8 }}
          onClick={() =>
            onChange([
              ...categories,
              {
                code: `FLT${categories.length + 1}`,
                name: `Flight ${categories.length + 1}`,
                gender: "X",
                category_group: "main",
                handicap_min: 0,
                handicap_max: 54,
                min_age: null,
                max_age: null,
                tee_hint: null,
                format_notes: null,
                has_cut: false,
              },
            ])
          }
        >
          {labels.addCategory}
        </button>
      ) : null}
    </div>
  );
}

function AuctionPanel({
  mp,
  readOnly,
  onChange,
}: {
  mp: MatchPlayConvocatoriaConfig;
  readOnly: boolean;
  onChange: (patch: Partial<MatchPlayConvocatoriaConfig>) => void;
}) {
  const a = mp.auction ?? {
    enabled: false,
    pot_percent_of_total: 100,
    min_bid: null,
    max_bid: null,
    player_cover_percent: null,
    currency: "MXN" as const,
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="col-span-full text-[11px] text-slate-300">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={a.enabled}
          onChange={(e) =>
            onChange({ auction: { ...a, enabled: e.target.checked } })
          }
        />{" "}
        Subasta / Calcuta habilitada (define siembra del cuadro)
      </label>
      <label className="text-[11px] text-slate-300">
        % de bolsa sobre lo subastado
        <input
          type="number"
          className={inputClass}
          disabled={readOnly || !a.enabled}
          value={a.pot_percent_of_total}
          onChange={(e) =>
            onChange({
              auction: { ...a, pot_percent_of_total: Number(e.target.value) },
            })
          }
        />
      </label>
      <label className="text-[11px] text-slate-300">
        % que cubre el jugador subastado
        <input
          type="number"
          className={inputClass}
          disabled={readOnly || !a.enabled}
          value={a.player_cover_percent ?? 0}
          onChange={(e) =>
            onChange({
              auction: { ...a, player_cover_percent: Number(e.target.value) },
            })
          }
        />
      </label>
      <label className="text-[11px] text-slate-300">
        Postura mínima
        <input
          type="number"
          className={inputClass}
          disabled={readOnly || !a.enabled}
          value={a.min_bid ?? 0}
          onChange={(e) =>
            onChange({ auction: { ...a, min_bid: Number(e.target.value) } })
          }
        />
      </label>
      <label className="text-[11px] text-slate-300">
        Postura máxima
        <input
          type="number"
          className={inputClass}
          disabled={readOnly || !a.enabled}
          value={a.max_bid ?? 0}
          onChange={(e) =>
            onChange({ auction: { ...a, max_bid: Number(e.target.value) } })
          }
        />
      </label>
      <label className="text-[11px] text-slate-300">
        Moneda
        <select
          className={inputClass}
          disabled={readOnly || !a.enabled}
          value={a.currency}
          onChange={(e) =>
            onChange({
              auction: { ...a, currency: e.target.value as "MXN" | "USD" },
            })
          }
        >
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>
      </label>
    </div>
  );
}

function ConsolationsPanel({
  mp,
  readOnly,
  onChange,
}: {
  mp: MatchPlayConvocatoriaConfig;
  readOnly: boolean;
  onChange: (next: MatchPlayConsolationRule[]) => void;
}) {
  const list = mp.consolations ?? [];
  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <div
          key={i}
          className="grid gap-2 rounded border border-white/10 bg-[#0a1220] p-2 sm:grid-cols-5"
        >
          <label className="text-[11px] text-slate-300">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={c.enabled}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...c, enabled: e.target.checked };
                onChange(next);
              }}
            />{" "}
            Activa
          </label>
          <label className="text-[11px] text-slate-300">
            Desde ronda
            <input
              type="number"
              className={inputClass}
              disabled={readOnly}
              value={c.from_round_no}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...c, from_round_no: Number(e.target.value) };
                onChange(next);
              }}
            />
          </label>
          <label className="text-[11px] text-slate-300">
            Formato
            <select
              className={inputClass}
              disabled={readOnly}
              value={c.consolation_format}
              onChange={(e) => {
                const next = [...list];
                next[i] = {
                  ...c,
                  consolation_format: e.target
                    .value as MatchPlayConsolationRule["consolation_format"],
                };
                onChange(next);
              }}
            >
              <option value="match_play">Match play</option>
              <option value="stroke_play_aggregate">Stroke play agregado</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Etiqueta premio
            <input
              className={inputClass}
              disabled={readOnly}
              value={c.prize_label ?? ""}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...c, prize_label: e.target.value || null };
                onChange(next);
              }}
            />
          </label>
          <label className="text-[11px] text-slate-300">
            % bolsa
            <input
              type="number"
              step="0.1"
              className={inputClass}
              disabled={readOnly}
              value={c.prize_percent ?? 0}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...c, prize_percent: Number(e.target.value) };
                onChange(next);
              }}
            />
          </label>
        </div>
      ))}
      {!readOnly ? (
        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            onChange([
              ...list,
              {
                enabled: true,
                from_round_no: 1,
                consolation_format: "match_play",
                prize_label: "Consolación",
                prize_percent: 0,
              },
            ])
          }
        >
          + Consolación
        </button>
      ) : null}
    </div>
  );
}

function PrizeSharesPanel({
  mp,
  readOnly,
  onChange,
}: {
  mp: MatchPlayConvocatoriaConfig;
  readOnly: boolean;
  onChange: (next: MatchPlayPrizeShare[]) => void;
}) {
  const list = mp.prize_shares ?? [];
  const total = list.reduce((acc, p) => acc + (p.percent || 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        Reparto de la bolsa por posición. Suma actual:{" "}
        <strong className={total === 100 ? "text-green-300" : "text-amber-300"}>
          {total.toFixed(1)}%
        </strong>
      </p>
      {list.map((p, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-5">
          <label className="text-[11px] text-slate-300">
            Origen
            <select
              className={inputClass}
              disabled={readOnly}
              value={p.source}
              onChange={(e) => {
                const next = [...list];
                next[i] = {
                  ...p,
                  source: e.target.value as MatchPlayPrizeShare["source"],
                };
                onChange(next);
              }}
            >
              <option value="match_play">Match play (cuadro principal)</option>
              <option value="consolation_match_play">Consolación MP</option>
              <option value="stroke_play_aggregate">Stroke play agregado</option>
            </select>
          </label>
          <label className="text-[11px] text-slate-300">
            Posición
            <input
              type="number"
              className={inputClass}
              disabled={readOnly}
              value={p.position}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...p, position: Number(e.target.value) };
                onChange(next);
              }}
            />
          </label>
          <label className="text-[11px] text-slate-300 sm:col-span-2">
            Etiqueta
            <input
              className={inputClass}
              disabled={readOnly}
              value={p.label}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...p, label: e.target.value };
                onChange(next);
              }}
            />
          </label>
          <label className="text-[11px] text-slate-300">
            % bolsa
            <input
              type="number"
              step="0.1"
              className={inputClass}
              disabled={readOnly}
              value={p.percent}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...p, percent: Number(e.target.value) };
                onChange(next);
              }}
            />
          </label>
        </div>
      ))}
      {!readOnly ? (
        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            onChange([
              ...list,
              {
                position: list.length + 1,
                label: "Premio",
                percent: 0,
                source: "match_play",
              },
            ])
          }
        >
          + Premio
        </button>
      ) : null}
    </div>
  );
}

function PrizeTable({
  prizes,
  categories,
  readOnly,
  onChange,
}: {
  prizes: DraftPrizeRule[];
  categories: DraftCategory[];
  readOnly: boolean;
  onChange: (p: DraftPrizeRule[]) => void;
}) {
  return (
    <div className="space-y-2">
      {prizes.map((p, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <select
            className={inputClass}
            style={{ maxWidth: 120 }}
            disabled={readOnly}
            value={p.category_code}
            onChange={(e) => {
              const next = [...prizes];
              next[i] = {
                ...p,
                category_code: e.target.value,
                scope_value: e.target.value,
              };
              onChange(next);
            }}
          >
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            style={{ flex: 1 }}
            disabled={readOnly}
            value={p.prize_label}
            onChange={(e) => {
              const next = [...prizes];
              next[i] = { ...p, prize_label: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}
