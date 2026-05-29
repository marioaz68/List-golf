"use client";

import { useState, useTransition } from "react";
import {
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  Printer,
} from "lucide-react";
import type { PlayersReportGroup } from "./PlayersReportClient";

type Props = {
  title: string;
  groups: PlayersReportGroup[];
};

function safeFileName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function buildShortMessage(title: string, groups: PlayersReportGroup[]): string {
  const total = groups.reduce((acc, g) => acc + g.rows.length, 0);
  return [
    `${title}`,
    `${total} jugadores · ${groups.length} club(es)`,
    `Generado: ${new Date().toLocaleString("es-MX")}`,
    "",
    "Adjunto el archivo con el detalle.",
  ].join("\n");
}

export default function PlayersReportToolbar({ title, groups }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handlePrint() {
    setError(null);
    setNotice(null);
    window.print();
  }

  async function generateExcel(): Promise<string | null> {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Golf Torneo";
      wb.created = new Date();

      for (const g of groups) {
        const sheetName = (g.label || "Club")
          .toString()
          .slice(0, 31)
          .replace(/[\\/?*\[\]:]/g, "_");
        const ws = wb.addWorksheet(sheetName || "Club");
        ws.columns = [
          { header: "#", key: "n", width: 4 },
          { header: "GHIN", key: "ghin", width: 12 },
          { header: "Nombre", key: "name", width: 32 },
          { header: "Sexo", key: "gender", width: 6 },
          { header: "HI", key: "hi", width: 7 },
          { header: "Año Nac.", key: "birth", width: 9 },
          { header: "Teléfono", key: "phone", width: 14 },
          { header: "Email", key: "email", width: 28 },
          { header: "Talla Playera", key: "shirt", width: 11 },
          { header: "Talla Zapatos", key: "shoe", width: 11 },
        ];
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
        ws.views = [{ state: "frozen", ySplit: 1 }];

        g.rows.forEach((r, idx) => {
          ws.addRow({
            n: idx + 1,
            ghin: r.ghin ?? "",
            name: r.name,
            gender: r.gender,
            hi:
              r.hi != null && Number.isFinite(r.hi) ? Number(r.hi) : null,
            birth: r.birth_year ?? "",
            phone: r.phone ?? "",
            email: r.email ?? "",
            shirt: r.shirt_size ?? "",
            shoe: r.shoe_size ?? "",
          });
        });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const fileName = `${safeFileName(title)}.xlsx`;
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return fileName;
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo generar Excel: ${err.message}`
          : "No se pudo generar Excel."
      );
      return null;
    }
  }

  function handleExcel() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fileName = await generateExcel();
      if (fileName) setNotice(`Excel descargado: ${fileName}`);
    });
  }

  function handleWhatsApp() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fileName = await generateExcel();
      if (!fileName) return;
      const text = buildShortMessage(title, groups);
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      setNotice(
        `Excel descargado (${fileName}). Adjúntalo manualmente en WhatsApp.`
      );
    });
  }

  function handleEmail() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fileName = await generateExcel();
      if (!fileName) return;
      const subject = title;
      const body = buildShortMessage(title, groups);
      const url = `mailto:?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      setNotice(
        `Excel descargado (${fileName}). Adjúntalo manualmente en el correo.`
      );
    });
  }

  const btnClass =
    "inline-flex h-8 items-center gap-1.5 rounded border border-white/15 bg-[#1f2937] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2a3447] disabled:cursor-not-allowed disabled:opacity-60 print:hidden";

  return (
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
          disabled={pending}
          className={btnClass}
          title="Descarga el Excel y abre WhatsApp. Adjunta el archivo manualmente."
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={handleEmail}
          disabled={pending}
          className={btnClass}
          title="Descarga el Excel y abre tu cliente de correo. Adjunta el archivo manualmente."
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Email</span>
        </button>
      </div>

      {error ? (
        <p
          className="max-w-xs text-right text-[10px] font-semibold text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : notice ? (
        <p
          className="max-w-xs text-right text-[10px] text-amber-200"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
