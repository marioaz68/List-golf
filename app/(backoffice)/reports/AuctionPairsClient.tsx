"use client";

import { useMemo, useState, useTransition } from "react";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import ExcelExportNameDialog, {
  loadExcelExportMode,
  shouldSkipExcelNameDialog,
} from "@/components/reports/ExcelExportNameDialog";
import {
  resolveExcelFileName,
  type ExcelNameMode,
} from "@/lib/reports/excelFileName";

export type AuctionPairPlayer = {
  entry_id: string | null;
  name: string;
  /** Índice de handicap con el que entró al torneo. */
  hi: number | null;
  /** Handicap de torneo (PH) — el mismo que usa la rifa y el cuadro. */
  ph: number | null;
  is_override: boolean;
  player_number: number | null;
};

export type AuctionPairRow = {
  team_id: string;
  auction_order: number | null;
  seed: number | null;
  auction_bid: number | null;
  category_code: string | null;
  category_name: string | null;
  j1: AuctionPairPlayer | null;
  j2: AuctionPairPlayer | null;
  ph_sum: number | null;
  hi_sum: number | null;
  /** Falta un jugador o falta el PH de alguno: no se puede subastar en firme. */
  incomplete: boolean;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hiFmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function numFmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(n);
}

function moneyFmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function PlayerBlock({
  p,
  slot,
}: {
  p: AuctionPairPlayer | null;
  slot: 1 | 2;
}) {
  if (!p) {
    return (
      <span className="italic text-amber-300 print:text-black">
        sin J{slot}
      </span>
    );
  }
  return (
    <span className="block leading-tight">
      <span className="font-semibold text-white print:text-black">
        {p.name}
      </span>
      {p.player_number != null ? (
        <span className="ml-1 text-[10px] text-slate-500 print:text-black">
          #{p.player_number}
        </span>
      ) : null}
    </span>
  );
}

export default function AuctionPairsClient({
  rows,
  tournamentName,
  bracketSize,
}: {
  rows: AuctionPairRow[];
  tournamentName: string;
  bracketSize: number | null;
}) {
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);

  const excelBaseTitle = `Subasta_Parejas_${tournamentName}`;

  const filtered = useMemo(() => {
    const q = normalize(search).trim();
    if (!q) return rows;
    const tokens = q.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const haystack = normalize(
        [
          r.j1?.name ?? "",
          r.j2?.name ?? "",
          r.category_code ?? "",
          r.category_name ?? "",
          r.auction_order != null ? `#${r.auction_order}` : "",
          hiFmt(r.j1?.hi ?? null),
          hiFmt(r.j2?.hi ?? null),
          numFmt(r.j1?.ph ?? null),
          numFmt(r.j2?.ph ?? null),
          numFmt(r.ph_sum),
        ].join(" ")
      );
      return tokens.every((t) => haystack.includes(t));
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const withPh = rows.filter((r) => r.ph_sum != null);
    const bids = rows
      .map((r) => r.auction_bid)
      .filter((b): b is number => b != null);
    return {
      pairs: rows.length,
      withOrder: rows.filter((r) => r.auction_order != null).length,
      incomplete: rows.filter((r) => r.incomplete).length,
      minPh: withPh.length
        ? Math.min(...withPh.map((r) => r.ph_sum as number))
        : null,
      maxPh: withPh.length
        ? Math.max(...withPh.map((r) => r.ph_sum as number))
        : null,
      bidTotal: bids.length ? bids.reduce((a, b) => a + b, 0) : null,
    };
  }, [rows]);

  function handlePrint() {
    setError(null);
    setNotice(null);
    window.print();
  }

  async function generateExcel(fileName: string): Promise<boolean> {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Golf Torneo";
      wb.created = new Date();
      const ws = wb.addWorksheet("Subasta");

      ws.columns = [
        { header: "#", key: "n", width: 5 },
        { header: "Turno", key: "turno", width: 7 },
        { header: "Jugador 1", key: "j1", width: 30 },
        { header: "HI J1", key: "hi1", width: 7 },
        { header: "PH J1", key: "ph1", width: 7 },
        { header: "Jugador 2", key: "j2", width: 30 },
        { header: "HI J2", key: "hi2", width: 7 },
        { header: "PH J2", key: "ph2", width: 7 },
        { header: "Σ PH", key: "phSum", width: 8 },
        { header: "Σ HI", key: "hiSum", width: 8 },
        { header: "Categoría", key: "cat", width: 16 },
        { header: "Postura", key: "bid", width: 12 },
        { header: "Seed", key: "seed", width: 6 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      ws.views = [{ state: "frozen", ySplit: 1 }];

      filtered.forEach((r, idx) => {
        ws.addRow({
          n: idx + 1,
          turno: r.auction_order ?? "",
          j1: r.j1?.name ?? "",
          hi1: r.j1?.hi ?? "",
          ph1: r.j1?.ph ?? "",
          j2: r.j2?.name ?? "",
          hi2: r.j2?.hi ?? "",
          ph2: r.j2?.ph ?? "",
          phSum: r.ph_sum ?? "",
          hiSum: r.hi_sum ?? "",
          cat: r.category_code ?? r.category_name ?? "",
          bid: r.auction_bid ?? "",
          seed: r.seed ?? "",
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo generar Excel: ${err.message}`
          : "No se pudo generar Excel."
      );
      return false;
    }
  }

  function startExport() {
    setError(null);
    setNotice(null);
    if (shouldSkipExcelNameDialog()) {
      const fileName = resolveExcelFileName(
        excelBaseTitle,
        loadExcelExportMode()
      );
      startTransition(async () => {
        if (await generateExcel(fileName)) {
          setNotice(`Archivo descargado: ${fileName}`);
        }
      });
      return;
    }
    setNameDialogOpen(true);
  }

  function handleNameConfirm(fileName: string, _mode: ExcelNameMode) {
    setNameDialogOpen(false);
    startTransition(async () => {
      if (await generateExcel(fileName)) {
        setNotice(`Archivo descargado: ${fileName}`);
      }
    });
  }

  const btnClass =
    "inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-[#1f2937] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2a3447] disabled:cursor-not-allowed disabled:opacity-60 print:hidden";

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
        Todavía no hay parejas activas en este torneo. Ármalas en{" "}
        <span className="font-semibold">Match play → Parejas</span> y vuelve
        aquí.
      </p>
    );
  }

  return (
    <>
      <ExcelExportNameDialog
        open={nameDialogOpen}
        baseTitle={excelBaseTitle}
        onCancel={() => setNameDialogOpen(false)}
        onConfirm={handleNameConfirm}
      />

      <div className="report-printable space-y-3">
        <div className="hidden print:block">
          <h1 className="text-base font-bold text-black">
            Parejas para subasta — {tournamentName}
          </h1>
          <p className="text-[10px] text-black">
            Generado: {new Date().toLocaleString("es-MX")} · {filtered.length}{" "}
            de {totals.pairs} parejas
            {bracketSize ? ` · cuadro de ${bracketSize}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="flex-1 text-[11px] leading-relaxed text-slate-400">
            <span className="font-semibold text-sky-300">HI</span>: índice de
            handicap.{" "}
            <span className="font-semibold text-emerald-300">PH</span>:
            handicap de torneo (con el que juega).{" "}
            <span className="font-semibold text-emerald-200">Σ PH</span>: suma
            de la pareja. Son exactamente los mismos valores que muestran la
            rifa, la proyección, el cuadro en vivo y las tarjetas impresas.
          </p>

          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrint}
                className={btnClass}
                title="Imprimir hoja de subasta"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className={btnClass}
                title="Guardar como PDF (diálogo de impresión → Guardar como PDF)"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                type="button"
                onClick={startExport}
                disabled={pending}
                className={btnClass}
                title="Descargar en Excel (.xlsx)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {pending ? "Generando…" : "Excel"}
                </span>
              </button>
            </div>
            {error ? (
              <p
                className="max-w-sm text-right text-[10px] font-semibold text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : notice ? (
              <p
                className="max-w-sm text-right text-[10px] text-amber-200"
                role="status"
              >
                {notice}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-[#0f172a] px-3 py-2 text-[11px] text-slate-300 print:hidden">
          <span>
            <span className="font-semibold text-white">{totals.pairs}</span>{" "}
            parejas
          </span>
          <span>
            <span className="font-semibold text-white">{totals.withOrder}</span>{" "}
            con turno rifado
          </span>
          {totals.minPh != null ? (
            <span>
              Σ PH{" "}
              <span className="font-semibold text-emerald-300">
                {totals.minPh}–{totals.maxPh}
              </span>
            </span>
          ) : null}
          {totals.bidTotal != null ? (
            <span>
              Subastado{" "}
              <span className="font-semibold text-emerald-300">
                {moneyFmt(totals.bidTotal)}
              </span>
            </span>
          ) : null}
          {totals.incomplete > 0 ? (
            <span className="font-semibold text-amber-300">
              {totals.incomplete} sin handicap completo
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-[#0f172a] px-2 py-1.5 print:hidden">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Buscar
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre, categoría, turno, PH…"
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
            {filtered.length}/{totals.pairs}
          </span>
        </div>

        <section className="overflow-x-auto rounded-lg border border-white/10 bg-[#0f172a] print:border-0 print:bg-white">
          <table className="min-w-full text-left text-[12px] text-white print:text-black">
            <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300 print:bg-white print:text-black">
              <tr>
                <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                <th
                  className="px-2 py-1.5 text-right w-[52px]"
                  title="Turno rifado en la subasta"
                >
                  Turno
                </th>
                <th className="px-2 py-1.5 text-left">Jugador 1</th>
                <th className="px-2 py-1.5 text-right w-[52px]">HI</th>
                <th className="px-2 py-1.5 text-right w-[46px]">PH</th>
                <th className="px-2 py-1.5 text-left">Jugador 2</th>
                <th className="px-2 py-1.5 text-right w-[52px]">HI</th>
                <th className="px-2 py-1.5 text-right w-[46px]">PH</th>
                <th className="px-2 py-1.5 text-right w-[58px]">Σ PH</th>
                <th className="px-2 py-1.5 text-left w-[92px] print:hidden">
                  Categoría
                </th>
                <th className="px-2 py-1.5 text-right w-[104px]">Postura</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr
                  key={r.team_id}
                  className={`border-t border-white/5 align-middle hover:bg-white/[0.02] print:border-slate-300 ${
                    idx % 2 === 0
                      ? "bg-emerald-500/[0.06]"
                      : "bg-sky-500/[0.06]"
                  } print:bg-white`}
                >
                  <td className="px-2 py-2 text-right tabular-nums text-slate-400 print:text-black">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-amber-200 print:text-black">
                    {r.auction_order != null ? `#${r.auction_order}` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <PlayerBlock p={r.j1} slot={1} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-sky-200 print:text-black">
                    {hiFmt(r.j1?.hi ?? null)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums font-bold print:text-black ${
                      r.j1?.is_override ? "text-amber-300" : "text-emerald-300"
                    }`}
                    title={
                      r.j1?.is_override
                        ? "PH con override del comité de handicap"
                        : "Handicap de torneo"
                    }
                  >
                    {numFmt(r.j1?.ph ?? null)}
                  </td>
                  <td className="px-2 py-2">
                    <PlayerBlock p={r.j2} slot={2} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-sky-200 print:text-black">
                    {hiFmt(r.j2?.hi ?? null)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums font-bold print:text-black ${
                      r.j2?.is_override ? "text-amber-300" : "text-emerald-300"
                    }`}
                    title={
                      r.j2?.is_override
                        ? "PH con override del comité de handicap"
                        : "Handicap de torneo"
                    }
                  >
                    {numFmt(r.j2?.ph ?? null)}
                  </td>
                  <td
                    className="px-2 py-2 text-right tabular-nums text-[14px] font-bold text-emerald-200 print:text-black"
                    title="PH J1 + PH J2"
                  >
                    {numFmt(r.ph_sum)}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-slate-400 print:hidden">
                    {r.category_code ?? r.category_name ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-200 print:text-black">
                    {moneyFmt(r.auction_bid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
