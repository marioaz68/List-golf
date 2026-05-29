"use client";

import { useEffect, useState } from "react";
import {
  excelTimestampSuffix,
  resolveExcelFileName,
  safeExcelBaseName,
  type ExcelNameMode,
} from "@/lib/reports/excelFileName";

type Props = {
  open: boolean;
  baseTitle: string;
  onCancel: () => void;
  onConfirm: (fileName: string, mode: ExcelNameMode) => void;
};

const MODE_STORAGE = "excel_export_name_mode";
const SKIP_DIALOG_STORAGE = "excel_export_skip_dialog";

export function loadExcelExportMode(): ExcelNameMode {
  if (typeof localStorage === "undefined") return "unique_seq";
  const v = localStorage.getItem(MODE_STORAGE);
  if (v === "fixed" || v === "timestamp" || v === "unique_seq") return v;
  return "unique_seq";
}

export function shouldSkipExcelNameDialog(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SKIP_DIALOG_STORAGE) === "1";
}

export default function ExcelExportNameDialog({
  open,
  baseTitle,
  onCancel,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<ExcelNameMode>("unique_seq");
  const [remember, setRemember] = useState(false);
  const base = safeExcelBaseName(baseTitle);
  const fixedName = `${base}.xlsx`;

  useEffect(() => {
    if (open) {
      setMode(loadExcelExportMode());
      setRemember(shouldSkipExcelNameDialog());
    }
  }, [open]);

  const previewName =
    mode === "fixed"
      ? fixedName
      : mode === "timestamp"
        ? `${base}_${excelTimestampSuffix()}.xlsx`
        : `${base}_2.xlsx (ej. _3, _4 en siguientes descargas)`;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-export-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#0f172a] p-4 shadow-xl">
        <h2
          id="excel-export-dialog-title"
          className="text-[14px] font-bold text-white"
        >
          Nombre del archivo Excel
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Si ya descargaste este reporte, el navegador puede avisar que el
          archivo existe. Elige cómo nombrar la nueva descarga:
        </p>

        <p className="mt-3 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          <span className="font-semibold text-amber-200">Nombre base:</span>{" "}
          <span className="font-mono break-all">{fixedName}</span>
        </p>

        <fieldset className="mt-3 space-y-2">
          <label className="flex cursor-pointer gap-2 rounded border border-white/10 bg-[#0b1422] px-2 py-2 hover:border-emerald-400/40">
            <input
              type="radio"
              name="excel_name_mode"
              checked={mode === "unique_seq"}
              onChange={() => setMode("unique_seq")}
              className="mt-0.5"
            />
            <span className="text-[11px] text-slate-200">
              <span className="font-semibold text-emerald-300">
                Número al final (recomendado)
              </span>
              <br />
              <span className="text-slate-400">
                {base}_2.xlsx, luego _3, _4… cada vez que pides el mismo
                reporte.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-2 rounded border border-white/10 bg-[#0b1422] px-2 py-2 hover:border-emerald-400/40">
            <input
              type="radio"
              name="excel_name_mode"
              checked={mode === "timestamp"}
              onChange={() => setMode("timestamp")}
              className="mt-0.5"
            />
            <span className="text-[11px] text-slate-200">
              <span className="font-semibold text-blue-300">
                Fecha y hora en el nombre
              </span>
              <br />
              <span className="text-slate-400">
                Ej. {base}_{excelTimestampSuffix()}.xlsx
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-2 rounded border border-white/10 bg-[#0b1422] px-2 py-2 hover:border-amber-400/40">
            <input
              type="radio"
              name="excel_name_mode"
              checked={mode === "fixed"}
              onChange={() => setMode("fixed")}
              className="mt-0.5"
            />
            <span className="text-[11px] text-slate-200">
              <span className="font-semibold text-amber-300">
                Mismo nombre (reemplazar)
              </span>
              <br />
              <span className="text-slate-400">
                Siempre <span className="font-mono">{fixedName}</span>. El
                sistema puede pedirte sobrescribir el archivo en Descargas.
              </span>
            </span>
          </label>
        </fieldset>

        <p className="mt-3 text-[10px] text-slate-500">
          Vista previa:{" "}
          <span className="font-mono text-slate-300">{previewName}</span>
        </p>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Recordar esta opción (no volver a preguntar)
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(MODE_STORAGE, mode);
              localStorage.setItem(
                SKIP_DIALOG_STORAGE,
                remember ? "1" : "0"
              );
              const fileName = resolveExcelFileName(baseTitle, mode);
              onConfirm(fileName, mode);
            }}
            className="rounded border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30"
          >
            Descargar
          </button>
        </div>
      </div>
    </div>
  );
}
