"use client";

import { useMemo, useState } from "react";
import { saveTeeSetCatalogAndSelectionAction } from "./actions";

type Row = {
  id: string;
  tournament_id: string;
  code: string;
  name: string;
  color: string;
  sort_order: number;
  selected: boolean;
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

export default function TeeSetsEditor({
  tournamentId,
  rows: initialRows,
}: {
  tournamentId: string;
  rows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>([...initialRows]);
  const [msg, setMsg] = useState<string | null>(null);

  function updateRow(id: string, field: keyof Row, value: string | number | boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setMsg(null);
  }

  function moveUp(id: string) {
    setRows((prev) => {
      const selected = prev.filter((x) => x.selected);
      const unselected = prev.filter((x) => !x.selected);

      const i = selected.findIndex((r) => r.id === id);
      if (i <= 0) return prev;

      const nextSelected = [...selected];
      [nextSelected[i - 1], nextSelected[i]] = [nextSelected[i], nextSelected[i - 1]];

      return [
        ...nextSelected.map((r, idx) => ({ ...r, sort_order: idx + 1 })),
        ...unselected,
      ];
    });
    setMsg(null);
  }

  function moveDown(id: string) {
    setRows((prev) => {
      const selected = prev.filter((x) => x.selected);
      const unselected = prev.filter((x) => !x.selected);

      const i = selected.findIndex((r) => r.id === id);
      if (i < 0 || i === selected.length - 1) return prev;

      const nextSelected = [...selected];
      [nextSelected[i + 1], nextSelected[i]] = [nextSelected[i], nextSelected[i + 1]];

      return [
        ...nextSelected.map((r, idx) => ({ ...r, sort_order: idx + 1 })),
        ...unselected,
      ];
    });
    setMsg(null);
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: "",
        tournament_id: tournamentId,
        code: "",
        name: "",
        color: "",
        sort_order: prev.filter((r) => r.selected).length + 1,
        selected: true,
      },
    ]);
    setMsg(null);
  }

  function removeUnsavedRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setMsg(null);
  }

  function selectAll() {
    setRows((prev) => {
      let nextSort = 1;
      return prev.map((r) => ({
        ...r,
        selected: true,
        sort_order: nextSort++,
      }));
    });
    setMsg(null);
  }

  function clearAll() {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
    setMsg(null);
  }

  const normalizedRows = useMemo(() => {
    const selectedRows = rows
      .filter((r) => r.selected)
      .map((r, i) => ({
        ...r,
        code: String(r.code ?? "").trim().toUpperCase(),
        name: String(r.name ?? "").trim(),
        color: String(r.color ?? "").trim(),
        sort_order: i + 1,
      }));

    const unselectedRows = rows
      .filter((r) => !r.selected)
      .map((r, i) => ({
        ...r,
        code: String(r.code ?? "").trim().toUpperCase(),
        name: String(r.name ?? "").trim(),
        color: String(r.color ?? "").trim(),
        sort_order: selectedRows.length + i + 1,
      }));

    return [...selectedRows, ...unselectedRows];
  }, [rows]);

  function validate() {
    const used = new Set<string>();

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (!r.code) {
        setMsg(`Falta Code en fila ${i + 1}.`);
        return false;
      }

      if (!r.name) {
        setMsg(`Falta Nombre en fila ${i + 1}.`);
        return false;
      }

      if (used.has(r.code)) {
        setMsg(`El Code "${r.code}" está repetido.`);
        return false;
      }

      used.add(r.code);
    }

    setMsg(null);
    return true;
  }

  const fieldClass =
    "h-7 w-full rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

  return (
    <div className="space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={addRow} style={buttonStyle}>
            Nueva salida
          </button>
          <button type="button" onClick={selectAll} style={buttonStyle}>
            Marcar todas
          </button>
          <button type="button" onClick={clearAll} style={redButtonStyle}>
            Quitar todas
          </button>
        </div>

        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
          Seleccionadas: {rows.filter((r) => r.selected).length}
        </div>
      </div>

      <div className="text-[11px] leading-snug text-gray-700">
        Aquí das de alta las salidas una sola vez y solo marcas las que usará este torneo.
      </div>

      <form
        action={saveTeeSetCatalogAndSelectionAction}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(normalizedRows)} />

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">Usar</th>
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">Orden</th>
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">Code</th>
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">Nombre</th>
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">Color</th>
                <th className="border border-gray-300 px-1.5 py-[4px] font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {normalizedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    No hay salidas. Agrega una nueva.
                  </td>
                </tr>
              ) : (
                normalizedRows.map((r, i) => (
                  <tr key={`${r.id || "tmp"}_${i}`} className={r.selected ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => updateRow(r.id || `${i}`, "selected", e.target.checked)}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] text-center text-black">
                      {r.selected ? r.sort_order : "-"}
                    </td>

                    <td className="min-w-[90px] border border-gray-300 px-1.5 py-[3px]">
                      <input
                        value={r.code}
                        onChange={(e) =>
                          updateRow(r.id || `${i}`, "code", e.target.value.toUpperCase())
                        }
                        className={fieldClass}
                        placeholder="BLK"
                      />
                    </td>

                    <td className="min-w-[180px] border border-gray-300 px-1.5 py-[3px]">
                      <input
                        value={r.name}
                        onChange={(e) => updateRow(r.id || `${i}`, "name", e.target.value)}
                        className={fieldClass}
                        placeholder="Negras"
                      />
                    </td>

                    <td className="min-w-[130px] border border-gray-300 px-1.5 py-[3px]">
                      <input
                        value={r.color}
                        onChange={(e) => updateRow(r.id || `${i}`, "color", e.target.value)}
                        className={fieldClass}
                        placeholder="black"
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <div className="flex flex-nowrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveUp(r.id)}
                          style={buttonStyle}
                          title="Subir"
                          disabled={!r.selected || !r.id}
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() => moveDown(r.id)}
                          style={buttonStyle}
                          title="Bajar"
                          disabled={!r.selected || !r.id}
                        >
                          ↓
                        </button>

                        {!r.id ? (
                          <button
                            type="button"
                            onClick={() => removeUnsavedRow(i)}
                            style={redButtonStyle}
                          >
                            Quitar
                          </button>
                        ) : null}
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
            Guardar selección
          </button>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}
        </div>
      </form>
    </div>
  );
}