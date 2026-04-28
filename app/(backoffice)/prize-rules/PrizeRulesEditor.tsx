"use client";

import { useMemo, useState } from "react";
import { savePrizeRulesSnapshot } from "./actions";

type PrizeRuleRow = {
  id: string;
  scope_type: "overall" | "category_group" | "category_code_list" | "category";
  scope_value: string;
  prize_label: string;
  prize_position: number;
  ranking_basis: "gross" | "net" | "stableford";
  priority: number;
  unique_winner: boolean;
  show_on_leaderboard: boolean;
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  round_nos: number[] | null;
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
  { value: "category_group", label: "Grupo" },
  { value: "category_code_list", label: "Lista códigos" },
  { value: "category", label: "Categoría ID" },
] as const;

const BASIS_OPTIONS = [
  { value: "gross", label: "Gross" },
  { value: "net", label: "Neto" },
  { value: "stableford", label: "Stableford" },
] as const;

const MODE_OPTIONS = [
  { value: "tournament_to_date", label: "Acumulado" },
  { value: "specified_rounds", label: "Rondas específicas" },
  { value: "last_round_only", label: "Última ronda" },
] as const;

function defaultPrizeLabel(position: number, basis: PrizeRuleRow["ranking_basis"]) {
  const basisLabel = basis === "gross" ? "Gross" : basis === "net" ? "Neto" : "Stableford";
  return `${position} ${basisLabel}`;
}

function parseRoundNos(value: string) {
  const nums = value
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x >= 1)
    .map((x) => Math.trunc(x));
  return nums.length ? Array.from(new Set(nums)).sort((a, b) => a - b) : null;
}

export default function PrizeRulesEditor({
  tournamentId,
  rules,
}: {
  tournamentId: string;
  rules: PrizeRuleRow[];
}) {
  const [rows, setRows] = useState<PrizeRuleRow[]>(
    [...rules].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
  );
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  function updateRow(
    id: string,
    field: keyof PrizeRuleRow,
    value: string | number | boolean | number[] | null
  ) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value } as PrizeRuleRow;
        if ((field === "prize_position" || field === "ranking_basis") && !r.prize_label.trim()) {
          next.prize_label = defaultPrizeLabel(
            field === "prize_position" ? Number(value) : r.prize_position,
            field === "ranking_basis" ? (value as PrizeRuleRow["ranking_basis"]) : r.ranking_basis
          );
        }
        return next;
      })
    );
    setMsg(null);
  }

  function addRow(preset?: "gross_net_net") {
    if (preset === "gross_net_net") {
      setRows((prev) => [
        ...prev,
        {
          id: tempId(),
          scope_type: "category_code_list",
          scope_value: "DA,S,SS",
          prize_label: "1 Gross",
          prize_position: 1,
          ranking_basis: "gross",
          priority: prev.length + 1,
          unique_winner: true,
          show_on_leaderboard: true,
          ranking_mode: "tournament_to_date",
          round_nos: null,
          sort_order: prev.length + 1,
          is_active: true,
          notes: "Ejemplo Damas/Seniors",
        },
        {
          id: tempId(),
          scope_type: "category_code_list",
          scope_value: "DA,S,SS",
          prize_label: "1 Neto",
          prize_position: 1,
          ranking_basis: "net",
          priority: prev.length + 2,
          unique_winner: true,
          show_on_leaderboard: true,
          ranking_mode: "tournament_to_date",
          round_nos: null,
          sort_order: prev.length + 2,
          is_active: true,
          notes: "Ejemplo Damas/Seniors",
        },
        {
          id: tempId(),
          scope_type: "category_code_list",
          scope_value: "DA,S,SS",
          prize_label: "2 Neto",
          prize_position: 2,
          ranking_basis: "net",
          priority: prev.length + 3,
          unique_winner: true,
          show_on_leaderboard: true,
          ranking_mode: "tournament_to_date",
          round_nos: null,
          sort_order: prev.length + 3,
          is_active: true,
          notes: "Ejemplo Damas/Seniors",
        },
      ]);
      setMsg(null);
      return;
    }

    setRows((prev) => [
      ...prev,
      {
        id: tempId(),
        scope_type: "overall",
        scope_value: "ALL",
        prize_label: "1 Gross",
        prize_position: 1,
        ranking_basis: "gross",
        priority: prev.length + 1,
        unique_winner: true,
        show_on_leaderboard: true,
        ranking_mode: "tournament_to_date",
        round_nos: null,
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

  const normalizedRows = useMemo(
    () =>
      rows.map((r, i) => ({
        ...r,
        scope_value: r.scope_type === "overall" ? "ALL" : String(r.scope_value ?? "").trim(),
        prize_label:
          String(r.prize_label ?? "").trim() || defaultPrizeLabel(Number(r.prize_position), r.ranking_basis),
        prize_position: Number(r.prize_position),
        priority: Number(r.priority),
        round_nos: r.ranking_mode === "specified_rounds" ? r.round_nos : null,
        sort_order: i + 1,
        unique_winner: !!r.unique_winner,
        show_on_leaderboard: !!r.show_on_leaderboard,
        is_active: !!r.is_active,
        notes: String(r.notes ?? "").trim(),
      })),
    [rows]
  );

  function validate() {
    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (r.scope_type !== "overall" && !r.scope_value) {
        setMsg(`Falta alcance/valor en fila ${i + 1}.`);
        return false;
      }

      if (!Number.isFinite(r.prize_position) || r.prize_position < 1) {
        setMsg(`Posición inválida en fila ${i + 1}.`);
        return false;
      }

      if (!Number.isFinite(r.priority) || r.priority < 1) {
        setMsg(`Prioridad inválida en fila ${i + 1}.`);
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
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => addRow()} style={buttonStyle}>
          Nueva regla de premio
        </button>

        <button type="button" onClick={() => addRow("gross_net_net")} style={buttonStyle}>
          Ejemplo 1 Gross + 1 Neto + 2 Neto
        </button>

        <div className="text-[11px] leading-snug text-gray-700">
          Estas reglas definen qué premios aparecen en leaderboard y en cálculo de ganadores.
        </div>
      </div>

      <form
        action={savePrizeRulesSnapshot}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(normalizedRows)} />
        <input type="hidden" name="delete_ids_json" value={JSON.stringify(deleteIds)} />

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="min-w-[1420px] w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Orden</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Scope</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Valor</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Premio</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Pos.</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Base</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Prioridad</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Único</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Leaderboard</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Modo</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Rondas</th>
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
                    No hay reglas de premios todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="bg-white align-middle">
                    <td className="border border-gray-300 px-1.5 py-[3px] text-center text-black">
                      {i + 1}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[135px]">
                      <select
                        value={r.scope_type}
                        onChange={(e) => updateRow(r.id, "scope_type", e.target.value)}
                        className={fieldClass}
                      >
                        {SCOPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[165px]">
                      <input
                        type="text"
                        value={r.scope_type === "overall" ? "ALL" : r.scope_value}
                        onChange={(e) => updateRow(r.id, "scope_value", e.target.value)}
                        className={fieldClass}
                        disabled={r.scope_type === "overall"}
                        placeholder="DA,S,SS / senior / category_id"
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[130px]">
                      <input
                        type="text"
                        value={r.prize_label}
                        onChange={(e) => updateRow(r.id, "prize_label", e.target.value)}
                        className={fieldClass}
                        placeholder="1 Gross"
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        min={1}
                        value={r.prize_position}
                        onChange={(e) => updateRow(r.id, "prize_position", Number(e.target.value))}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[120px]">
                      <select
                        value={r.ranking_basis}
                        onChange={(e) => updateRow(r.id, "ranking_basis", e.target.value)}
                        className={fieldClass}
                      >
                        {BASIS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        min={1}
                        value={r.priority}
                        onChange={(e) => updateRow(r.id, "priority", Number(e.target.value))}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      <input
                        type="checkbox"
                        checked={!!r.unique_winner}
                        onChange={(e) => updateRow(r.id, "unique_winner", e.target.checked)}
                        className={checkboxClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      <input
                        type="checkbox"
                        checked={!!r.show_on_leaderboard}
                        onChange={(e) => updateRow(r.id, "show_on_leaderboard", e.target.checked)}
                        className={checkboxClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[145px]">
                      <select
                        value={r.ranking_mode}
                        onChange={(e) => updateRow(r.id, "ranking_mode", e.target.value)}
                        className={fieldClass}
                      >
                        {MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[120px]">
                      <input
                        type="text"
                        value={(r.round_nos ?? []).join(",")}
                        onChange={(e) => updateRow(r.id, "round_nos", parseRoundNos(e.target.value))}
                        className={fieldClass}
                        placeholder="1,2,3"
                        disabled={r.ranking_mode !== "specified_rounds"}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      <input
                        type="checkbox"
                        checked={!!r.is_active}
                        onChange={(e) => updateRow(r.id, "is_active", e.target.checked)}
                        className={checkboxClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[165px]">
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
                ))
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
