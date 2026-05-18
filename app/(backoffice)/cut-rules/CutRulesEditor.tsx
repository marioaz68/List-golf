"use client";

import { useMemo, useState } from "react";
import { validateCutScopeValue } from "@/lib/cuts/validateCutScope";
import { saveCutRulesSnapshot } from "./actions";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import {
  backofficeTableStickyScroll,
  twStickyThGray200,
} from "@/lib/ui/backofficeTableSticky";

function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key] ?? "")
  );
}

type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type TieBreakProfileRow = {
  id: string;
  name: string | null;
  applies_to: "cut" | "trophy" | "general";
};

type AdvancementType = "top_n" | "top_percent" | "all";

type RuleRow = {
  id: string;
  from_round_no: number;
  to_round_no: number;
  scope_type: "category" | "category_group" | "category_code_list" | "overall";
  scope_value: string;
  ranking_basis:
    | "gross_total"
    | "net_total"
    | "points_total"
    | "gross_round"
    | "net_round"
    | "points_round";
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  advancement_type: AdvancementType;
  advancement_value: number;
  include_ties: boolean;
  gross_exemption_enabled: boolean;
  gross_exemption_top_n: number;
  tie_break_profile_id: string | null;
  sort_order: number | null;
  is_active: boolean;
  notes: string | null;
};

function tempId() {
  return "tmp_" + Math.random().toString(36).substring(2, 9);
}

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  boxShadow: "0 3px 0 #1f2937, 0 4px 8px rgba(0,0,0,0.22)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const redButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#ef4444, #b91c1c)",
  border: "1px solid #7f1d1d",
  boxShadow: "0 3px 0 #7f1d1d, 0 4px 8px rgba(0,0,0,0.22)",
};

function splitCodes(value: string) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCodes(codes: string[]) {
  return Array.from(new Set(codes.map((x) => x.trim()).filter(Boolean))).join(",");
}

function categoryLabel(c: CategoryRow) {
  const code = String(c.code ?? "").trim();
  const name = String(c.name ?? "").trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || c.id.slice(0, 8);
}

export default function CutRulesEditor({
  tournamentId,
  rounds,
  categories,
  tieBreakProfiles,
  rules,
}: {
  tournamentId: string;
  rounds: RoundRow[];
  categories: CategoryRow[];
  tieBreakProfiles: TieBreakProfileRow[];
  rules: RuleRow[];
}) {
  const { t } = useAppLocale();
  const ce = t.cutRules.editor;
  const rankingBasisOptions = useMemo(
    () =>
      (
        [
          "gross_total",
          "net_total",
          "points_total",
          "gross_round",
          "net_round",
          "points_round",
        ] as const
      ).map((value) => ({
        value,
        label: ce.rankingBasisLabels[value],
      })),
    [ce.rankingBasisLabels]
  );
  const rankingModeOptions = useMemo(
    () =>
      (["tournament_to_date", "specified_rounds", "last_round_only"] as const).map(
        (value) => ({
          value,
          label: ce.rankingModeLabels[value],
        })
      ),
    [ce.rankingModeLabels]
  );
  const advancementTypeOptions = useMemo(
    () =>
      (["top_n", "top_percent", "all"] as const).map((value) => ({
        value,
        label: ce.advancementLabels[value],
      })),
    [ce.advancementLabels]
  );

  const [rows, setRows] = useState<RuleRow[]>(
    [...rules]
      .map((r) => ({
        ...r,
        scope_type: "category_code_list" as const,
        scope_value: r.scope_type === "overall" ? "" : String(r.scope_value ?? ""),
        advancement_type: r.advancement_type as AdvancementType,
        advancement_value: r.advancement_type === "all" ? 0 : Number(r.advancement_value ?? 0),
        gross_exemption_enabled: !!r.gross_exemption_enabled,
        gross_exemption_top_n: Number(r.gross_exemption_top_n ?? 0),
      }))
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
  );

  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const uniqueRounds = useMemo(() => {
    const map = new Map<number, RoundRow>();
    for (const r of rounds) {
      if (!map.has(r.round_no)) map.set(r.round_no, r);
    }
    return Array.from(map.values()).sort((a, b) => a.round_no - b.round_no);
  }, [rounds]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [categories]
  );

  const canAddRule = uniqueRounds.length >= 1 && sortedCategories.length >= 1;

  function updateRow(
    id: string,
    field: keyof RuleRow,
    value: string | number | boolean | null
  ) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        if (field === "advancement_type") {
          const nextType = value as AdvancementType;

          return {
            ...r,
            advancement_type: nextType,
            advancement_value: nextType === "all" ? 0 : Number(r.advancement_value || 0),
          };
        }

        if (field === "gross_exemption_enabled") {
          const enabled = !!value;

          return {
            ...r,
            gross_exemption_enabled: enabled,
            gross_exemption_top_n: enabled ? Number(r.gross_exemption_top_n || 1) : 0,
          };
        }

        return { ...r, [field]: value };
      })
    );
    setMsg(null);
  }

  function toggleCategoryCode(id: string, code: string, checked: boolean) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const current = splitCodes(r.scope_value);
        const next = checked ? joinCodes([...current, code]) : joinCodes(current.filter((x) => x !== code));
        return { ...r, scope_type: "category_code_list", scope_value: next };
      })
    );
    setMsg(null);
  }

  function addRow() {
    if (!canAddRule) {
      setMsg(ce.addRowNeed);
      return;
    }

    const firstRoundNo = uniqueRounds[0]?.round_no ?? 1;

    setRows((prev) => [
      ...prev,
      {
        id: tempId(),
        from_round_no: firstRoundNo,
        to_round_no: firstRoundNo,
        scope_type: "category_code_list",
        scope_value: "",
        ranking_basis: "gross_total",
        ranking_mode: "specified_rounds",
        advancement_type: "top_n",
        advancement_value: 24,
        include_ties: true,
        gross_exemption_enabled: false,
        gross_exemption_top_n: 0,
        tie_break_profile_id: null,
        sort_order: prev.length + 1,
        is_active: true,
        notes: "",
      },
    ]);
    setMsg(null);
  }

  function moveUp(id: string) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
    setMsg(null);
  }

  function moveDown(id: string) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i < 0 || i === prev.length - 1) return prev;
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
    setMsg(null);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row && !row.id.startsWith("tmp_")) {
        setDeleteIds((d) => [...d, row.id]);
      }
      return prev.filter((r) => r.id !== id);
    });
    setMsg(null);
  }

  const normalizedRows = rows.map((r, i) => ({
    ...r,
    from_round_no: Number(r.from_round_no),
    to_round_no: Number(r.to_round_no),
    scope_type: "category_code_list" as const,
    scope_value: String(r.scope_value ?? "").trim(),
    advancement_type: r.advancement_type,
    advancement_value: r.advancement_type === "all" ? 0 : Number(r.advancement_value),
    include_ties: !!r.include_ties,
    gross_exemption_enabled: !!r.gross_exemption_enabled,
    gross_exemption_top_n: r.gross_exemption_enabled ? Number(r.gross_exemption_top_n || 0) : 0,
    tie_break_profile_id: r.tie_break_profile_id ? String(r.tie_break_profile_id) : null,
    sort_order: i + 1,
    is_active: !!r.is_active,
    notes: String(r.notes ?? "").trim(),
  }));

  function validate() {
    if (uniqueRounds.length < 1) {
      setMsg(ce.valNeedRound);
      return false;
    }

    if (sortedCategories.length < 1) {
      setMsg(ce.valNeedCategories);
      return false;
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (!Number.isFinite(r.from_round_no) || r.from_round_no < 1) {
        setMsg(fmt(ce.valFromRoundInvalid, { row: i + 1 }));
        return false;
      }

      if (!Number.isFinite(r.to_round_no) || r.to_round_no < 1) {
        setMsg(fmt(ce.valToRoundInvalid, { row: i + 1 }));
        return false;
      }

      if (r.to_round_no < r.from_round_no) {
        setMsg(fmt(ce.valToRoundOrder, { row: i + 1 }));
        return false;
      }

      if (!r.scope_value) {
        setMsg(fmt(ce.valPickCategory, { row: i + 1 }));
        return false;
      }

      if (r.advancement_type !== "all" && !Number.isFinite(r.advancement_value)) {
        setMsg(fmt(ce.valCutValueInvalid, { row: i + 1 }));
        return false;
      }

      if (r.advancement_type === "top_n" && r.advancement_value < 1) {
        setMsg(fmt(ce.valTopN, { row: i + 1 }));
        return false;
      }

      if (
        r.advancement_type === "top_percent" &&
        (r.advancement_value <= 0 || r.advancement_value > 100)
      ) {
        setMsg(fmt(ce.valTopPercent, { row: i + 1 }));
        return false;
      }

      if (
        r.gross_exemption_enabled &&
        (!Number.isFinite(r.gross_exemption_top_n) || r.gross_exemption_top_n < 1)
      ) {
        setMsg(fmt(ce.valGrossExempt, { row: i + 1 }));
        return false;
      }

      const scopeErr = validateCutScopeValue(
        r.scope_type as "category" | "category_group" | "category_code_list" | "overall",
        r.scope_value
      );
      if (scopeErr) {
        setMsg(`${scopeErr} (fila ${i + 1})`);
        return false;
      }
    }

    setMsg(null);
    return true;
  }

  const fieldClass =
    "h-7 w-full rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";
  const shortFieldClass =
    "h-7 w-20 rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";
  const checkboxClass = "h-3.5 w-3.5 align-middle";

  return (
    <div className="space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2 shadow-sm">
      {!canAddRule && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          {ce.prerequisiteBanner}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={addRow}
          style={{
            ...buttonStyle,
            opacity: !canAddRule ? 0.55 : 1,
            pointerEvents: !canAddRule ? "none" : "auto",
          }}
          disabled={!canAddRule}
        >
          {ce.newRule}
        </button>

        <div className="text-[11px] leading-snug text-gray-700">{ce.helperLine}</div>
      </div>

      <form
        action={saveCutRulesSnapshot}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(normalizedRows)} />
        <input type="hidden" name="delete_ids_json" value={JSON.stringify(deleteIds)} />

        <div
          className="rounded-lg border border-gray-300 bg-white"
          style={backofficeTableStickyScroll}
        >
          <table className="min-w-[1720px] w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="text-gray-900">
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thOrder}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thCategories}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thFrom}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thTo}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thBasis}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thMode}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thType}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thCut}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thTies}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thGrossProtection}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thTieBreak}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thActive}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thNotes}
                </th>
                <th
                  className={`border border-gray-300 px-1.5 py-[3px] font-semibold ${twStickyThGray200}`}
                >
                  {ce.thActions}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    {ce.noRulesYet}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const selectedCodes = splitCodes(r.scope_value);

                  return (
                    <tr key={r.id} className="bg-white align-middle">
                      <td className="border border-gray-300 px-1.5 py-[3px] text-center text-black">
                        {i + 1}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[360px]">
                        <div className="max-h-20 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-1">
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            {sortedCategories.map((c) => {
                              const code = String(c.code ?? "").trim();
                              if (!code) return null;
                              return (
                                <label key={c.id} className="flex items-center gap-1 text-[11px] text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={selectedCodes.includes(code)}
                                    onChange={(e) => toggleCategoryCode(r.id, code, e.target.checked)}
                                    className={checkboxClass}
                                  />
                                  <span className="truncate">{categoryLabel(c)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {selectedCodes.length > 0 ? (
                          <div className="mt-1 text-[10px] leading-snug text-gray-600">
                            {ce.selectedPrefix} {selectedCodes.join(", ")}
                          </div>
                        ) : (
                          <div className="mt-1 text-[10px] leading-snug text-red-600">
                            {ce.pickOneCategory}
                          </div>
                        )}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <select
                          value={r.from_round_no}
                          onChange={(e) => updateRow(r.id, "from_round_no", Number(e.target.value))}
                          className={shortFieldClass}
                        >
                          {uniqueRounds.map((x) => (
                            <option key={x.round_no} value={x.round_no}>
                              {`${ce.roundOptionPrefix}${x.round_no}`}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <select
                          value={r.to_round_no}
                          onChange={(e) => updateRow(r.id, "to_round_no", Number(e.target.value))}
                          className={shortFieldClass}
                        >
                          {uniqueRounds.map((x) => (
                            <option key={x.round_no} value={x.round_no}>
                              {`${ce.roundOptionPrefix}${x.round_no}`}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[155px]">
                        <select
                          value={r.ranking_basis}
                          onChange={(e) => updateRow(r.id, "ranking_basis", e.target.value)}
                          className={fieldClass}
                        >
                          {rankingBasisOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[155px]">
                        <select
                          value={r.ranking_mode}
                          onChange={(e) => updateRow(r.id, "ranking_mode", e.target.value)}
                          className={fieldClass}
                        >
                          {rankingModeOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[160px]">
                        <select
                          value={r.advancement_type}
                          onChange={(e) => updateRow(r.id, "advancement_type", e.target.value)}
                          className={fieldClass}
                        >
                          {advancementTypeOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        {r.advancement_type === "all" ? (
                          <div className="h-7 w-28 rounded border border-emerald-300 bg-emerald-50 px-2 text-[11px] leading-7 text-emerald-800">
                            {ce.passAll}
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={r.advancement_value}
                            onChange={(e) => updateRow(r.id, "advancement_value", Number(e.target.value))}
                            className={shortFieldClass}
                          />
                        )}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                        <input
                          type="checkbox"
                          checked={!!r.include_ties}
                          onChange={(e) => updateRow(r.id, "include_ties", e.target.checked)}
                          className={checkboxClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[145px]">
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!!r.gross_exemption_enabled}
                            onChange={(e) => updateRow(r.id, "gross_exemption_enabled", e.target.checked)}
                            className={checkboxClass}
                          />

                          <span className="text-[10px] leading-none text-gray-700">{ce.topGross}</span>

                          {r.gross_exemption_enabled ? (
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={r.gross_exemption_top_n || ""}
                              onChange={(e) => updateRow(r.id, "gross_exemption_top_n", Number(e.target.value))}
                              className="h-7 w-14 rounded border border-gray-300 bg-gray-100 px-1 text-[11px] leading-none text-black"
                            />
                          ) : (
                            <span className="text-[10px] leading-none text-gray-400">{ce.noExemption}</span>
                          )}
                        </div>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[190px]">
                        <select
                          value={r.tie_break_profile_id ?? ""}
                          onChange={(e) => updateRow(r.id, "tie_break_profile_id", e.target.value || null)}
                          className={fieldClass}
                        >
                          <option value="">{ce.noTieBreak}</option>
                          {tieBreakProfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name ?? p.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                        <input
                          type="checkbox"
                          checked={!!r.is_active}
                          onChange={(e) => updateRow(r.id, "is_active", e.target.checked)}
                          className={checkboxClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[180px]">
                        <input
                          type="text"
                          value={r.notes ?? ""}
                          onChange={(e) => updateRow(r.id, "notes", e.target.value)}
                          className={fieldClass}
                          placeholder={ce.observationsPlaceholder}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <div className="flex flex-nowrap items-center gap-1">
                          <button type="button" onClick={() => moveUp(r.id)} style={buttonStyle} title={ce.titleMoveUp}>
                            ↑
                          </button>

                          <button type="button" onClick={() => moveDown(r.id)} style={buttonStyle} title={ce.titleMoveDown}>
                            ↓
                          </button>

                          <button type="button" onClick={() => removeRow(r.id)} style={redButtonStyle}>
                            {ce.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="submit" style={buttonStyle}>
            {ce.saveRules}
          </button>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}
        </div>
      </form>
    </div>
  );
}
