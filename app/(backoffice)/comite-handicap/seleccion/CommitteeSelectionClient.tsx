"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  saveCommitteeFlagsBulk,
  suggestCommitteeCandidatesAction,
  type BulkFlagItem,
} from "../adminActions";
import {
  DEFAULT_SUGGEST_THRESHOLDS,
  type ClubIndexHistory,
  type CommitteeSelectionRow,
  type SuggestThresholds,
} from "@/lib/handicap-committee/loadSelectionRows";
import type { OfficialHcp80 } from "@/lib/handicap/resolveTournamentEntryHandicap";

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
  tournamentHcp: OfficialHcp80 | null;
  tournamentHcpDetail: string | null;
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
    tournamentHcp: r.tournamentHcp ?? null,
    tournamentHcpDetail: r.tournamentHcpDetail ?? null,
  };
}

const SAVE_DEBOUNCE_MS = 450;

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
  const [savingFlags, setSavingFlags] = useState(false);
  const [pending, startTransition] = useTransition();
  const [thresholds, setThresholds] = useState<SuggestThresholds>(
    DEFAULT_SUGGEST_THRESHOLDS
  );
  const [bulkReason, setBulkReason] = useState("");

  const pendingFlagsRef = useRef<Map<string, BulkFlagItem>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushBusyRef = useRef(false);
  const lastOkMsgRef = useRef("");
  const tournamentIdRef = useRef(tournamentId);
  tournamentIdRef.current = tournamentId;

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#entry-")) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({
        block: "center",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  async function flushPendingFlags() {
    if (flushBusyRef.current) return;
    const items = Array.from(pendingFlagsRef.current.values());
    if (items.length === 0) return;
    pendingFlagsRef.current.clear();
    flushBusyRef.current = true;
    setSavingFlags(true);
    setErr("");
    try {
      const res = await saveCommitteeFlagsBulk({
        tournamentId: tournamentIdRef.current,
        items,
        quiet: true,
      });
      if (!res.ok) {
        // Re-encolar para reintentar sin perder la intención del usuario.
        for (const item of items) {
          pendingFlagsRef.current.set(item.entryId, item);
        }
        setErr(res.error);
        return;
      }
      if (lastOkMsgRef.current) setMsg(lastOkMsgRef.current);
    } finally {
      flushBusyRef.current = false;
      setSavingFlags(false);
      if (pendingFlagsRef.current.size > 0) {
        scheduleFlush(lastOkMsgRef.current || "Selección guardada.");
      }
    }
  }

  function scheduleFlush(okMsg: string) {
    lastOkMsgRef.current = okMsg;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushPendingFlags();
    }, SAVE_DEBOUNCE_MS);
  }

  function persistItems(
    items: Array<{ entryId: string; flagged: boolean; reason: string }>,
    okMsg: string
  ) {
    if (items.length === 0) return;
    setErr("");
    setMsg("");
    for (const item of items) {
      pendingFlagsRef.current.set(item.entryId, item);
    }
    scheduleFlush(okMsg);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Intento final al desmontar (navegación).
      const leftover = Array.from(pendingFlagsRef.current.values());
      if (leftover.length > 0) {
        void saveCommitteeFlagsBulk({
          tournamentId: tournamentIdRef.current,
          items: leftover,
          quiet: true,
        });
      }
    };
  }, []);

  function reasonFor(id: string) {
    return reasons[id]?.trim() || bulkReason.trim() || "";
  }

  function toggle(id: string) {
    const nextFlagged = !selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (nextFlagged) next.add(id);
      else next.delete(id);
      return next;
    });
    persistItems(
      [
        {
          entryId: id,
          flagged: nextFlagged,
          reason: nextFlagged ? reasonFor(id) : "",
        },
      ],
      nextFlagged
        ? "Jugador en la votación de todos los miembros."
        : "Jugador quitado de la lista compartida."
    );
  }

  function markAllVisible() {
    const toAdd = filtered.filter((r) => !selected.has(r.entryId));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(r.entryId);
      return next;
    });
    persistItems(
      toAdd.map((r) => ({
        entryId: r.entryId,
        flagged: true,
        reason: reasonFor(r.entryId),
      })),
      `${toAdd.length} jugador(es) en la votación de todos.`
    );
  }

  function unmarkAllVisible() {
    const toRemove = filtered.filter((r) => selected.has(r.entryId));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.delete(r.entryId);
      return next;
    });
    persistItems(
      toRemove.map((r) => ({
        entryId: r.entryId,
        flagged: false,
        reason: "",
      })),
      `${toRemove.length} jugador(es) quitados de la lista compartida.`
    );
  }

  function invertVisible() {
    const items = filtered.map((r) => {
      const flagged = !selected.has(r.entryId);
      return {
        entryId: r.entryId,
        flagged,
        reason: flagged ? reasonFor(r.entryId) : "",
      };
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (next.has(r.entryId)) next.delete(r.entryId);
        else next.add(r.entryId);
      }
      return next;
    });
    persistItems(items, "Selección invertida y guardada para todos.");
  }

  function applySuggestToSelection() {
    const candidates = tableRows.filter((r) => r.suggestReasons.length > 0);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of candidates) next.add(r.entryId);
      return next;
    });
    persistItems(
      candidates.map((r) => ({
        entryId: r.entryId,
        flagged: true,
        reason: reasonFor(r.entryId),
      })),
      `${candidates.length} sugeridos ya están en la votación de todos.`
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
        `Sugerencia calculada: ${res.rows.filter((r) => r.suggestReasons.length).length} candidatos. Usa «Subir sugeridos a todos» para ponerlos en la votación.`
      );
    });
  }

  function saveReason(id: string) {
    if (!selected.has(id)) return;
    persistItems(
      [{ entryId: id, flagged: true, reason: reasonFor(id) }],
      "Motivo guardado en la lista compartida."
    );
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
        <p className="mt-1 text-sm text-slate-700">
          Lista compartida: al marcar un jugador queda al instante en la
          votación de <strong>todos</strong> los miembros del comité. No hay
          lista por persona.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          En votación: {selectedCount} · Sugeridos (aún no aplicados):{" "}
          {suggestedCount}
          {savingFlags ? (
            <span className="ml-2 font-semibold text-indigo-600">
              Guardando…
            </span>
          ) : null}
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
            disabled={pending}
            onClick={markAllVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Marcar todos (filtro)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={unmarkAllVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Desmarcar todos (filtro)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={invertVisible}
            className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
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
          {pending ? (
            <span className="text-xs font-semibold text-indigo-700">
              Guardando en la lista de todos…
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
        <h2 className="text-sm font-bold text-amber-950">
          Sugerir candidatos
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
            disabled={pending}
            onClick={applySuggestToSelection}
            className="rounded border border-amber-800 bg-white px-2.5 py-1 font-semibold text-amber-950 disabled:opacity-50"
          >
            Subir sugeridos a todos
          </button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-right tabular-nums">
                #
              </th>
              <th className="px-2 py-2">✓</th>
              <th className="px-2 py-2">Jugador</th>
              <th className="px-2 py-2" title="HI congelado al inscribirse">
                HI inscripción
              </th>
              <th className="px-2 py-2" title="HI vigente en players">
                HI actual
              </th>
              <th className="px-2 py-2">Cat</th>
              <th
                className="px-2 py-2 text-right"
                title="Handicap de torneo al 80% (CH exacto × 0.80)"
              >
                HP
              </th>
              <th
                className="px-2 py-2"
                title="Tee asignado por la regla del torneo (HI y categoría)"
              >
                Salida
              </th>
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
            {filtered.map((r, i) => {
              const n = i + 1;
              const on = selected.has(r.entryId);
              const currentHi = r.currentHi;
              const categoryCode = r.categoryCode;
              const rounds12m = r.rounds12m;
              const minHi = r.minHi;
              const returnUrl = `/comite-handicap/seleccion?tournament_id=${encodeURIComponent(tournamentId)}#entry-${r.entryId}`;
              return (
                <tr
                  key={r.entryId}
                  id={`entry-${r.entryId}`}
                  className={`border-t border-slate-100 ${
                    on ? "bg-indigo-50/50" : "bg-white"
                  } ${r.suggestReasons.length ? "outline outline-1 outline-amber-200" : ""}`}
                >
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1.5 text-right font-mono text-[11px] font-bold tabular-nums text-slate-500 ${
                      on ? "bg-indigo-50" : "bg-white"
                    }`}
                  >
                    {n}
                  </td>
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
                  <td
                    className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-mono font-semibold text-indigo-800"
                    title={r.tournamentHcpDetail ?? "Sin datos de campo/salida para calcular H torneo"}
                  >
                    {r.tournamentHcp ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span>{r.tournamentHcp.hp}</span>
                        <span className="text-[8px] font-medium text-slate-500">
                          80% · CH {r.tournamentHcp.ch}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <SalidaDot hcp={r.tournamentHcp} />
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
                      onBlur={() => saveReason(r.entryId)}
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
                        href={`/handicap-report/${r.playerId}?tournament_id=${encodeURIComponent(tournamentId)}&n=${n}&of=${filtered.length}&return=${encodeURIComponent(returnUrl)}`}
                        className="whitespace-nowrap text-indigo-700 underline"
                      >
                        Abrir #{n}
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

function SalidaDot({ hcp }: { hcp: OfficialHcp80 | null }) {
  const label = hcp?.teeName || hcp?.teeCode;
  if (!hcp || !label) {
    return <span className="text-slate-400">—</span>;
  }
  const color = (hcp.teeColor && hcp.teeColor.trim()) || "#94a3b8";
  const light =
    color.toLowerCase() === "#f8fafc" ||
    color.toLowerCase() === "#e5e7eb" ||
    color.toLowerCase() === "#ffffff" ||
    color.toLowerCase() === "#fff";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold text-slate-800"
      title={label}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full border"
        style={{
          backgroundColor: color,
          borderColor: light ? "#64748b" : "rgba(15,23,42,0.35)",
        }}
      />
      <span>{label}</span>
    </span>
  );
}
