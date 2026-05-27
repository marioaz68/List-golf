"use client";

import { useRef, useState, useTransition } from "react";
import {
  bulkUploadPlayerHandicapFiles,
  type BulkUploadRow,
} from "./actions";
import { PLAYER_FILE_ACCEPT } from "@/lib/player-files/ghinFromFilename";

function statusLabel(row: BulkUploadRow) {
  switch (row.status) {
    case "uploaded":
      return "✓ Subido";
    case "no_ghin":
      return "Sin GHIN en nombre";
    case "not_found":
      return "Jugador no encontrado";
    case "duplicate_ghin":
      return "GHIN duplicado";
    case "error":
      return "Error";
    default:
      return row.status;
  }
}

function statusClass(row: BulkUploadRow) {
  switch (row.status) {
    case "uploaded":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "not_found":
    case "no_ghin":
      return "border-amber-300 bg-amber-50 text-amber-950";
    case "duplicate_ghin":
    case "error":
      return "border-rose-300 bg-rose-50 text-rose-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

export default function HandicapFilesBulkUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<BulkUploadRow[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input?.files?.length) {
      setError("Selecciona uno o más archivos (.html con el GHIN como nombre)");
      return;
    }

    const fd = new FormData();
    for (const f of Array.from(input.files)) {
      fd.append("files", f);
    }

    setError(null);
    setSummary(null);
    startTransition(async () => {
      const res = await bulkUploadPlayerHandicapFiles(fd);
      if (!res.ok && res.error && res.rows.length === 0) {
        setError(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows);
      setSummary(
        `Listo: ${res.uploaded} subidos, ${res.failed} con problema` +
          (res.error ? ` · ${res.error}` : "")
      );
      input.value = "";
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-950">
          Carga masiva por GHIN
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Nombra cada archivo con el número GHIN del jugador, por ejemplo{" "}
          <code className="rounded bg-slate-100 px-1">1113456.html</code>.
          Puedes subir hasta 50 archivos de una vez; el sistema los asocia al
          jugador automáticamente.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          accept={PLAYER_FILE_ACCEPT}
          className="block w-full text-sm text-slate-800 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Subiendo…" : "Subir y asociar por GHIN"}
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {summary}
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="px-2 py-1.5">Archivo</th>
                <th className="px-2 py-1.5">GHIN</th>
                <th className="px-2 py-1.5">Jugador</th>
                <th className="px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.file_name}-${i}`} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-mono text-[11px]">
                    {row.file_name}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{row.ghin ?? "—"}</td>
                  <td className="px-2 py-1.5">{row.player_name ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={[
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        statusClass(row),
                      ].join(" ")}
                      title={row.message}
                    >
                      {statusLabel(row)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
