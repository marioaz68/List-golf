"use client";

import { useMemo, useState } from "react";
import { saveCutRulesSnapshot } from "./actions";

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
  advancement_type: "top_n" | "top_percent";
  advancement_value: number;
  include_ties: boolean;
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

const SCOPE_OPTIONS = [
  { value: "overall", label: "Todas" },
  { value: "category_code_list", label: "Categorías seleccionadas" },
  { value: "category_group", label: "Grupo manual" },
  { value: "category", label: "Categoría ID" },
] as const;

const RANKING_BASIS_OPTIONS = [
  { value: "gross_total", label: "Gross total" },
  { value: "net_total", label: "Neto total" },
  { value: "points_total", label: "Puntos total" },
  { value: "gross_round", label: "Gross ronda" },
  { value: "net_round", label: "Neto ronda" },
  { value: "points_round", label: "Puntos ronda" },
] as const;

const RANKING_MODE_OPTIONS = [
  { value: "tournament_to_date", label: "Acumulado torneo" },
  { value: "specified_rounds", label: "Rango De/A" },
  { value: "last_round_only", label: "Solo última ronda" },
] as const;

const ADVANCEMENT_TYPE_OPTIONS = [
  { value: "top_n", label: "Top N" },
  { value: "top_percent", label: "Top %" },
] as const;

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
  const [rows, setRows] = useState<RuleRow[]>(
    [...rules].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
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

  const canAddRule = uniqueRounds.length >= 1;

  function updateRow(
    id: string,
    field: keyof RuleRow,
    value: string | number | boolean | null
  ) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setMsg(null);
  }

  function updateScopeType(id: string, value: RuleRow["scope_type"]) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (value === "overall") return { ...r, scope_type: value, scope_value: "ALL" };
        if (value === "category_code_list") return { ...r, scope_type: value, scope_value: "" };
        return { ...r, scope_type: value, scope_value: "" };
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
      setMsg("Primero debes crear al menos 1 ronda para definir reglas.");
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
    scope_value: r.scope_type === "overall" ? "ALL" : String(r.scope_value ?? "").trim(),
    advancement_value: Number(r.advancement_value),
    tie_break_profile_id: r.tie_break_profile_id ? String(r.tie_break_profile_id) : null,
    sort_order: i + 1,
    is_active: !!r.is_active,
    include_ties: !!r.include_ties,
    notes: String(r.notes ?? "").trim(),
  }));

  function validate() {
    if (uniqueRounds.length < 1) {
      setMsg("Primero debes crear al menos 1 ronda.");
      return false;
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (!Number.isFinite(r.from_round_no) || r.from_round_no < 1) {
        setMsg(`Ronda origen inválida en fila ${i + 1}.`);
        return false;
      }

      if (!Number.isFinite(r.to_round_no) || r.to_round_no < 1) {
        setMsg(`Ronda destino inválida en fila ${i + 1}.`);
        return false;
      }

      if (r.to_round_no < r.from_round_no) {
        setMsg(`La ronda destino debe ser mayor o igual que la origen en fila ${i + 1}.`);
        return false;
      }

      if (r.scope_type !== "overall" && !r.scope_value) {
        setMsg(`Selecciona alcance/categorías en fila ${i + 1}.`);
        return false;
      }

      if (!Number.isFinite(r.advancement_value)) {
        setMsg(`Valor de corte inválido en fila ${i + 1}.`);
        return false;
      }

      if (r.advancement_type === "top_n" && r.advancement_value < 1) {
        setMsg(`Top N debe ser mayor o igual a 1 en fila ${i + 1}.`);
        return false;
      }

      if (
        r.advancement_type === "top_percent" &&
        (r.advancement_value <= 0 || r.advancement_value > 100)
      ) {
        setMsg(`Top % debe estar entre 0 y 100 en fila ${i + 1}.`);
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
          Debes tener al menos 1 ronda creada en este torneo para configurar reglas.
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
          Nueva regla
        </button>

        <div className="text-[11px] leading-snug text-gray-700">
          Primero selecciona categorías; después define de qué ronda a qué ronda aplica.
        </div>
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

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="min-w-[1720px] w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Orden</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Alcance</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Categorías / Valor</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">De</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">A</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Base</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Modo</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Tipo</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Corte</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Empates</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Desempate</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Activo</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Notas</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    No hay reglas todavía.
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

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[155px]">
                        <select
                          value={r.scope_type}
                          onChange={(e) => updateScopeType(r.id, e.target.value as RuleRow["scope_type"])}
                          className={fieldClass}
                        >
                          {SCOPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[340px]">
                        {r.scope_type === "overall" ? (
                          <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
                            Aplica a todas las categorías
                          </div>
                        ) : r.scope_type === "category_code_list" ? (
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
                        ) : (
                          <input
                            type="text"
                            value={r.scope_value}
                            onChange={(e) => updateRow(r.id, "scope_value", e.target.value)}
                            className={fieldClass}
                            placeholder={r.scope_type === "category_group" ? "main / senior / damas" : "category_id"}
                          />
                        )}
                        {r.scope_type === "category_code_list" && selectedCodes.length > 0 ? (
                          <div className="mt-1 text-[10px] leading-snug text-gray-600">
                            Seleccionadas: {selectedCodes.join(", ")}
                          </div>
                        ) : null}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <select
                          value={r.from_round_no}
                          onChange={(e) => updateRow(r.id, "from_round_no", Number(e.target.value))}
                          className={shortFieldClass}
                        >
                          {uniqueRounds.map((x) => (
                            <option key={x.round_no} value={x.round_no}>
                              R{x.round_no}
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
                              R{x.round_no}
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
                          {RANKING_BASIS_OPTIONS.map((o) => (
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
                          {RANKING_MODE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[105px]">
                        <select
                          value={r.advancement_type}
                          onChange={(e) => updateRow(r.id, "advancement_type", e.target.value)}
                          className={fieldClass}
                        >
                          {ADVANCEMENT_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <input
                          type="number"
                          step="0.01"
                          value={r.advancement_value}
                          onChange={(e) => updateRow(r.id, "advancement_value", Number(e.target.value))}
                          className={shortFieldClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                        <input
                          type="checkbox"
                          checked={!!r.include_ties}
                          onChange={(e) => updateRow(r.id, "include_ties", e.target.checked)}
                          className={checkboxClass}
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] min-w-[190px]">
                        <select
                          value={r.tie_break_profile_id ?? ""}
                          onChange={(e) => updateRow(r.id, "tie_break_profile_id", e.target.value || null)}
                          className={fieldClass}
                        >
                          <option value="">Sin desempate</option>
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
                          placeholder="Observaciones"
                        />
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        <div className="flex flex-nowrap items-center gap-1">
                          <button type="button" onClick={() => moveUp(r.id)} style={buttonStyle} title="Subir">
                            ↑
                          </button>

                          <button type="button" onClick={() => moveDown(r.id)} style={buttonStyle} title="Bajar">
                            ↓
                          </button>

                          <button type="button" onClick={() => removeRow(r.id)} style={redButtonStyle}>
                            Borrar
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
            Guardar reglas
          </button>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}
        </div>
      </form>
    </div>
  );
}
