"use client";

import { useRef, useState, useTransition } from "react";
import {
  applyGhinHoleByHoleUpload,
  dryRunGhinHoleByHoleUpload,
  type GhinDryRunActionResult,
} from "../adminActions";

type DryOk = Extract<GhinDryRunActionResult, { ok: true }>;

export default function GhinDatosUploadClient() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [gender, setGender] = useState<"M" | "F">("M");
  const [exportCutoff, setExportCutoff] = useState("");
  const [dry, setDry] = useState<DryOk | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDryRun() {
    setErr("");
    setMsg("");
    setDry(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("Selecciona un archivo .xlsx");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("gender", gender);
    if (exportCutoff.trim()) fd.set("export_cutoff", exportCutoff.trim());

    startTransition(async () => {
      const res = await dryRunGhinHoleByHoleUpload(fd);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDry(res);
      setMsg(
        `Dry-run OK: ${res.neu} nuevas · ${res.exact} ya existían · ${res.dateConflict} conflictos de fecha. Revisa y confirma antes de insertar.`
      );
    });
  }

  function handleApply() {
    setErr("");
    setMsg("");
    if (!dry) {
      setErr("Primero ejecuta la validación en seco.");
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("Vuelve a seleccionar el mismo archivo .xlsx");
      return;
    }
    if (
      !window.confirm(
        `¿Insertar ${dry.neu} filas nuevas?\n` +
          `Se omitirán ${dry.exact} exactas y ${dry.dateConflict} conflictos de fecha.\n` +
          `Los conflictos NO se insertan (protección contra fechas volteadas).`
      )
    ) {
      setMsg("Inserción cancelada — no se escribió nada.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("gender", gender);
    fd.set("dry_run_log_id", dry.logId);
    fd.set("confirm", "true");

    startTransition(async () => {
      const res = await applyGhinHoleByHoleUpload(fd);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg(
        `Carga aplicada: ${res.inserted} insertadas · ${res.skipped} omitidas · ${res.dateConflict} conflictos sin tocar. Log ${res.logId}`
      );
      setDry(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">
        Subir Hole by Hole (.xlsx)
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Validación en seco obligatoria. Los conflictos ghin+tee+score con fecha
        distinta no se insertan (riesgo de volteo día/mes en Chrome).
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="text-xs font-semibold">
          Archivo
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="mt-0.5 block text-xs"
          />
        </label>
        <label className="text-xs font-semibold">
          Género del export
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "M" | "F")}
            className="mt-0.5 block rounded border px-2 py-1"
          >
            <option value="M">Hombres (M)</option>
            <option value="F">Damas (F)</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Corte del export (opcional)
          <input
            type="date"
            value={exportCutoff}
            onChange={(e) => setExportCutoff(e.target.value)}
            className="mt-0.5 block rounded border px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={handleDryRun}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? "Procesando…" : "1. Validar en seco"}
        </button>
        <button
          type="button"
          disabled={pending || !dry || dry.neu === 0}
          onClick={handleApply}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          2. Confirmar e insertar nuevas
        </button>
      </div>

      {(msg || err) && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            err
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {err || msg}
        </div>
      )}

      {dry ? (
        <div className="mt-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="En archivo" value={String(dry.exact + dry.neu + dry.dateConflict)} />
            <Stat label="Exactas (skip)" value={String(dry.exact)} />
            <Stat label="Nuevas" value={String(dry.neu)} tone="ok" />
            <Stat
              label="Conflicto fecha"
              value={String(dry.dateConflict)}
              tone={dry.dateConflict ? "bad" : undefined}
            />
          </div>
          <p className="text-slate-600">
            Rango {dry.dateMin ?? "—"} → {dry.dateMax ?? "—"}
            {dry.ambiguousDates
              ? ` · ${dry.ambiguousDates} fechas ambiguas (día y mes ≤ 12)`
              : ""}
          </p>
          {dry.warnings.length ? (
            <ul className="list-inside list-disc text-amber-900">
              {dry.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {dry.sanity.notes.length ? (
            <ul className="list-inside list-disc text-rose-800">
              {dry.sanity.notes.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="text-emerald-800">Chequeo de cordura: sin alertas fuertes.</p>
          )}
          {dry.sampleDateConflict.length ? (
            <div>
              <p className="font-semibold text-rose-900">
                Muestra conflictos de fecha (no se insertarán):
              </p>
              <ul className="mt-1 max-h-40 overflow-auto font-mono text-[10px]">
                {dry.sampleDateConflict.map((r, i) => (
                  <li key={i}>
                    {r.ghin_number} {r.golfer_name} archivo={r.date_played}{" "}
                    BD={r.existingDate} {r.tee_name} {r.total_score}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        tone === "ok"
          ? "border-emerald-300 bg-emerald-50"
          : tone === "bad"
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
