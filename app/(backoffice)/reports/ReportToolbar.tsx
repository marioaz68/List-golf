"use client";

import { useState, useTransition } from "react";
import {
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  Printer,
} from "lucide-react";
import ExcelExportNameDialog, {
  loadExcelExportMode,
  shouldSkipExcelNameDialog,
} from "@/components/reports/ExcelExportNameDialog";
import {
  resolveExcelFileName,
  uniqueExcelSheetName,
  type ExcelNameMode,
} from "@/lib/reports/excelFileName";
import type {
  HandicapReportCategory,
} from "./HandicapsByCategoryClient";
import { groupRowsIntoPairs } from "./HandicapsByCategoryClient";

type Props = {
  tournamentName: string;
  categories: HandicapReportCategory[];
};

type PendingAction = "excel" | "whatsapp" | "email" | null;

function buildShortMessage(
  tournamentName: string,
  categories: HandicapReportCategory[]
): string {
  const totalRows = categories.reduce((acc, c) => acc + c.rows.length, 0);
  return [
    `Reporte de Handicaps — ${tournamentName}`,
    `${totalRows} inscritos · ${categories.length} categorías`,
    `Generado: ${new Date().toLocaleString("es-MX")}`,
    "",
    "Adjunto el archivo con el detalle.",
  ].join("\n");
}

export default function ReportToolbar({ tournamentName, categories }: Props) {
  const excelBaseTitle = `Handicaps_${tournamentName}`;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

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
      const usedSheetNames = new Set<string>();

      for (const cat of categories) {
        const raw = (cat.code ?? cat.name ?? "Categoria").toString();
        const sheetName = uniqueExcelSheetName(
          raw,
          usedSheetNames,
          "Categoria"
        );
        const ws = wb.addWorksheet(sheetName);
        const hasPairs = cat.rows.some((r) => Boolean(r.pair_id));
        ws.columns = hasPairs
          ? [
              { header: "#", key: "n", width: 4 },
              { header: "Jugador 1", key: "j1", width: 28 },
              { header: "PH J1", key: "ph1", width: 7 },
              { header: "Salida J1", key: "tee1", width: 12 },
              { header: "Jugador 2", key: "j2", width: 28 },
              { header: "PH J2", key: "ph2", width: 7 },
              { header: "Salida J2", key: "tee2", width: 12 },
              { header: "Suma PH", key: "phSum", width: 9 },
            ]
          : [
              { header: "#", key: "n", width: 4 },
              { header: "GHIN", key: "ghin", width: 12 },
              { header: "Nombre", key: "name", width: 32 },
              { header: "PH", key: "ph", width: 6 },
              { header: "Salida", key: "tee", width: 14 },
              { header: "Override", key: "ovr", width: 9 },
            ];
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
        ws.views = [{ state: "frozen", ySplit: 1 }];

        if (hasPairs) {
          const { pairs, singles } = groupRowsIntoPairs(cat.rows);
          pairs.forEach((p, idx) => {
            const sumPh =
              p.pair_ph_sum != null
                ? p.pair_ph_sum
                : p.j1?.ph != null && p.j2?.ph != null
                  ? Number(p.j1.ph) + Number(p.j2.ph)
                  : p.j1?.ph ?? p.j2?.ph ?? null;
            ws.addRow({
              n: idx + 1,
              j1: p.j1?.name ?? "",
              ph1: p.j1?.ph ?? "",
              tee1: p.j1?.tee?.code ?? p.j1?.tee?.name ?? "",
              j2: p.j2?.name ?? "",
              ph2: p.j2?.ph ?? "",
              tee2: p.j2?.tee?.code ?? p.j2?.tee?.name ?? "",
              phSum: sumPh ?? "",
            });
          });
          singles.forEach((r) => {
            ws.addRow({
              n: "",
              j1: r.name,
              ph1: r.ph ?? "",
              tee1: r.tee?.code ?? r.tee?.name ?? "",
              j2: "(sin pareja)",
              ph2: "",
              tee2: "",
              phSum: r.ph ?? "",
            });
          });
        } else {
          cat.rows.forEach((r, idx) => {
            ws.addRow({
              n: idx + 1,
              ghin: r.ghin ?? "",
              name: r.name,
              ph: r.ph,
              tee: r.tee?.code ?? r.tee?.name ?? "",
              ovr: r.is_override ? "Sí" : "",
            });
          });
        }
      }

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

  function runAfterFileName(fileName: string, action: PendingAction) {
    startTransition(async () => {
      const ok = await generateExcel(fileName);
      if (!ok) return;

      if (action === "excel") {
        setNotice(`Archivo descargado: ${fileName}`);
        return;
      }

      const text = buildShortMessage(tournamentName, categories);
      if (action === "whatsapp") {
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setNotice(
          `Archivo: ${fileName} — adjúntalo manualmente en WhatsApp.`
        );
        return;
      }

      if (action === "email") {
        const subject = `Reporte de Handicaps — ${tournamentName}`;
        const url = `mailto:?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(text)}`;
        window.location.href = url;
        setNotice(
          `Archivo: ${fileName} — adjúntalo manualmente en el correo.`
        );
      }
    });
  }

  function startExport(action: PendingAction) {
    setError(null);
    setNotice(null);
    setPendingAction(action);

    if (shouldSkipExcelNameDialog()) {
      const mode = loadExcelExportMode();
      const fileName = resolveExcelFileName(excelBaseTitle, mode);
      runAfterFileName(fileName, action);
      return;
    }

    setNameDialogOpen(true);
  }

  function handleNameConfirm(fileName: string, _mode: ExcelNameMode) {
    setNameDialogOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    runAfterFileName(fileName, action);
  }

  function handleNameCancel() {
    setNameDialogOpen(false);
    setPendingAction(null);
  }

  const btnClass =
    "inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-[#1f2937] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2a3447] disabled:cursor-not-allowed disabled:opacity-60 print:hidden";

  return (
    <>
      <ExcelExportNameDialog
        open={nameDialogOpen}
        baseTitle={excelBaseTitle}
        onCancel={handleNameCancel}
        onConfirm={handleNameConfirm}
      />

      <div className="flex flex-col items-end gap-1 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
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
            onClick={() => startExport("excel")}
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
            onClick={() => startExport("whatsapp")}
            disabled={pending}
            className={btnClass}
            title="Elige nombre del archivo, descarga Excel y abre WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => startExport("email")}
            disabled={pending}
            className={btnClass}
            title="Elige nombre del archivo, descarga Excel y abre correo"
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Email</span>
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
    </>
  );
}
