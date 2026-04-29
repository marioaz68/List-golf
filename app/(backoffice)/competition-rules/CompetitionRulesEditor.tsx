"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCompetitionRulesSnapshot } from "./actions";

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type CompetitionRuleRow = {
  id?: string | null;
  tournament_id?: string | null;
  category_id: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number | string | null;
  is_active: boolean;
  notes: string | null;
  gross_prize_places?: number | string | null;
  net_prize_places?: number | string | null;
  updated_at?: string | null;
};

type EditorRow = {
  category_id: string;
  code: string;
  name: string;
  sort_order: number;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  gross_prize_places: number;
  net_prize_places: number | null;
  is_active: boolean;
  notes: string;
};

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

const greenButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #14532d",
  boxShadow: "0 3px 0 #14532d, 0 4px 8px rgba(0,0,0,0.22)",
};

const fieldClass =
  "h-7 w-full rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

const shortFieldClass =
  "h-7 w-20 rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

const noteFieldClass =
  "h-7 w-full rounded border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

const checkboxClass = "h-3.5 w-3.5 align-middle";

function toNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function makeInitialRows(categories: CategoryRow[], rules: CompetitionRuleRow[]) {
  const rulesByCategory = new Map<string, CompetitionRuleRow>();

  const sortedRules = [...rules].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? 0).getTime();
    return bTime - aTime;
  });

  for (const rule of sortedRules) {
    const key = String(rule.category_id ?? "");
    if (!key) continue;

    if (!rulesByCategory.has(key)) {
      rulesByCategory.set(key, rule);
    }
  }

  return [...categories]
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    .map<EditorRow>((category) => {
      const existing = rulesByCategory.get(String(category.id));
      const scoringFormat = existing?.scoring_format ?? "stroke_play";
      const defaultBasis = scoringFormat === "stableford" ? "stableford" : "gross";

      return {
        category_id: category.id,
        code: String(category.code ?? "").trim() || category.id.slice(0, 8),
        name: String(category.name ?? "").trim() || "Sin nombre",
        sort_order: category.sort_order ?? 9999,
        scoring_format: scoringFormat,
        leaderboard_basis: existing?.leaderboard_basis ?? defaultBasis,
        prize_basis: existing?.prize_basis ?? defaultBasis,
        handicap_percentage: toNumber(existing?.handicap_percentage, 100),
        gross_prize_places: toNumber(existing?.gross_prize_places, 1),
        net_prize_places: toNullableNumber(existing?.net_prize_places),
        is_active: existing?.is_active ?? true,
        notes: String(existing?.notes ?? ""),
      };
    });
}

function basisLabel(value: string) {
  if (value === "gross") return "Gross";
  if (value === "net") return "Neto";
  if (value === "both") return "Ambos";
  if (value === "stableford") return "Stableford";
  return value;
}

function scoringFormatLabel(value: string) {
  if (value === "stableford") return "Stableford";
  return "Stroke Play";
}

function netPlacesLabel(value: number | null) {
  if (value === null) return "Todos";
  return String(value);
}

export default function CompetitionRulesEditor({
  tournamentId,
  categories,
  rules,
}: {
  tournamentId: string;
  categories: CategoryRow[];
  rules: CompetitionRuleRow[];
}) {
  const [rows, setRows] = useState<EditorRow[]>(() => makeInitialRows(categories, rules));
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      setRows(makeInitialRows(categories, rules));
      setMsg(null);
      setInitialized(true);
    }
  }, [categories, rules, initialized]);

  const normalizedRows = useMemo(
    () =>
      rows.map((r) => ({
        category_id: r.category_id,
        scoring_format: r.scoring_format,
        leaderboard_basis: r.leaderboard_basis,
        prize_basis: r.prize_basis,
        handicap_percentage: Number(r.handicap_percentage),
        gross_prize_places: Number(r.gross_prize_places),
        net_prize_places:
          r.net_prize_places === null || r.net_prize_places === undefined
            ? null
            : Number(r.net_prize_places),
        is_active: !!r.is_active,
        notes: String(r.notes ?? "").trim() || null,
      })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      return (
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        scoringFormatLabel(row.scoring_format).toLowerCase().includes(q) ||
        basisLabel(row.leaderboard_basis).toLowerCase().includes(q) ||
        basisLabel(row.prize_basis).toLowerCase().includes(q)
      );
    });
  }, [filter, rows]);

  function updateRow(
    categoryId: string,
    field: keyof EditorRow,
    value: string | number | boolean | null
  ) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.category_id !== categoryId) return row;

        const next = { ...row, [field]: value } as EditorRow;

        if (field === "scoring_format") {
          if (value === "stableford") {
            next.leaderboard_basis = "stableford";
            next.prize_basis = "stableford";
            next.gross_prize_places = 0;
            next.net_prize_places = null;
          }

          if (value === "stroke_play") {
            if (next.leaderboard_basis === "stableford") next.leaderboard_basis = "gross";
            if (next.prize_basis === "stableford") next.prize_basis = "gross";
            if (next.gross_prize_places < 0) next.gross_prize_places = 1;
          }
        }

        if (field === "leaderboard_basis") {
          if (value === "gross") {
            next.prize_basis = next.prize_basis === "stableford" ? "gross" : next.prize_basis;
            if (next.gross_prize_places <= 0) next.gross_prize_places = 1;
          }

          if (value === "net") {
            next.prize_basis = next.prize_basis === "stableford" ? "net" : next.prize_basis;
            next.gross_prize_places = 0;
            if (next.net_prize_places === null || next.net_prize_places <= 0) next.net_prize_places = 1;
          }

          if (value === "both") {
            next.prize_basis = "both";
            if (next.gross_prize_places <= 0) next.gross_prize_places = 1;
            if (next.net_prize_places === null || next.net_prize_places <= 0) next.net_prize_places = 1;
          }
        }

        if (field === "prize_basis") {
          if (value === "gross") {
            if (next.gross_prize_places <= 0) next.gross_prize_places = 1;
            next.net_prize_places = 0;
          }

          if (value === "net") {
            next.gross_prize_places = 0;
            if (next.net_prize_places === null || next.net_prize_places <= 0) next.net_prize_places = 1;
          }

          if (value === "both") {
            if (next.gross_prize_places <= 0) next.gross_prize_places = 1;
            if (next.net_prize_places === null || next.net_prize_places <= 0) next.net_prize_places = 1;
          }
        }

        return next;
      })
    );
    setMsg(null);
  }

  function validate() {
    if (!tournamentId) {
      setMsg("Falta tournament_id.");
      return false;
    }

    if (normalizedRows.length === 0) {
      setMsg("Este torneo no tiene categorías para configurar.");
      return false;
    }

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const original = rows[i];
      const label = original ? `${original.code} - ${original.name}` : `fila ${i + 1}`;

      if (!row.category_id) {
        setMsg(`Falta category_id en ${label}.`);
        return false;
      }

      if (!Number.isFinite(row.handicap_percentage)) {
        setMsg(`% handicap inválido en ${label}.`);
        return false;
      }

      if (row.handicap_percentage < 0 || row.handicap_percentage > 150) {
        setMsg(`% handicap debe estar entre 0 y 150 en ${label}.`);
        return false;
      }

      if (!Number.isFinite(row.gross_prize_places)) {
        setMsg(`Lugares Gross inválidos en ${label}.`);
        return false;
      }

      if (row.gross_prize_places < 0) {
        setMsg(`Lugares Gross no puede ser negativo en ${label}.`);
        return false;
      }

      if (row.net_prize_places !== null && !Number.isFinite(row.net_prize_places)) {
        setMsg(`Lugares Neto inválidos en ${label}.`);
        return false;
      }

      if (row.net_prize_places !== null && row.net_prize_places < 0) {
        setMsg(`Lugares Neto no puede ser negativo en ${label}.`);
        return false;
      }

      if (row.scoring_format === "stableford" && row.leaderboard_basis !== "stableford") {
        setMsg(`Si ${label} es Stableford, el leaderboard debe ser Stableford.`);
        return false;
      }

      if (row.scoring_format === "stableford" && row.prize_basis !== "stableford") {
        setMsg(`Si ${label} es Stableford, los premios deben ser Stableford.`);
        return false;
      }

      if (row.scoring_format === "stroke_play" && row.leaderboard_basis === "stableford") {
        setMsg(`Si ${label} es Stroke Play, el leaderboard no puede ser Stableford.`);
        return false;
      }

      if (row.scoring_format === "stroke_play" && row.prize_basis === "stableford") {
        setMsg(`Si ${label} es Stroke Play, los premios no pueden ser Stableford.`);
        return false;
      }
    }

    setMsg(null);
    return true;
  }

  const stablefordCount = rows.filter((r) => r.scoring_format === "stableford").length;
  const eightyCount = rows.filter((r) => Number(r.handicap_percentage) === 80).length;
  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="space-y-2 rounded-lg border border-gray-300 bg-white/95 p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] leading-snug text-gray-700">
          Configura la modalidad por categoría antes de calcular cortes, leaderboard y premios.
        </div>

        <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-700">
          <span className="rounded border border-gray-300 bg-gray-100 px-2 py-1">
            Categorías: {rows.length}
          </span>
          <span className="rounded border border-gray-300 bg-gray-100 px-2 py-1">
            Activas: {activeCount}
          </span>
          <span className="rounded border border-gray-300 bg-gray-100 px-2 py-1">
            Stableford: {stablefordCount}
          </span>
          <span className="rounded border border-gray-300 bg-gray-100 px-2 py-1">
            HCP 80%: {eightyCount}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded border border-gray-300 bg-gray-50 p-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 min-w-[220px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black"
          placeholder="Buscar categoría, modalidad o base"
        />

        <div className="text-[11px] leading-snug text-gray-600">
          Neto vacío = premiar a todos los demás después de Gross.
        </div>
      </div>

      <form
        action={saveCompetitionRulesSnapshot}
        onSubmit={(e) => {
          if (!validate()) e.preventDefault();
        }}
        className="space-y-2"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(normalizedRows)} />

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
          <table className="min-w-[1260px] w-full border-collapse text-[11px] leading-none">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Orden
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Categoría
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Modalidad
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Leaderboard
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Premios
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  % HCP
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Gross
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Neto
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-center font-semibold">
                  Activa
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Notas
                </th>
                <th className="border border-gray-300 px-1.5 py-[4px] text-left font-semibold">
                  Resumen
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="border border-gray-300 px-2 py-3 text-center text-[11px] text-gray-500"
                  >
                    No hay categorías que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.category_id} className="bg-white align-middle text-black">
                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      {r.sort_order === 9999 ? "-" : r.sort_order}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[180px]">
                      <div className="font-semibold leading-tight text-black">{r.code}</div>
                      <div className="text-[10px] leading-tight text-gray-600">{r.name}</div>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[145px]">
                      <select
                        value={r.scoring_format}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "scoring_format",
                            e.target.value as EditorRow["scoring_format"]
                          )
                        }
                        className={fieldClass}
                      >
                        <option value="stroke_play">Stroke Play</option>
                        <option value="stableford">Stableford</option>
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[145px]">
                      <select
                        value={r.leaderboard_basis}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "leaderboard_basis",
                            e.target.value as EditorRow["leaderboard_basis"]
                          )
                        }
                        className={fieldClass}
                        disabled={r.scoring_format === "stableford"}
                      >
                        {r.scoring_format === "stableford" ? (
                          <option value="stableford">Stableford</option>
                        ) : (
                          <>
                            <option value="gross">Gross</option>
                            <option value="net">Neto</option>
                            <option value="both">Ambos</option>
                          </>
                        )}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[145px]">
                      <select
                        value={r.prize_basis}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "prize_basis",
                            e.target.value as EditorRow["prize_basis"]
                          )
                        }
                        className={fieldClass}
                        disabled={r.scoring_format === "stableford"}
                      >
                        {r.scoring_format === "stableford" ? (
                          <option value="stableford">Stableford</option>
                        ) : (
                          <>
                            <option value="gross">Gross</option>
                            <option value="net">Neto</option>
                            <option value="both">Ambos</option>
                          </>
                        )}
                      </select>
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        min="0"
                        max="150"
                        step="0.01"
                        value={r.handicap_percentage}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "handicap_percentage",
                            Number(e.target.value)
                          )
                        }
                        className={shortFieldClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={r.gross_prize_places}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "gross_prize_places",
                            Number(e.target.value)
                          )
                        }
                        className={shortFieldClass}
                        disabled={r.scoring_format === "stableford"}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={r.net_prize_places ?? ""}
                        onChange={(e) =>
                          updateRow(
                            r.category_id,
                            "net_prize_places",
                            e.target.value === "" ? null : Number(e.target.value)
                          )
                        }
                        className={shortFieldClass}
                        placeholder="Todos"
                        disabled={r.scoring_format === "stableford"}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                      <input
                        type="checkbox"
                        checked={!!r.is_active}
                        onChange={(e) => updateRow(r.category_id, "is_active", e.target.checked)}
                        className={checkboxClass}
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[210px]">
                      <input
                        type="text"
                        value={r.notes}
                        onChange={(e) => updateRow(r.category_id, "notes", e.target.value)}
                        className={noteFieldClass}
                        placeholder="Observaciones"
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] min-w-[220px] text-[10px] leading-tight text-gray-700">
                      <div>
                        {scoringFormatLabel(r.scoring_format)} · LB {basisLabel(r.leaderboard_basis)}
                      </div>
                      <div>
                        Premios {basisLabel(r.prize_basis)} · HCP {r.handicap_percentage}%
                      </div>
                      <div>
                        Gross {r.gross_prize_places} · Neto {netPlacesLabel(r.net_prize_places)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="submit" style={greenButtonStyle}>
            Guardar reglas de competencia
          </button>

          {msg && <div className="text-[11px] leading-snug text-red-600">{msg}</div>}

          <div className="text-[11px] leading-snug text-gray-600">
            Se guardan todas las categorías del torneo para que el leaderboard y premios lean una sola fuente.
          </div>
        </div>
      </form>
    </div>
  );
}
