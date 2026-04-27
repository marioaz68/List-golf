"use client";

import { useMemo, useState } from "react";
import {
  saveCategoriesSnapshot,
  saveTournamentCategoriesAsTemplate,
} from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";

type Row = {
  id: string;
  tournament_id: string;
  gender: "M" | "F" | "X";
  category_group: "main" | "senior" | "ladies" | "super_senior" | "mixed";
  code: string;
  name: string;
  handicap_min: number;
  handicap_max: number;
  max_players?: number | null;
  sort_order: number;
  is_active: boolean;
};

function tempId() {
  return "tmp_" + Math.random().toString(36).substring(2, 9);
}

const GROUP_OPTIONS: Array<{
  value: Row["category_group"];
  label: string;
}> = [
  { value: "main", label: "Main" },
  { value: "senior", label: "Senior" },
  { value: "ladies", label: "Ladies" },
  { value: "super_senior", label: "Super Senior" },
  { value: "mixed", label: "Mixto" },
];

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

const fieldBarStyle: React.CSSProperties = {
  height: "28px",
  minWidth: "180px",
  borderRadius: "6px",
  border: "1px solid #9ca3af",
  background: "#f3f4f6",
  color: "#111827",
  padding: "0 8px",
  fontSize: "11px",
};

export default function CategoryTemplateEditor({
  tournamentId,
  categories,
}: {
  tournamentId: string;
  categories: Row[];
}) {
  const initialRows = useMemo(
    () =>
      [...categories].sort(
        (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
      ),
    [categories]
  );

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("Torneos Anuales");
  const [templateDescription, setTemplateDescription] = useState(
    "Plantilla rescatada desde categorías actuales del torneo."
  );

  function updateRow(
    id: string,
    field: keyof Row,
    value: string | number | boolean | null
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
    setMsg(null);
  }

  function moveUp(id: string) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === id);
      if (index <= 0) return prev;

      const newRows = [...prev];
      [newRows[index - 1], newRows[index]] = [
        newRows[index],
        newRows[index - 1],
      ];
      return newRows;
    });
    setMsg(null);
  }

  function moveDown(id: string) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === id);
      if (index < 0 || index === prev.length - 1) return prev;

      const newRows = [...prev];
      [newRows[index + 1], newRows[index]] = [
        newRows[index],
        newRows[index + 1],
      ];
      return newRows;
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

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: tempId(),
        tournament_id: tournamentId,
        gender: "M",
        category_group: "main",
        code: "",
        name: "",
        handicap_min: 0,
        handicap_max: 0,
        max_players: null,
        sort_order: prev.length + 1,
        is_active: true,
      },
    ]);
    setMsg(null);
  }

  const normalizedRows = rows.map((r, i) => ({
    ...r,
    code: String(r.code ?? "").trim().toUpperCase(),
    name: String(r.name ?? "").trim(),
    category_group: (r.category_group ?? "main") as Row["category_group"],
    max_players: r.max_players ?? null,
    sort_order: i + 1,
    is_active: Boolean(r.is_active),
  }));

  function validate() {
    if (normalizedRows.length === 0) {
      setMsg("Debe existir al menos una categoría.");
      return false;
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];

      if (!r.code) {
        setMsg(`Falta Code en fila ${i + 1}. Ejemplo: AA, A, B, SA, SB`);
        return false;
      }

      if (!r.name) {
        setMsg(`Falta Nombre en fila ${i + 1}. Ejemplo: Super Senior`);
        return false;
      }

      if (
        !Number.isFinite(Number(r.handicap_min)) ||
        !Number.isFinite(Number(r.handicap_max))
      ) {
        setMsg(`Min/Max inválido en fila ${i + 1}.`);
        return false;
      }

      if (Number(r.handicap_min) > Number(r.handicap_max)) {
        setMsg(`Min mayor que Max en fila ${i + 1}.`);
        return false;
      }

      if (
        r.max_players !== null &&
        r.max_players !== undefined &&
        (!Number.isFinite(Number(r.max_players)) || Number(r.max_players) < 0)
      ) {
        setMsg(`Cupo inválido en fila ${i + 1}.`);
        return false;
      }
    }

    const used = new Set<string>();
    for (let i = 0; i < normalizedRows.length; i++) {
      const key = `${normalizedRows[i].code}`.toUpperCase();
      if (used.has(key)) {
        setMsg(
          `El Code "${normalizedRows[i].code}" está repetido dentro del torneo.`
        );
        return false;
      }
      used.add(key);
    }

    setMsg(null);
    return true;
  }

  const fieldClass =
    "h-7 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";
  const numberClass =
    "h-7 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";
  const selectClass =
    "h-7 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

  return (
    <div className="space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2 pb-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={addRow} style={buttonStyle}>
            Nueva categoría
          </button>

          <div className="text-[11px] leading-snug text-gray-700">
            Puedes agregar, desactivar o borrar categorías del torneo.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-300 bg-gray-50 p-2">
        <form
          action={saveTournamentCategoriesAsTemplate}
          className="flex flex-wrap items-end gap-1.5"
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />

          <div className="flex min-w-[220px] flex-col gap-1">
            <label className="text-[11px] font-semibold leading-none text-gray-700">
              Guardar como plantilla
            </label>
            <input
              type="text"
              name="template_name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              style={fieldBarStyle}
            />
          </div>

          <div className="flex min-w-[260px] flex-1 flex-col gap-1">
            <label className="text-[11px] font-semibold leading-none text-gray-700">
              Descripción
            </label>
            <input
              type="text"
              name="template_description"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              style={fieldBarStyle}
            />
          </div>

          <SubmitButton pendingText="Guardando plantilla...">
            Guardar plantilla
          </SubmitButton>
        </form>
      </div>

      <form
        action={saveCategoriesSnapshot}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input
          type="hidden"
          name="rows_json"
          value={JSON.stringify(normalizedRows)}
        />
        <input
          type="hidden"
          name="delete_ids_json"
          value={JSON.stringify(deleteIds)}
        />

        <div className="rounded-lg border border-gray-300 bg-white">
          <div
            className="overflow-x-auto"
            style={{
              paddingBottom: "12px",
              scrollbarGutter: "stable",
            }}
          >
            <div
              className="min-w-max"
              style={{
                paddingBottom: "12px",
              }}
            >
              <table className="w-full min-w-[1060px] border-collapse text-[11px] leading-none">
                <thead>
                  <tr className="bg-gray-200 text-gray-900">
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Orden
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Activa
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Género
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Grupo
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Code
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Nombre
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Min
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Max
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Cupo
                    </th>
                    <th className="border border-gray-300 px-1.5 py-[3px] font-semibold">
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                      >
                        No hay categorías todavía. Aplica una plantilla o agrega una nueva.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr
                        key={r.id}
                        className={
                          r.is_active
                            ? "bg-white align-middle"
                            : "bg-gray-100 align-middle opacity-80"
                        }
                      >
                        <td className="border border-gray-300 px-1.5 py-[3px] text-center text-black">
                          {i + 1}
                        </td>

                        <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                          <input
                            type="checkbox"
                            checked={r.is_active}
                            onChange={(e) =>
                              updateRow(r.id, "is_active", e.target.checked)
                            }
                          />
                        </td>

                        <td className="min-w-[72px] border border-gray-300 px-1.5 py-[3px]">
                          <select
                            value={r.gender}
                            onChange={(e) =>
                              updateRow(
                                r.id,
                                "gender",
                                e.target.value as Row["gender"]
                              )
                            }
                            className={selectClass}
                          >
                            <option value="M">M</option>
                            <option value="F">F</option>
                            <option value="X">X</option>
                          </select>
                        </td>

                        <td className="min-w-[130px] border border-gray-300 px-1.5 py-[3px]">
                          <select
                            value={r.category_group}
                            onChange={(e) =>
                              updateRow(
                                r.id,
                                "category_group",
                                e.target.value as Row["category_group"]
                              )
                            }
                            className={selectClass}
                          >
                            {GROUP_OPTIONS.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="min-w-[80px] border border-gray-300 px-1.5 py-[3px]">
                          <input
                            type="text"
                            autoComplete="off"
                            value={r.code}
                            onChange={(e) =>
                              updateRow(r.id, "code", e.target.value.toUpperCase())
                            }
                            className={fieldClass}
                            placeholder="SA"
                          />
                        </td>

                        <td className="min-w-[180px] border border-gray-300 px-1.5 py-[3px]">
                          <input
                            type="text"
                            autoComplete="off"
                            value={r.name}
                            onChange={(e) => updateRow(r.id, "name", e.target.value)}
                            className={fieldClass}
                            placeholder="Super Senior"
                          />
                        </td>

                        <td className="min-w-[78px] border border-gray-300 px-1.5 py-[3px]">
                          <input
                            type="number"
                            step="0.1"
                            value={r.handicap_min}
                            onChange={(e) =>
                              updateRow(r.id, "handicap_min", Number(e.target.value))
                            }
                            className={numberClass}
                          />
                        </td>

                        <td className="min-w-[78px] border border-gray-300 px-1.5 py-[3px]">
                          <input
                            type="number"
                            step="0.1"
                            value={r.handicap_max}
                            onChange={(e) =>
                              updateRow(r.id, "handicap_max", Number(e.target.value))
                            }
                            className={numberClass}
                          />
                        </td>

                        <td className="min-w-[78px] border border-gray-300 px-1.5 py-[3px]">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={r.max_players ?? ""}
                            placeholder="∞"
                            onChange={(e) =>
                              updateRow(
                                r.id,
                                "max_players",
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            className={numberClass}
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <SubmitButton pendingText="Guardando cambios...">
            Guardar cambios
          </SubmitButton>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}
        </div>
      </form>
    </div>
  );
}