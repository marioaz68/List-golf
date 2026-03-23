"use client";

import { useMemo, useState } from "react";
import { saveCategoryTeeRulesSnapshot } from "./actions";

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  category_group: string | null;
  sort_order: number | null;
};

type TeeSetRow = {
  id: string;
  name: string | null;
  sort_order: number | null;
};

type RuleRow = {
  id: string;
  category_id: string;
  tee_set_id: string;
  priority: number | null;
  age_min: number | null;
  age_max: number | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
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

export default function CategoryTeeRulesEditor({
  tournamentId,
  categories,
  teeSets,
  rules,
}: {
  tournamentId: string;
  categories: CategoryRow[];
  teeSets: TeeSetRow[];
  rules: RuleRow[];
}) {
  const [rows, setRows] = useState<RuleRow[]>(
    [...rules].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
  );
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [categories]
  );

  const sortedTeeSets = useMemo(
    () => [...teeSets].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [teeSets]
  );

  const canAddRule = sortedCategories.length > 0 && sortedTeeSets.length > 0;

  function updateRow(id: string, field: keyof RuleRow, value: string | number | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setMsg(null);
  }

  function addRow() {
    if (!canAddRule) {
      if (sortedCategories.length === 0 && sortedTeeSets.length === 0) {
        setMsg("Primero da de alta categorías y salidas en este torneo.");
      } else if (sortedCategories.length === 0) {
        setMsg("Primero da de alta al menos una categoría en este torneo.");
      } else {
        setMsg("Primero da de alta al menos una salida en este torneo.");
      }
      return;
    }

    setRows((prev) => [
      ...prev,
      {
        id: tempId(),
        category_id: sortedCategories[0]?.id ?? "",
        tee_set_id: sortedTeeSets[0]?.id ?? "",
        priority: prev.length + 1,
        age_min: null,
        age_max: null,
        gender: null,
        handicap_min: null,
        handicap_max: null,
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
    priority: i + 1,
    age_min:
      r.age_min === null || r.age_min === undefined || r.age_min === ("" as any)
        ? null
        : Number(r.age_min),
    age_max:
      r.age_max === null || r.age_max === undefined || r.age_max === ("" as any)
        ? null
        : Number(r.age_max),
    handicap_min:
      r.handicap_min === null || r.handicap_min === undefined || r.handicap_min === ("" as any)
        ? null
        : Number(r.handicap_min),
    handicap_max:
      r.handicap_max === null || r.handicap_max === undefined || r.handicap_max === ("" as any)
        ? null
        : Number(r.handicap_max),
    gender: r.gender ? r.gender : null,
  }));

  function validate() {
    if (sortedCategories.length === 0) {
      setMsg("Primero da de alta categorías.");
      return false;
    }

    if (sortedTeeSets.length === 0) {
      setMsg("Primero da de alta salidas.");
      return false;
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (!r.category_id) {
        setMsg(`Falta categoría en fila ${i + 1}.`);
        return false;
      }

      if (!r.tee_set_id) {
        setMsg(`Falta salida en fila ${i + 1}.`);
        return false;
      }

      if (r.age_min !== null && r.age_max !== null && Number(r.age_min) > Number(r.age_max)) {
        setMsg(`Edad mínima mayor que máxima en fila ${i + 1}.`);
        return false;
      }

      if (
        r.handicap_min !== null &&
        r.handicap_max !== null &&
        Number(r.handicap_min) > Number(r.handicap_max)
      ) {
        setMsg(`Handicap mínimo mayor que máximo en fila ${i + 1}.`);
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

  return (
    <div className="space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2 shadow-sm">
      {!canAddRule && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          {sortedCategories.length === 0 && sortedTeeSets.length === 0
            ? "Este torneo todavía no tiene categorías ni salidas."
            : sortedCategories.length === 0
              ? "Este torneo no tiene categorías."
              : "Este torneo no tiene salidas."}
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
          Primero necesitas categorías y salidas dadas de alta en el mismo torneo.
        </div>
      </div>

      <form
        action={saveCategoryTeeRulesSnapshot}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(normalizedRows)} />
        <input type="hidden" name="delete_ids_json" value={JSON.stringify(deleteIds)} />

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Orden</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Categoría
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">Salida</th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Edad Min
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Edad Max
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Género
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Hcp Min
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Hcp Max
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {normalizedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    No hay reglas todavía.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="bg-white align-middle">
                    <td className="border border-gray-300 px-1.5 py-[3px] text-center text-black">
                      {i + 1}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[210px]">
                      <select
                        value={r.category_id}
                        onChange={(e) => updateRow(r.id, "category_id", e.target.value)}
                        className={fieldClass}
                      >
                        {sortedCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {`${c.code ?? ""} - ${c.name ?? ""}`}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[160px]">
                      <select
                        value={r.tee_set_id}
                        onChange={(e) => updateRow(r.id, "tee_set_id", e.target.value)}
                        className={fieldClass}
                      >
                        {sortedTeeSets.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name ?? ""}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        value={r.age_min ?? ""}
                        onChange={(e) => updateRow(r.id, "age_min", e.target.value)}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        value={r.age_max ?? ""}
                        onChange={(e) => updateRow(r.id, "age_max", e.target.value)}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <select
                        value={r.gender ?? ""}
                        onChange={(e) => updateRow(r.id, "gender", e.target.value || null)}
                        className={shortFieldClass}
                      >
                        <option value="">Todos</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="X">X</option>
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        step="0.1"
                        value={r.handicap_min ?? ""}
                        onChange={(e) => updateRow(r.id, "handicap_min", e.target.value)}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        step="0.1"
                        value={r.handicap_max ?? ""}
                        onChange={(e) => updateRow(r.id, "handicap_max", e.target.value)}
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <div className="flex flex-nowrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveUp(r.id)}
                          style={buttonStyle}
                          title="Subir"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() => moveDown(r.id)}
                          style={buttonStyle}
                          title="Bajar"
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          style={redButtonStyle}
                        >
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
          <button style={buttonStyle}>Guardar reglas</button>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}
        </div>
      </form>
    </div>
  );
}