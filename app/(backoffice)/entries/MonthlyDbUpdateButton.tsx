"use client";

import { useEffect, useState } from "react";
import {
  MONTHLY_DB_CHECKLIST,
  MONTHLY_DB_CLAUDE_MESSAGE,
  MONTHLY_DB_COMMON_ERRORS,
  MONTHLY_DB_FILES,
  MONTHLY_DB_UPDATE_QUICK_STEPS,
  MONTHLY_DB_UPDATE_SUMMARY,
  MONTHLY_DB_UPDATE_TITLE,
} from "@/lib/handicap-committee/monthlyDbUpdateGuide";

export default function MonthlyDbUpdateButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Instructivo informativo: cómo refrescar los archivos GHIN una vez al mes para que los reportes salgan con data actualizada."
        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-amber-700 bg-amber-100 px-2.5 text-[11px] font-bold text-amber-900 shadow-sm hover:bg-amber-200"
      >
        <span aria-hidden>📅</span>
        Actualización mensual DB
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-6"
          role="dialog"
          aria-modal
          aria-labelledby="monthly-db-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto w-full max-w-3xl rounded-lg border border-amber-300 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-lg border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="min-w-0">
                <h2
                  id="monthly-db-title"
                  className="text-sm font-bold text-amber-950 sm:text-base"
                >
                  📅 {MONTHLY_DB_UPDATE_TITLE}
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-900">
                  {MONTHLY_DB_UPDATE_SUMMARY}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded border border-amber-700 bg-white px-2 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                aria-label="Cerrar"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="space-y-4 px-4 py-3 text-[12px] leading-snug text-slate-900">
              <section>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  ⚡ TL;DR — 6 pasos
                </h3>
                <ol className="ml-4 list-decimal space-y-0.5">
                  {MONTHLY_DB_UPDATE_QUICK_STEPS.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  📋 Archivos a actualizar ({MONTHLY_DB_FILES.length})
                </h3>
                <div className="space-y-2">
                  {MONTHLY_DB_FILES.map((f) => (
                    <details
                      key={f.order}
                      className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5 [&_summary]:cursor-pointer"
                    >
                      <summary className="text-[12px] font-semibold text-slate-900">
                        <span className="mr-1 inline-block min-w-[1.25rem] text-slate-500">
                          {f.order}.
                        </span>
                        {f.title}
                      </summary>
                      <div className="mt-1.5 space-y-1 text-[11px] text-slate-800">
                        <p>
                          <span className="font-semibold text-slate-700">
                            Archivo:
                          </span>{" "}
                          <code className="rounded bg-slate-200 px-1 py-0.5 text-[10px]">
                            {f.filename}
                          </code>
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">
                            Destino:
                          </span>{" "}
                          <code className="rounded bg-slate-200 px-1 py-0.5 text-[10px]">
                            {f.destination}
                          </code>
                        </p>
                        <ul className="ml-4 list-disc space-y-0.5">
                          {f.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  ✅ Checklist mensual
                </h3>
                <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-slate-800">
                  {MONTHLY_DB_CHECKLIST.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                  ⚠ Errores comunes
                </h3>
                <div className="space-y-2">
                  {MONTHLY_DB_COMMON_ERRORS.map((e) => (
                    <div
                      key={e.title}
                      className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-950"
                    >
                      <p className="font-semibold">{e.title}</p>
                      <p>
                        <span className="font-semibold">Síntoma:</span>{" "}
                        {e.symptom}
                      </p>
                      <p>
                        <span className="font-semibold">Causa:</span> {e.cause}
                      </p>
                      <p>
                        <span className="font-semibold">Solución:</span> {e.fix}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                  📞 Mensaje para Claude cuando termines
                </h3>
                <pre className="overflow-x-auto rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-950">
                  {MONTHLY_DB_CLAUDE_MESSAGE}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(MONTHLY_DB_CLAUDE_MESSAGE)
                      .catch(() => {});
                  }}
                  className="mt-1 inline-flex h-7 items-center justify-center rounded border border-emerald-700 bg-emerald-600 px-2 text-[11px] font-bold text-white hover:bg-emerald-700"
                >
                  Copiar mensaje para Claude
                </button>
              </section>

              <p className="text-[10px] italic text-slate-500">
                Fuente: vault de Obsidian / Handicaps CCQ /{" "}
                <code>10 - Actualización mensual de la base de datos.md</code>.
                Edita ese documento y luego{" "}
                <code>lib/handicap-committee/monthlyDbUpdateGuide.ts</code> si
                quieres reflejar cambios aquí.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
