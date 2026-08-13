"use client";

import { useMemo, useState, useTransition } from "react";
import {
  saveCommitteeFlagsBulk,
  suggestCommitteeCandidatesAction,
} from "../adminActions";
import {
  DEFAULT_SUGGEST_THRESHOLDS,
  type ClubIndexHistory,
  type CommitteeSelectionRow,
  type SuggestThresholds,
} from "@/lib/handicap-committee/loadSelectionRows";

type Props = {
  tournamentId: string;
  tournamentName: string;
  initialRows: CommitteeSelectionRow[];
  clubIndexHistory: ClubIndexHistory | null;
};

/** Campos de la tabla: el tipo local obliga a leer las 4 claves del payload. */
type TableRow = {
  entryId: string;
  playerId: string;
  playerName: string;
  ghin: string | null;
  entryHi: number | null;
  currentHi: number | null;
  categoryCode: string | null;
  rounds12m: number | null;
  minHi: number | null;
  deltaHi: number | null;
  indexHistoryNote: string | null;
  suggestReasons: string[];
};

function toTableRow(
  r: CommitteeSelectionRow,
  suggestOverlay?: string[]
): TableRow {
  return {
    entryId: r.entryId,
    playerId: r.playerId,
    playerName: r.playerName,
    ghin: r.ghin,
    entryHi: r.entryHi,
    currentHi: r.currentHi,
    categoryCode: r.categoryCode,
    rounds12m: r.rounds12m,
    minHi: r.minHi,
    deltaHi: r.deltaHi,
    indexHistoryNote: r.indexHistoryNote,
    suggestReasons: suggestOverlay ?? r.suggestReasons,
  };
}

export default function CommitteeSelectionClient({
  tournamentId,
  tournamentName,
  initialRows,
  clubIndexHistory,
}: Props) {
  const [suggestByEntry, setSuggestByEntry] = useState<Record<string, string[]>>(
    {}
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialRows.filter((r) => r.flagged).map((r) => r.entryId))
  );
  const [reasons, setReasons] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of initialRows) {
      if (r.flaggedReason) m[r.entryId] = r.flaggedReason;
    }
    return m;
  });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const [thresholds, setThresholds] = useState<SuggestThresholds>(
    DEFAULT_SUGGEST_THRESHOLDS
  );
  const [bulkReason, setBulkReason] = useState("");

  const tableRows = useMemo(
    () =>
      initialRows.map((r) => toTableRow(r, suggestByEntry[r.entryId])),
    [initialRows, suggestByEntry]
  );

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return tableRows;
    return tableRows.filter((r) => {
      const hay = [
        r.playerName,
        r.ghin,
        r.categoryCode,
        String(r.entryHi ?? ""),
        String(r.currentHi ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(n);
    });
  }, [tableRows, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function markAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(r.entryId);
      return next;
    });
  }

  function unmarkAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.delete(r.entryId);
      return next;
    });
  }

  function invertVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (next.has(r.entryId)) next.delete(r.entryId);
        else next.add(r.entryId);
      }
      return next;
    });
  }

  function applySuggestToSelection() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of tableRows) {
        if (r.suggestReasons.length > 0) next.add(r.entryId);
      }
      return next;
    });
    setMsg(
      `Sugerencia aplicada a la selección (${tableRows.filter((r) => r.suggestReasons.length).length} candidatos). Revisa y guarda.`
    );
  }

  function handleSuggest() {
    setErr("");
    setMsg("");
    startTransition(async () => {
      const res = await suggestCommitteeCandidatesAction({
        rows: initialRows,
        thresholds,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const next: Record<string, string[]> = {};
      for (const r of res.rows) {
        if (r.suggestReasons.length) next[r.entryId] = r.suggestReasons;
      }
      setSuggestByEntry(next);
      setMsg(
        `Sugerencia calculada: ${res.rows.filter((r) => r.suggestReasons.length).length} candidatos. Usa «Aplicar sugeridos a selección» — no se guarda solo.`
      );
    });
  }

  function handleSave() {
    setErr("");
    setMsg("");
    startTransition(async () => {
      const items = tableRows.map((r) => ({
        entryId: r.entryId,
        flagged: selected.has(r.entryId),
        reason:
          reasons[r.entryId]?.trim() ||
          (selected.has(r.entryId) ? bulkReason.trim() : "") ||
          "",
      }));
      const res = await saveCommitteeFlagsBulk({ tournamentId, items });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg(`Guardado: ${res.updated} inscripciones actualizadas.`);
    });
  }

  const selectedCount = selected.size;
  const suggestedCount = tableRows.filter((r) => r.suggestReasons.length > 0)
    .length;

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">
          Selección para comité
        </h1>
        <p className="text-sm text-slate-600">{tournamentName}</p>
        <p className="mt-1 text-xs text-slate-500">
          Marcados: {selectedCount} · Sugeridos (sin guardar): {suggestedCount}
        </p>
      </header>

      {clubIndexHistory ? (
        <div
          role="status"
          className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-snug text-amber-950"
        >
          {clubIndexHistory.message}
        </div>
      ) : null}

      {(msg || err) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            err
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {err || msg}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-700">
            Buscar (no pierde selección)
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, GHIN, categoría…"
              className="mt-0.5 block w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={markAllVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            Marcar todos (filtro)
          </button>
          <button
            type="button"
            onClick={unmarkAllVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            Desmarcar todos (filtro)
          </button>
          <button
            type="button"
            onClick={invertVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            Invertir (filtro)
          </button>
          <label className="text-xs font-semibold text-slate-700">
            Motivo por defecto al marcar
            <input
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Opcional"
              className="mt-0.5 block w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={handleSave}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar selección (lote)"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
        <h2 className="text-sm font-bold text-amber-950">
          Sugerir candidatos (no guarda solo)
        </h2>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <label>
            Δ HI ≥
            <input
              type="number"
              step="0.1"
              value={thresholds.deltaHiMin}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  deltaHiMin: Number(e.target.value),
                }))
              }
              className="ml-1 w-16 rounded border px-1 py-0.5"
            />
          </label>
          <label>
            Pocas rondas ≤
            <input
              type="number"
              value={thresholds.fewRoundsMax}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  fewRoundsMax: Number(e.target.value),
                }))
              }
              className="ml-1 w-16 rounded border px-1 py-0.5"
            />
          </label>
          <label>
            Últimas N
            <input
              type="number"
              value={thresholds.lastNRounds}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  lastNRounds: Number(e.target.value),
                }))
              }
              className="ml-1 w-14 rounded border px-1 py-0.5"
            />
          </label>
          <label>
            Caída diff ≥
            <input
              type="number"
              step="0.1"
              value={thresholds.diffDropMin}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  diffDropMin: Number(e.target.value),
                }))
              }
              className="ml-1 w-16 rounded border px-1 py-0.5"
            />
          </label>
          <label>
            Varianza ≥
            <input
              type="number"
              step="0.1"
              value={thresholds.varianceMin}
              onChange={(e) =>
                setThresholds((t) => ({
                  ...t,
                  varianceMin: Number(e.target.value),
                }))
              }
              className="ml-1 w-16 rounded border px-1 py-0.5"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={handleSuggest}
            className="rounded border border-amber-700 bg-amber-600 px-2.5 py-1 font-bold text-white"
          >
            Calcular sugerencia
          </button>
          <button
            type="button"
            onClick={applySuggestToSelection}
            className="rounded border border-amber-800 bg-white px-2.5 py-1 font-semibold text-amber-950"
          >
            Aplicar sugeridos a selección
          </button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2">✓</th>
              <th className="px-2 py-2">Jugador</th>
              <th className="px-2 py-2" title="HI congelado al inscribirse">
                HI inscripción
              </th>
              <th className="px-2 py-2" title="HI vigente en players">
                HI actual
              </th>
              <th className="px-2 py-2">Cat</th>
              <th className="px-2 py-2">Rondas 12m</th>
              <th
                className="px-2 py-2"
                title="Mínimo de hi_at_play en rondas de 12 meses"
              >
                HI mín
              </th>
              <th
                className="px-2 py-2"
                title="HI actual − HI mín"
              >
                Δ
              </th>
              <th className="px-2 py-2">Motivo / sugerencia</th>
              <th className="px-2 py-2">Reporte</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const on = selected.has(r.entryId);
              const currentHi = r.currentHi;
              const categoryCode = r.categoryCode;
              const rounds12m = r.rounds12m;
              const minHi = r.minHi;
              return (
                <tr
                  key={r.entryId}
                  className={`border-t border-slate-100 ${
                    on ? "bg-indigo-50/50" : ""
                  } ${r.suggestReasons.length ? "outline outline-1 outline-amber-200" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(r.entryId)}
                    />
                  </td>
                  <td className="px-2 py-1.5 font-medium text-slate-900">
                    {r.playerName}
                    {r.ghin ? (
                      <span className="ml-1 font-mono text-[10px] text-slate-500">
                        {r.ghin}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-900 ${
                      asNum(r.entryHi) != null &&
                      asNum(currentHi) != null &&
                      asNum(r.entryHi) !== asNum(currentHi)
                        ? "text-slate-500"
                        : ""
                    }`}
                  >
                    {fmtHi(r.entryHi)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums font-semibold text-slate-900">
                    {fmtHi(currentHi)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-900">
                    {categoryCode ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-900">
                    {fmtInt(rounds12m)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-900">
                    {fmtHi(minHi)}
                  </td>
                  <td
                    className={`px-2 py-1.5 tabular-nums font-semibold ${
                      asNum(r.deltaHi) != null && asNum(r.deltaHi)! > 1
                        ? "text-rose-700"
                        : "text-slate-700"
                    }`}
                  >
                    {fmtDelta(r.deltaHi)}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.indexHistoryNote ? (
                      <div className="mb-1 rounded border border-amber-500 bg-amber-100 px-1.5 py-1 text-[10px] font-semibold leading-snug text-amber-950">
                        {r.indexHistoryNote}
                      </div>
                    ) : null}
                    <input
                      value={reasons[r.entryId] ?? ""}
                      onChange={(e) =>
                        setReasons((m) => ({
                          ...m,
                          [r.entryId]: e.target.value,
                        }))
                      }
                      placeholder="Motivo (opcional)"
                      className="mb-0.5 w-full rounded border border-slate-200 px-1 py-0.5"
                    />
                    {r.suggestReasons.length ? (
                      <ul className="list-inside list-disc text-[10px] text-amber-900">
                        {r.suggestReasons.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.playerId ? (
                      <a
                        href={`/handicap-report/${r.playerId}?tournament_id=${encodeURIComponent(tournamentId)}&return=${encodeURIComponent(`/comite-handicap/seleccion?tournament_id=${tournamentId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-700 underline"
                      >
                        Abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function fmtHi(v: unknown): string {
  const n = asNum(v);
  return n == null ? "—" : n.toFixed(1);
}

function fmtInt(v: unknown): string {
  const n = asNum(v);
  return n == null ? "—" : String(Math.round(n));
}

function fmtDelta(v: unknown): string {
  const n = asNum(v);
  if (n == null) return "—";
  const body = n.toFixed(1);
  return n > 0 ? `+${body}` : body;
}
