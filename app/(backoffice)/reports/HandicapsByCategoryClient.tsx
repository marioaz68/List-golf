"use client";

import { useMemo, useState } from "react";

export type HandicapReportRow = {
  entry_id: string;
  name: string;
  gender: string;
  hi: number;
  hi_effective: number | null;
  hi_cap_source: "rule_max" | "rule_min" | null;
  ch: number | null;
  ph: number | null;
  is_override: boolean;
  allowance_pct: number | null;
  tee: { code: string | null; name: string | null; color: string | null } | null;
};

export type HandicapReportCategory = {
  id: string;
  code: string | null;
  name: string | null;
  rows: HandicapReportRow[];
};

const numFmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "—" : String(Math.round(Number(n)));
const hiFmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toFixed(1);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function HandicapsByCategoryClient({
  categories,
}: {
  categories: HandicapReportCategory[];
}) {
  const [search, setSearch] = useState("");

  const totalRows = useMemo(
    () => categories.reduce((acc, c) => acc + c.rows.length, 0),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) {
      return { cats: categories, shown: totalRows };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    const cats = categories
      .map((cat) => {
        const rows = cat.rows.filter((r) => {
          const haystack = normalize(
            [
              r.name,
              r.gender,
              r.tee?.code ?? "",
              r.tee?.name ?? "",
              r.tee?.color ?? "",
              hiFmt(r.hi),
              numFmt(r.ch),
              numFmt(r.ph),
            ].join(" ")
          );
          return tokens.every((t) => haystack.includes(t));
        });
        shown += rows.length;
        return { ...cat, rows };
      })
      .filter((c) => c.rows.length > 0);
    return { cats, shown };
  }, [categories, search, totalRows]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        CH = HI × Slope/113 + (CR − Par) según la salida que la regla
        salida/categoría le asigna en el campo. PH = CH × % de reglas de
        competencia. Ordenado por handicap ascendente (menor arriba). Si el
        HI del jugador rebasa el rango de la regla, se aplica el{" "}
        <span className="font-semibold text-amber-300">
          máximo a jugar del torneo
        </span>{" "}
        (handicap_max) — se indica con flecha amarilla en la columna HI.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#0f172a] px-2 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Buscar
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, salida, color, HI/CH/PH…"
          className="h-7 min-w-[200px] flex-1 rounded border border-white/10 bg-[#0b1422] px-2 text-[12px] text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300 hover:bg-white/10"
          >
            Limpiar
          </button>
        ) : null}
        <span className="ml-auto text-[10px] tabular-nums text-slate-400">
          {filtered.shown}/{totalRows}
        </span>
      </div>

      <div className="space-y-3">
        {filtered.cats.map((cat) => {
          const label = cat.code
            ? `${cat.code} · ${cat.name ?? ""}`
            : cat.name ?? "—";
          return (
            <section
              key={cat.id}
              className="rounded-lg border border-white/10 bg-[#0f172a]"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
                <h2 className="text-[13px] font-bold text-white">{label}</h2>
                <span className="text-[10px] text-slate-400">
                  {cat.rows.length} inscrit{cat.rows.length === 1 ? "o" : "os"}
                </span>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[12px] text-white">
                  <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
                    <tr>
                      <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                      <th className="px-2 py-1.5">Nombre</th>
                      <th className="px-2 py-1.5 text-center w-[36px]">Sexo</th>
                      <th className="px-2 py-1.5 text-right w-[56px]">HI</th>
                      <th className="px-2 py-1.5 text-right w-[48px]">CH</th>
                      <th className="px-2 py-1.5 text-right w-[48px]">PH</th>
                      <th className="px-2 py-1.5 text-right w-[44px]">%</th>
                      <th className="px-2 py-1.5">Salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.rows.map((r, idx) => (
                      <tr
                        key={r.entry_id}
                        className="border-t border-white/5 align-middle hover:bg-white/[0.02]"
                      >
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 text-center text-slate-300">
                          {r.gender}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            r.hi_cap_source != null
                              ? "text-amber-200"
                              : "text-slate-100"
                          }`}
                          title={
                            r.hi_cap_source != null && r.hi_effective != null
                              ? `HI real ${hiFmt(r.hi)} — capado a ${hiFmt(
                                  r.hi_effective
                                )} (máximo del torneo en su categoría/salida).`
                              : undefined
                          }
                        >
                          {hiFmt(r.hi)}
                          {r.hi_cap_source != null && r.hi_effective != null ? (
                            <span className="ml-1 text-[8px] uppercase text-amber-300">
                              → {hiFmt(r.hi_effective)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                          {r.is_override ? "—" : numFmt(r.ch)}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                            r.is_override ? "text-amber-300" : "text-emerald-300"
                          }`}
                          title={
                            r.is_override
                              ? "Override manual desde panel de match play"
                              : undefined
                          }
                        >
                          {numFmt(r.ph)}
                          {r.is_override ? (
                            <span className="ml-1 text-[8px] uppercase">ovr</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {r.allowance_pct != null
                            ? `${r.allowance_pct}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.tee ? (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold"
                              title={`${r.tee.name ?? ""} (${r.tee.code ?? ""})`}
                            >
                              <span
                                aria-hidden
                                className="inline-block h-3 w-3 rounded-full border border-white/30"
                                style={{
                                  backgroundColor:
                                    r.tee.color && r.tee.color.trim().length > 0
                                      ? r.tee.color
                                      : "#888888",
                                }}
                              />
                              <span className="text-white">
                                {r.tee.code ?? r.tee.name ?? "—"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">
                              sin regla
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {filtered.cats.length === 0 ? (
          <p className="text-[12px] text-amber-200">
            {search
              ? `Sin resultados para "${search}".`
              : "No hay inscritos en este torneo."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
