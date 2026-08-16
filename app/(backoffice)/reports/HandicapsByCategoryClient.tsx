"use client";

import { useMemo, useState } from "react";
import ReportToolbar from "./ReportToolbar";

export type HandicapReportRow = {
  entry_id: string;
  name: string;
  ghin?: string | null;
  gender: string;
  hi: number;
  hi_effective: number | null;
  hi_cap_source: "rule_max" | "rule_min" | null;
  ch: number | null;
  ph: number | null;
  is_override: boolean;
  allowance_pct: number | null;
  tee: { code: string | null; name: string | null; color: string | null } | null;
  /** Match play parejas: id del equipo (para agrupar). */
  pair_id?: string | null;
  /** 1 = jugador A, 2 = jugador B. */
  pair_slot?: 1 | 2 | null;
  /** Etiqueta corta de la pareja (nombres o team_name). */
  pair_label?: string | null;
  /** HI combinado del equipo (referencia). */
  pair_combined_hi?: number | null;
  /** Suma de PH (handicap de torneo) de J1+J2 — orden de parejas. */
  pair_ph_sum?: number | null;
};

export type HandicapReportCategory = {
  id: string;
  code: string | null;
  name: string | null;
  rows: HandicapReportRow[];
};

export type HandicapPairRow = {
  pair_id: string;
  pair_label: string | null;
  pair_ph_sum: number | null;
  j1: HandicapReportRow | null;
  j2: HandicapReportRow | null;
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

/** Agrupa filas individuales en una fila por pareja (J1 + J2). */
export function groupRowsIntoPairs(rows: HandicapReportRow[]): {
  pairs: HandicapPairRow[];
  singles: HandicapReportRow[];
} {
  const byPair = new Map<string, HandicapReportRow[]>();
  const singles: HandicapReportRow[] = [];
  for (const r of rows) {
    if (!r.pair_id) {
      singles.push(r);
      continue;
    }
    const bag = byPair.get(r.pair_id) ?? [];
    bag.push(r);
    byPair.set(r.pair_id, bag);
  }
  const pairs: HandicapPairRow[] = [];
  for (const [pairId, members] of byPair) {
    const j1 =
      members.find((m) => m.pair_slot === 1) ??
      members[0] ??
      null;
    const j2 =
      members.find((m) => m.pair_slot === 2) ??
      members.find((m) => m.entry_id !== j1?.entry_id) ??
      null;
    pairs.push({
      pair_id: pairId,
      pair_label: j1?.pair_label ?? j2?.pair_label ?? null,
      pair_ph_sum: j1?.pair_ph_sum ?? j2?.pair_ph_sum ?? null,
      j1,
      j2,
    });
  }
  // Mantener orden de aparición (ya viene ordenado por Σ PH).
  const order = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.pair_id && !order.has(r.pair_id)) order.set(r.pair_id, i);
  });
  pairs.sort(
    (a, b) => (order.get(a.pair_id) ?? 0) - (order.get(b.pair_id) ?? 0)
  );
  return { pairs, singles };
}

function TeeBadge({
  tee,
}: {
  tee: HandicapReportRow["tee"];
}) {
  if (!tee) {
    return <span className="text-[10px] text-slate-500">sin regla</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold"
      title={`${tee.name ?? ""} (${tee.code ?? ""})`}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full border border-white/30"
        style={{
          backgroundColor:
            tee.color && tee.color.trim().length > 0 ? tee.color : "#888888",
        }}
      />
      <span className="text-white">{tee.code ?? tee.name ?? "—"}</span>
    </span>
  );
}

function PhCell({ row }: { row: HandicapReportRow | null }) {
  if (!row) {
    return <span className="text-slate-500">—</span>;
  }
  return (
    <span
      className={`tabular-nums text-[13px] font-bold ${
        row.is_override ? "text-amber-300" : "text-emerald-300"
      }`}
      title={
        row.is_override
          ? "Override manual desde panel de match play"
          : "Handicap del torneo (PH)"
      }
    >
      {numFmt(row.ph)}
      {row.is_override ? (
        <span className="ml-1 text-[8px] uppercase font-semibold">ovr</span>
      ) : null}
    </span>
  );
}

function PlayerCell({ row, slot }: { row: HandicapReportRow | null; slot: 1 | 2 }) {
  if (!row) {
    return (
      <span className="italic text-slate-500">
        sin J{slot}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-col leading-tight">
      <span className="font-medium text-white">{row.name}</span>
      {row.ghin ? (
        <span className="font-mono text-[10px] tabular-nums text-slate-400">
          GHIN {row.ghin}
        </span>
      ) : null}
    </span>
  );
}

export default function HandicapsByCategoryClient({
  categories,
  tournamentName = "Torneo",
}: {
  categories: HandicapReportCategory[];
  tournamentName?: string;
}) {
  const [search, setSearch] = useState("");

  const totalPlayers = useMemo(
    () => categories.reduce((acc, c) => acc + c.rows.length, 0),
    [categories]
  );

  const isPairsReport = useMemo(
    () => categories.some((c) => c.rows.some((r) => Boolean(r.pair_id))),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) {
      return { cats: categories, shownPlayers: totalPlayers };
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    let shownPlayers = 0;
    const cats = categories
      .map((cat) => {
        const rows = cat.rows.filter((r) => {
          const haystack = normalize(
            [
              r.name,
              r.ghin ?? "",
              r.gender,
              r.tee?.code ?? "",
              r.tee?.name ?? "",
              r.tee?.color ?? "",
              r.pair_label ?? "",
              r.pair_slot != null ? `j${r.pair_slot}` : "",
              hiFmt(r.hi),
              numFmt(r.ch),
              numFmt(r.ph),
            ].join(" ")
          );
          return tokens.every((t) => haystack.includes(t));
        });
        // Si un miembro de la pareja coincide, incluir a ambos de esa pareja.
        if (isPairsReport) {
          const keepPairIds = new Set(
            rows.filter((r) => r.pair_id).map((r) => r.pair_id as string)
          );
          const withPartners = cat.rows.filter(
            (r) =>
              rows.some((x) => x.entry_id === r.entry_id) ||
              (r.pair_id != null && keepPairIds.has(r.pair_id))
          );
          shownPlayers += withPartners.length;
          return { ...cat, rows: withPartners };
        }
        shownPlayers += rows.length;
        return { ...cat, rows };
      })
      .filter((c) => c.rows.length > 0);
    return { cats, shownPlayers };
  }, [categories, search, totalPlayers, isPairsReport]);

  return (
    <div className="report-printable space-y-3">
      <div className="hidden print:block">
        <h1 className="text-base font-bold text-black">
          Reporte de Handicaps — {tournamentName}
        </h1>
        <p className="text-[10px] text-black">
          Generado: {new Date().toLocaleString("es-MX")} ·{" "}
          {filtered.shownPlayers} de {totalPlayers} inscritos
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="flex-1 text-[11px] leading-relaxed text-slate-400">
          <span className="font-semibold text-emerald-300">PH</span>: handicap
          del torneo (con el que juega).{" "}
          <span className="font-semibold text-slate-200">Salida</span>: tee
          asignado.
          {isPairsReport ? (
            <>
              {" "}
              Una fila por pareja con{" "}
              <span className="font-semibold text-emerald-200">
                J1 y J2
              </span>{" "}
              (PH y salida de cada uno). Orden: menor a mayor Σ PH.
            </>
          ) : null}
        </p>
        <ReportToolbar
          tournamentName={tournamentName}
          categories={filtered.cats}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#0f172a] px-2 py-1.5 print:hidden">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Buscar
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, GHIN, PH, salida…"
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
          {filtered.shownPlayers}/{totalPlayers}
        </span>
      </div>

      <div className="space-y-3">
        {filtered.cats.map((cat) => {
          const label = cat.code
            ? `${cat.code} · ${cat.name ?? ""}`
            : cat.name ?? "—";
          const { pairs, singles } = isPairsReport
            ? groupRowsIntoPairs(cat.rows)
            : { pairs: [] as HandicapPairRow[], singles: cat.rows };

          return (
            <section
              key={cat.id}
              className="rounded-lg border border-white/10 bg-[#0f172a]"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
                <h2 className="text-[13px] font-bold text-white">{label}</h2>
                <span className="text-[10px] text-slate-400">
                  {cat.rows.length} inscrit{cat.rows.length === 1 ? "o" : "os"}
                  {isPairsReport
                    ? ` · ${pairs.length} pareja${pairs.length === 1 ? "" : "s"}`
                    : ""}
                </span>
              </header>

              <div className="overflow-x-auto">
                {isPairsReport ? (
                  <table className="min-w-full text-left text-[12px] text-white">
                    <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
                      <tr>
                        <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                        <th className="px-2 py-1.5">Jugador 1</th>
                        <th
                          className="px-2 py-1.5 text-right w-[56px]"
                          title="Handicap del torneo J1"
                        >
                          PH
                        </th>
                        <th className="px-2 py-1.5">Salida</th>
                        <th className="px-2 py-1.5">Jugador 2</th>
                        <th
                          className="px-2 py-1.5 text-right w-[56px]"
                          title="Handicap del torneo J2"
                        >
                          PH
                        </th>
                        <th className="px-2 py-1.5">Salida</th>
                          <th
                          className="px-2 py-1.5 text-right w-[64px]"
                          title="Suma de handicaps de torneo (PH J1 + PH J2)"
                        >
                          Suma PH
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((p, idx) => {
                        const sumPh =
                          p.pair_ph_sum != null
                            ? p.pair_ph_sum
                            : p.j1?.ph != null && p.j2?.ph != null
                              ? Number(p.j1.ph) + Number(p.j2.ph)
                              : p.j1?.ph ?? p.j2?.ph ?? null;
                        return (
                        <tr
                          key={p.pair_id}
                          className={`border-t border-white/5 align-middle hover:bg-white/[0.02] ${
                            idx % 2 === 0
                              ? "bg-emerald-500/[0.06]"
                              : "bg-sky-500/[0.06]"
                          }`}
                        >
                          <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="px-2 py-2">
                            <PlayerCell row={p.j1} slot={1} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <PhCell row={p.j1} />
                          </td>
                          <td className="px-2 py-2">
                            <TeeBadge tee={p.j1?.tee ?? null} />
                          </td>
                          <td className="px-2 py-2">
                            <PlayerCell row={p.j2} slot={2} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <PhCell row={p.j2} />
                          </td>
                          <td className="px-2 py-2">
                            <TeeBadge tee={p.j2?.tee ?? null} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className="tabular-nums text-[14px] font-bold text-emerald-200"
                              title="PH J1 + PH J2"
                            >
                              {numFmt(sumPh)}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                      {singles.map((r) => (
                        <tr
                          key={r.entry_id}
                          className="border-t border-white/5 align-middle bg-amber-500/[0.06]"
                        >
                          <td className="px-2 py-2 text-right text-slate-500">
                            —
                          </td>
                          <td className="px-2 py-2">
                            <PlayerCell row={r} slot={1} />
                            <span className="mt-0.5 block text-[10px] text-amber-300">
                              sin pareja
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <PhCell row={r} />
                          </td>
                          <td className="px-2 py-2">
                            <TeeBadge tee={r.tee} />
                          </td>
                          <td className="px-2 py-2 text-slate-500">—</td>
                          <td className="px-2 py-2 text-right text-slate-500">
                            —
                          </td>
                          <td className="px-2 py-2 text-slate-500">—</td>
                          <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-200">
                            {numFmt(r.ph)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full text-left text-[12px] text-white">
                    <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
                      <tr>
                        <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                        <th
                          className="px-2 py-1.5 text-left w-[88px]"
                          title="GHIN Number del jugador"
                        >
                          GHIN
                        </th>
                        <th className="px-2 py-1.5">Nombre</th>
                        <th
                          className="px-2 py-1.5 text-right w-[72px]"
                          title="Playing Handicap — handicap del torneo"
                        >
                          PH
                        </th>
                        <th className="px-2 py-1.5">Salida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {singles.map((r, idx) => (
                        <tr
                          key={r.entry_id}
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
                          <td className="px-2 py-1.5 text-right">
                            <PhCell row={r} />
                          </td>
                          <td className="px-2 py-1.5">
                            <TeeBadge tee={r.tee} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
