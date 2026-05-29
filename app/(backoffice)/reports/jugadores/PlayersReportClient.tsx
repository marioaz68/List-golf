"use client";

import { useMemo, useState } from "react";
import PlayersReportToolbar from "./PlayersReportToolbar";

export type PlayersReportRow = {
  id: string;
  name: string;
  ghin: string | null;
  gender: string;
  hi: number | null;
  birth_year: number | null;
  phone: string | null;
  email: string | null;
  shirt_size: string | null;
  shoe_size: string | null;
};

export type PlayersReportGroup = {
  id: string;
  label: string;
  rows: PlayersReportRow[];
};

const hiFmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toFixed(1);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function PlayersReportClient({
  groups,
  title,
}: {
  groups: PlayersReportGroup[];
  title: string;
}) {
  const [search, setSearch] = useState("");

  const totalRows = useMemo(
    () => groups.reduce((acc, g) => acc + g.rows.length, 0),
    [groups]
  );

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return { groups, shown: totalRows };
    const tokens = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    const next = groups
      .map((g) => {
        const rows = g.rows.filter((r) => {
          const haystack = normalize(
            [
              r.name,
              r.ghin ?? "",
              r.gender,
              hiFmt(r.hi),
              String(r.birth_year ?? ""),
              r.phone ?? "",
              r.email ?? "",
              r.shirt_size ?? "",
              r.shoe_size ?? "",
              g.label,
            ].join(" ")
          );
          return tokens.every((t) => haystack.includes(t));
        });
        shown += rows.length;
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0);
    return { groups: next, shown };
  }, [groups, search, totalRows]);

  return (
    <div className="report-printable space-y-3">
      <div className="hidden print:block">
        <h1 className="text-base font-bold text-black">{title}</h1>
        <p className="text-[10px] text-black">
          Generado: {new Date().toLocaleString("es-MX")} · {filtered.shown} de{" "}
          {totalRows} jugadores
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="flex-1 text-[11px] leading-relaxed text-slate-400">
          Jugadores dados de alta en el sistema agrupados por club. La columna{" "}
          <span className="font-semibold text-blue-300">HI</span> muestra el
          handicap index del jugador (se usa para definir categorías). Para
          handicap del torneo (PH), consulta el reporte por torneo.
        </p>
        <PlayersReportToolbar title={title} groups={filtered.groups} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#0f172a] px-2 py-1.5 print:hidden">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Buscar
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, GHIN, club, email, teléfono, HI…"
          className="h-7 min-w-[220px] flex-1 rounded border border-white/10 bg-[#0b1422] px-2 text-[12px] text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
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
        {filtered.groups.map((g) => (
          <section
            key={g.id}
            className="rounded-lg border border-white/10 bg-[#0f172a]"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
              <h2 className="text-[13px] font-bold text-white">{g.label}</h2>
              <span className="text-[10px] text-slate-400">
                {g.rows.length} jugador{g.rows.length === 1 ? "" : "es"}
              </span>
            </header>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12px] text-white">
                <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                    <th
                      className="px-2 py-1.5 text-left w-[96px]"
                      title="GHIN Number"
                    >
                      GHIN
                    </th>
                    <th className="px-2 py-1.5">Nombre</th>
                    <th className="px-2 py-1.5 text-center w-[36px]">Sexo</th>
                    <th className="px-2 py-1.5 text-right w-[56px]">HI</th>
                    <th className="px-2 py-1.5 text-right w-[64px]">
                      Año Nac.
                    </th>
                    <th className="px-2 py-1.5 w-[120px]">Teléfono</th>
                    <th className="px-2 py-1.5">Email</th>
                    <th className="px-2 py-1.5 text-center w-[64px]">
                      T. Playera
                    </th>
                    <th className="px-2 py-1.5 text-center w-[64px]">
                      T. Zapato
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      className="border-t border-white/5 align-middle hover:bg-white/[0.02]"
                    >
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-slate-300">
                        {r.ghin ?? (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5 text-center text-slate-300">
                        {r.gender}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                        {hiFmt(r.hi)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                        {r.birth_year ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-300">
                        {r.phone || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-slate-300">
                        {r.email || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-300">
                        {r.shirt_size || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-300">
                        {r.shoe_size || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {filtered.groups.length === 0 ? (
          <p className="text-[12px] text-amber-200">
            {search
              ? `Sin resultados para "${search}".`
              : "No hay jugadores dados de alta."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
