"use client";

import { useState, useTransition } from "react";
import {
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  Printer,
} from "lucide-react";
import type { HandicapReportCategory } from "./HandicapsByCategoryClient";

type Props = {
  tournamentName: string;
  categories: HandicapReportCategory[];
};

const ROUND = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "" : String(Math.round(Number(n)));
const HI_FMT = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "" : Number(n).toFixed(1);

function safeFileName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function buildTextSummary(
  tournamentName: string,
  categories: HandicapReportCategory[]
): string {
  const lines: string[] = [];
  lines.push(`Reporte de Handicaps — ${tournamentName}`);
  lines.push(`Generado: ${new Date().toLocaleString("es-MX")}`);
  lines.push("");
  for (const cat of categories) {
    const label = cat.code ? `${cat.code} · ${cat.name ?? ""}` : cat.name ?? "—";
    lines.push(`▸ ${label} (${cat.rows.length} inscritos)`);
    cat.rows.forEach((r, i) => {
      const tee = r.tee?.code ?? r.tee?.name ?? "—";
      const ph = ROUND(r.ph) || "—";
      const hc = ROUND(r.ch) || "—";
      const allowance =
        r.allowance_pct != null ? ` (${r.allowance_pct}%)` : "";
      lines.push(
        `  ${i + 1}. ${r.name} · HI ${HI_FMT(r.hi)} · HC ${hc} · PH ${ph}${allowance} · ${tee}`
      );
    });
    lines.push("");
  }
  return lines.join("\n");
}

export default function ReportToolbar({ tournamentName, categories }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalRows = categories.reduce((acc, c) => acc + c.rows.length, 0);

  function handlePrint() {
    setError(null);
    window.print();
  }

  function handleExcel() {
    setError(null);
    startTransition(async () => {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = "Golf Torneo";
        wb.created = new Date();

        for (const cat of categories) {
          const sheetName = (
            cat.code ??
            cat.name ??
            "Categoria"
          )
            .toString()
            .slice(0, 31)
            .replace(/[\\/?*\[\]:]/g, "_");
          const ws = wb.addWorksheet(sheetName || "Categoria");
          ws.columns = [
            { header: "#", key: "n", width: 4 },
            { header: "Nombre", key: "name", width: 32 },
            { header: "Sexo", key: "gender", width: 6 },
            { header: "HI", key: "hi", width: 7 },
            { header: "HC", key: "hc", width: 6 },
            { header: "PH", key: "ph", width: 6 },
            { header: "%", key: "pct", width: 6 },
            { header: "Salida", key: "tee", width: 14 },
            { header: "Override", key: "ovr", width: 9 },
          ];
          ws.getRow(1).font = { bold: true };
          ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
          ws.views = [{ state: "frozen", ySplit: 1 }];

          cat.rows.forEach((r, idx) => {
            ws.addRow({
              n: idx + 1,
              name: r.name,
              gender: r.gender,
              hi: r.hi != null && Number.isFinite(r.hi) ? Number(r.hi) : null,
              hc: r.ch,
              ph: r.ph,
              pct: r.allowance_pct,
              tee: r.tee?.code ?? r.tee?.name ?? "",
              ovr: r.is_override ? "Sí" : "",
            });
          });
        }

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeFileName(`Handicaps_${tournamentName}`)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(
          err instanceof Error
            ? `No se pudo generar Excel: ${err.message}`
            : "No se pudo generar Excel."
        );
      }
    });
  }

  function handleWhatsApp() {
    setError(null);
    const summary = buildTextSummary(tournamentName, categories);
    const text =
      summary.length > 3500
        ? `Reporte de Handicaps — ${tournamentName} (${totalRows} inscritos).\nDescarga el detalle desde el sistema.`
        : summary;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleEmail() {
    setError(null);
    const subject = `Reporte de Handicaps — ${tournamentName}`;
    const body = buildTextSummary(tournamentName, categories);
    const url = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }

  const btnClass =
    "inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-[#1f2937] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2a3447] disabled:cursor-not-allowed disabled:opacity-60 print:hidden";

  return (
    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
      <button
        type="button"
        onClick={handlePrint}
        className={btnClass}
        title="Imprimir reporte"
      >
        <Printer className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Imprimir</span>
      </button>

      <button
        type="button"
        onClick={handlePrint}
        className={btnClass}
        title="Guardar como PDF (usa el diálogo de impresión → Destino: Guardar como PDF)"
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">PDF</span>
      </button>

      <button
        type="button"
        onClick={handleExcel}
        disabled={pending}
        className={btnClass}
        title="Descargar reporte en Excel (.xlsx)"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {pending ? "Generando…" : "Excel"}
        </span>
      </button>

      <button
        type="button"
        onClick={handleWhatsApp}
        className={btnClass}
        title="Compartir resumen por WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">WhatsApp</span>
      </button>

      <button
        type="button"
        onClick={handleEmail}
        className={btnClass}
        title="Enviar resumen por correo"
      >
        <Mail className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Email</span>
      </button>

      {error ? (
        <span
          className="text-[10px] font-semibold text-red-300"
          title={error}
          role="alert"
        >
          !
        </span>
      ) : null}
    </div>
  );
}
