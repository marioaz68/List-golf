"use client";

/**
 * Captura rápida del grupo (4 tarjetas) en formato tabla horizontal.
 * Visualmente igual a la EditableScorecard del backoffice (sticky label
 * + 18 columnas de hoyos + F9/B9/TOT), con una fila SCORE por jugador.
 *
 * Cuando el torneo es match play y el match queda empatado al 18 (o ya
 * hay hoyos de desempate capturados) se renderiza una segunda tabla
 * para el tramo de desempate (P1-P9), almacenados internamente como
 * 19-27.
 *
 * Cada celda es un input numérico; al cambiarlo, se hace POST a
 * /api/captura/score (igual que /captura/tarjeta y /captura/mobile).
 *
 * El componente se mantiene focalizado en captura. Para firma de
 * tarjetas y tarjetas privadas usar /captura/tarjeta.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  HOLES_FRONT,
  HOLES_BACK,
  HOLES_PLAYOFF,
  PAR_BY_HOLE,
} from "@/lib/captura/loadGroupCapture";
import { analyzePlayoffCapture } from "@/lib/captura/playoffCaptureState";
import type {
  GroupCapturePayload,
  GroupCapturePlayer,
  HoleNumber,
  HoleScores,
} from "@/lib/captura/types";

type ScoresByEntry = Record<string, HoleScores>;
type PendingByEntry = Record<string, Partial<Record<HoleNumber, boolean>>>;

/** Ventajas (stroke index) por hoyo — fallback si la API no lo trae
 *  todavía. Aquí no las pintamos (el backoffice las muestra solo como
 *  referencia visual), pero las dejamos disponibles para una extensión
 *  futura. */
const SHOW_VENT_ROW = false;

const scrollClass =
  "w-full min-w-0 overflow-x-auto overflow-y-visible overscroll-x-contain [-webkit-overflow-scrolling:touch]";
const tableClass =
  "w-max min-w-[540px] border-separate border-spacing-0 text-[10px] text-black md:text-xs";

function stickyLabelCell(bg: string) {
  return `sticky left-0 z-10 w-24 min-w-[96px] max-w-[140px] border-r border-gray-200 px-2 py-1 text-left text-[10px] font-semibold leading-tight shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] ${bg}`;
}
const holeHeadCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-200 px-0 py-0.5 text-center font-semibold leading-none";
const holeMetaCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-200 px-0 py-0.5 text-center text-[9px] leading-none text-gray-700";
const holeBodyCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-100 px-0 py-0.5 text-center align-middle text-[10px] leading-none";
const totalHeadCell =
  "w-9 min-w-[36px] max-w-[44px] border-b border-gray-200 px-0.5 py-0.5 text-center text-[10px] font-semibold leading-none";
const totalBodyCell =
  "w-9 min-w-[36px] max-w-[44px] border-b border-gray-100 px-0.5 py-0.5 text-center text-[10px] font-semibold leading-none";

function shortName(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts.join(" ");
  // Nombre + primer apellido (drop second apellido para no robar ancho).
  return `${parts[0]} ${parts[1]}`;
}

function sumHoles(holes: HoleNumber[], scores: HoleScores): number {
  return holes.reduce((acc, h) => acc + (scores[h] ?? 0), 0);
}

function sumPar(holes: HoleNumber[]): number {
  return holes.reduce((acc, h) => acc + (PAR_BY_HOLE[h] ?? 0), 0);
}

/**
 * Celda de score con auto-guardado.
 *
 * Cada vez que el usuario teclea un dígito válido el valor se guarda
 * automáticamente — no hace falta hacer blur ni dar Enter para que se
 * persista. La lógica:
 *  - Un dígito (1-9)  → se guarda al instante.
 *  - Dos dígitos (10-15) → se guarda al instante con el nuevo valor.
 *  - Limpia con Backspace/Delete → se manda `null` y queda en blanco.
 *
 * Para evitar mandar muchas requests al backend mientras el usuario
 * sigue tecleando, se debouncea ~150 ms.
 */
function ScoreCell({
  value,
  par,
  isPending,
  isSaving,
  disabled,
  onCommit,
}: {
  value: number | null;
  par: number;
  isPending: boolean;
  isSaving: boolean;
  disabled: boolean;
  onCommit: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedRef = useRef<number | null>(value);

  useEffect(() => {
    lastCommittedRef.current = value;
    setDraft(value != null ? String(value) : "");
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function scheduleCommit(next: number | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (lastCommittedRef.current === next) return;
      lastCommittedRef.current = next;
      onCommit(next);
    }, 150);
  }

  function flushCommit(next: number | null) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (lastCommittedRef.current === next) return;
    lastCommittedRef.current = next;
    onCommit(next);
  }

  function handleChange(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 2);
    setDraft(cleaned);
    if (cleaned === "") {
      scheduleCommit(null);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 1 || n > 15) {
      // Valor fuera de rango: descartamos sin guardar.
      return;
    }
    scheduleCommit(Math.trunc(n));
  }

  function handleBlur() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      flushCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1 || n > 15) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    flushCommit(Math.trunc(n));
  }

  // Marca circular para birdies/eagles, cuadrada para bogeys/dobles.
  const diff = value == null ? null : value - par;
  let frame = "border-gray-300 bg-white";
  if (value != null) {
    if (diff != null && diff <= -2) {
      frame =
        "border-rose-500 bg-white shadow-[inset_0_0_0_2px_white,inset_0_0_0_3px_rgb(244_63_94)] rounded-full";
    } else if (diff === -1) {
      frame = "border-rose-500 bg-white rounded-full";
    } else if (diff === 1) {
      frame = "border-slate-800 bg-white";
    } else if (diff != null && diff >= 2) {
      frame =
        "border-slate-800 bg-white shadow-[inset_0_0_0_2px_white,inset_0_0_0_3px_rgb(15_23_42)]";
    }
  }
  const pendingClass = isPending ? "bg-red-500 text-white border-red-700" : "";
  const savingClass = isSaving ? "opacity-60" : "";

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      readOnly={disabled}
      disabled={disabled}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={[
        "mx-auto box-border h-7 w-7 min-w-[28px] max-w-[32px] rounded border-2 px-0 py-0 text-center text-[11px] font-bold outline-none focus:ring-2 focus:ring-green-300",
        frame,
        pendingClass,
        savingClass,
        disabled ? "cursor-not-allowed opacity-40" : "",
      ].join(" ")}
    />
  );
}

function PlayerRow({
  player,
  scores,
  pending,
  holes,
  groupId,
  savingKey,
  setSavingKey,
  onScoreSaved,
  disabledHoles,
  highlight,
}: {
  player: GroupCapturePlayer;
  scores: HoleScores;
  pending: Partial<Record<HoleNumber, boolean>>;
  holes: HoleNumber[];
  groupId: string;
  savingKey: string | null;
  setSavingKey: (key: string | null) => void;
  onScoreSaved: (entryId: string, hole: HoleNumber, strokes: number | null) => void;
  disabledHoles?: Set<HoleNumber>;
  highlight?: "me" | "witness" | null;
}) {
  const rowBg =
    highlight === "me"
      ? "bg-sky-50"
      : highlight === "witness"
        ? "bg-amber-50"
        : "bg-white";

  // Si los `holes` son sólo front o sólo back, mostramos un único bloque.
  // Si vienen los 18, dividimos en F9/B9 con totales intermedios.
  const isFullRound =
    holes.length === 18 &&
    holes[0] === 1 &&
    holes[8] === 9 &&
    holes[9] === 10;
  const frontHoles = isFullRound ? holes.slice(0, 9) : holes;
  const backHoles = isFullRound ? holes.slice(9) : [];
  const front9 = sumHoles(frontHoles, scores);
  const back9 = backHoles.length > 0 ? sumHoles(backHoles, scores) : 0;
  const total = front9 + back9;

  async function saveScore(hole: HoleNumber, strokes: number | null) {
    const key = `${player.entryId}-${hole}`;
    setSavingKey(key);
    try {
      const res = await fetch("/api/captura/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          entry_id: player.entryId,
          hole,
          strokes,
          mode: "modify",
        }),
      });
      if (res.ok) {
        onScoreSaved(player.entryId, hole, strokes);
      }
    } catch {
      // Silencioso: la siguiente sincronización del polling reflejará el estado real.
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <tr className={rowBg}>
      <td className={stickyLabelCell(rowBg)}>
        <div className="truncate" title={player.name}>
          {shortName(player.name)}
        </div>
      </td>
      {frontHoles.map((h) => (
        <td key={`f-${player.entryId}-${h}`} className={holeBodyCell}>
          <ScoreCell
            value={scores[h] ?? null}
            par={PAR_BY_HOLE[h] ?? 4}
            isPending={Boolean(pending[h])}
            isSaving={savingKey === `${player.entryId}-${h}`}
            disabled={disabledHoles?.has(h) ?? false}
            onCommit={(next) => saveScore(h, next)}
          />
        </td>
      ))}
      {isFullRound ? (
        <td className={totalBodyCell}>{front9 > 0 ? front9 : ""}</td>
      ) : null}
      {backHoles.map((h) => (
        <td key={`b-${player.entryId}-${h}`} className={holeBodyCell}>
          <ScoreCell
            value={scores[h] ?? null}
            par={PAR_BY_HOLE[h] ?? 4}
            isPending={Boolean(pending[h])}
            isSaving={savingKey === `${player.entryId}-${h}`}
            disabled={disabledHoles?.has(h) ?? false}
            onCommit={(next) => saveScore(h, next)}
          />
        </td>
      ))}
      {isFullRound ? (
        <td className={totalBodyCell}>{back9 > 0 ? back9 : ""}</td>
      ) : null}
      <td className={totalBodyCell}>{total > 0 ? total : ""}</td>
    </tr>
  );
}

function HoleTableHeader({
  holes,
  showInternalTotals,
  totalLabel,
  internalLabel,
}: {
  holes: HoleNumber[];
  showInternalTotals: boolean;
  totalLabel: string;
  internalLabel?: string;
}) {
  const isFullRound =
    holes.length === 18 &&
    holes[0] === 1 &&
    holes[8] === 9 &&
    holes[9] === 10;
  const frontHoles = isFullRound ? holes.slice(0, 9) : holes;
  const backHoles = isFullRound ? holes.slice(9) : [];

  function holeLabel(h: HoleNumber): string {
    if (h >= 19 && h <= 27) return `P${h - 18}`;
    return String(h);
  }

  return (
    <thead>
      {SHOW_VENT_ROW ? (
        <tr className="bg-white">
          <th className={stickyLabelCell("bg-white")}>VENT</th>
          {frontHoles.map((h) => (
            <th key={`v-${h}`} className={holeMetaCell}>
              {/* placeholder; las ventajas reales vienen del campo. */}
              —
            </th>
          ))}
          {isFullRound ? <th className={totalHeadCell} /> : null}
          {backHoles.map((h) => (
            <th key={`v-${h}`} className={holeMetaCell}>
              —
            </th>
          ))}
          {isFullRound ? <th className={totalHeadCell} /> : null}
          <th className={totalHeadCell} />
        </tr>
      ) : null}
      <tr className="bg-gray-50">
        <th className={stickyLabelCell("bg-gray-50")}>HOYO</th>
        {frontHoles.map((h) => (
          <th key={`h-${h}`} className={holeHeadCell}>
            {holeLabel(h)}
          </th>
        ))}
        {isFullRound && showInternalTotals ? (
          <th className={totalHeadCell}>{internalLabel ?? "F9"}</th>
        ) : null}
        {backHoles.map((h) => (
          <th key={`h-${h}`} className={holeHeadCell}>
            {holeLabel(h)}
          </th>
        ))}
        {isFullRound && showInternalTotals ? (
          <th className={totalHeadCell}>B9</th>
        ) : null}
        <th className={totalHeadCell}>{totalLabel}</th>
      </tr>
      <tr className="bg-gray-50">
        <th className={stickyLabelCell("bg-gray-50")}>PAR</th>
        {frontHoles.map((h) => (
          <th key={`p-${h}`} className={holeMetaCell}>
            {PAR_BY_HOLE[h] ?? "—"}
          </th>
        ))}
        {isFullRound && showInternalTotals ? (
          <th className={totalHeadCell}>{sumPar(frontHoles)}</th>
        ) : null}
        {backHoles.map((h) => (
          <th key={`p-${h}`} className={holeMetaCell}>
            {PAR_BY_HOLE[h] ?? "—"}
          </th>
        ))}
        {isFullRound && showInternalTotals ? (
          <th className={totalHeadCell}>{sumPar(backHoles)}</th>
        ) : null}
        <th className={totalHeadCell}>{sumPar(holes)}</th>
      </tr>
    </thead>
  );
}

function MatchRow({
  holes,
  progressionMap,
  showInternalTotals,
}: {
  holes: HoleNumber[];
  progressionMap: Map<
    number,
    { label: string; top_cum: number; bottom_cum: number }
  >;
  showInternalTotals: boolean;
}) {
  const isFullRound =
    holes.length === 18 &&
    holes[0] === 1 &&
    holes[8] === 9 &&
    holes[9] === 10;
  const frontHoles = isFullRound ? holes.slice(0, 9) : holes;
  const backHoles = isFullRound ? holes.slice(9) : [];

  function cell(h: HoleNumber) {
    const row = progressionMap.get(h);
    if (!row) {
      return (
        <td key={`mp-${h}`} className="border-b border-gray-100 px-0 py-1 text-center text-[9px] text-gray-400">
          —
        </td>
      );
    }
    const tint =
      row.label === "AS"
        ? "text-slate-700"
        : row.label.startsWith("T+")
          ? "text-cyan-700 font-bold"
          : "text-fuchsia-700 font-bold";
    return (
      <td
        key={`mp-${h}`}
        className={`border-b border-gray-100 px-0 py-1 text-center text-[9px] leading-none ${tint}`}
        title={`${row.top_cum}–${row.bottom_cum} pts`}
      >
        {row.label}
      </td>
    );
  }

  const lastEntry = [...holes].reverse().find((h) => progressionMap.has(h));
  const tail = lastEntry != null ? progressionMap.get(lastEntry)! : null;

  return (
    <tr className="border-t-2 border-emerald-400 bg-emerald-50">
      <td className={stickyLabelCell("bg-emerald-50")}>
        <span className="font-bold text-emerald-900">MATCH</span>
      </td>
      {frontHoles.map(cell)}
      {isFullRound && showInternalTotals ? (
        <td className="border-b border-gray-100 px-0 py-1 text-center text-[9px] text-gray-500">
          —
        </td>
      ) : null}
      {backHoles.map(cell)}
      {isFullRound && showInternalTotals ? (
        <td className="border-b border-gray-100 px-0 py-1 text-center text-[9px] text-gray-500">
          —
        </td>
      ) : null}
      <td className="border-b border-gray-100 px-0 py-1 text-center text-[9px] font-semibold text-emerald-900">
        {tail ? `${tail.top_cum}–${tail.bottom_cum}` : "—"}
      </td>
    </tr>
  );
}

export default function GrupoCaptureClient({
  initial,
}: {
  initial: GroupCapturePayload;
}) {
  const [meta, setMeta] = useState(initial);
  const [scoresByEntry, setScoresByEntry] = useState<ScoresByEntry>(() =>
    Object.fromEntries(meta.players.map((p) => [p.entryId, { ...p.scores }]))
  );
  const [pendingByEntry, setPendingByEntry] = useState<PendingByEntry>(() =>
    Object.fromEntries(
      meta.players.map((p) => [p.entryId, { ...(p.pending ?? {}) }])
    )
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingRef = useRef<string | null>(null);
  savingRef.current = savingKey;

  // Polling para sincronizar con cambios de otros usuarios.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (savingRef.current) return;
      try {
        const qs = new URLSearchParams({ group_id: meta.groupId });
        if (meta.myEntryId) qs.set("me", meta.myEntryId);
        const res = await fetch(`/api/captura/group?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: GroupCapturePayload;
        };
        if (!json.ok || !json.data) return;
        const data = json.data;
        setMeta(data);
        setScoresByEntry((prev) => {
          const next: ScoresByEntry = { ...prev };
          for (const p of data.players) {
            next[p.entryId] = { ...p.scores };
          }
          return next;
        });
        setPendingByEntry((prev) => {
          const next: PendingByEntry = { ...prev };
          for (const p of data.players) {
            next[p.entryId] = { ...(p.pending ?? {}) };
          }
          return next;
        });
      } catch {
        /* silencioso */
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [meta.groupId, meta.myEntryId]);

  function onScoreSaved(
    entryId: string,
    hole: HoleNumber,
    strokes: number | null
  ) {
    setScoresByEntry((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [hole]: strokes,
      } as HoleScores,
    }));
  }

  const witnessTargetForMe = useMemo(() => {
    if (!meta.myEntryId) return null;
    for (const w of meta.witnesses ?? []) {
      if (w.witnessEntryId === meta.myEntryId) return w.entryId;
    }
    return null;
  }, [meta.myEntryId, meta.witnesses]);

  const progressionMap = useMemo(() => {
    const map = new Map<
      number,
      { label: string; top_cum: number; bottom_cum: number }
    >();
    for (const row of meta.matchPlay?.progression ?? []) {
      map.set(row.hole_no, {
        label: row.label,
        top_cum: row.top_cum,
        bottom_cum: row.bottom_cum,
      });
    }
    return map;
  }, [meta.matchPlay?.progression]);

  const playoffCapture = useMemo(
    () =>
      analyzePlayoffCapture(
        meta.matchPlay,
        meta.players.map((p) => ({
          entryId: p.entryId,
          name: p.name,
          scores: scoresByEntry[p.entryId] ?? p.scores,
        }))
      ),
    [meta.matchPlay, meta.players, scoresByEntry]
  );

  // Si ya se decidió en desempate, bloqueamos hoyos posteriores al de cierre.
  const decidedAt = meta.matchPlay?.decidedAtHole ?? null;
  const playoffDisabled = new Set<HoleNumber>();
  if (decidedAt != null && decidedAt >= 19) {
    for (const h of HOLES_PLAYOFF) {
      if (h > decidedAt) playoffDisabled.add(h);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto max-w-5xl space-y-3 p-3 md:p-5">
        <header className="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                Captura rápida del grupo
              </div>
              <h1 className="text-base font-bold text-slate-900">
                {meta.tournamentName ?? "Torneo"}
                {meta.groupNo != null ? ` · Grupo ${meta.groupNo}` : ""}
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {meta.players.length} jugadores · tee time {meta.teeTime ?? "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Link
                href={`/captura/tarjeta?group_id=${meta.groupId}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tarjeta completa →
              </Link>
              <Link
                href={`/captura/mobile?group_id=${meta.groupId}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Vista keypad móvil →
              </Link>
            </div>
          </div>
        </header>

        {meta.matchPlay ? (
          <div
            className={[
              "rounded-md border px-3 py-2 text-[12px]",
              meta.matchPlay.needsPlayoff
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : meta.matchPlay.decidedAtHole != null
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-slate-300 bg-white text-slate-700",
            ].join(" ")}
          >
            <div className="font-bold">
              {meta.matchPlay.needsPlayoff
                ? "Empate al 18 — desempate en muerte súbita (1-9)"
                : meta.matchPlay.decidedAtHole != null
                  ? "Match decidido"
                  : "Match en curso"}
            </div>
            <div className="mt-0.5">
              {meta.matchPlay.resultText}
              {meta.matchPlay.needsPlayoff ? (
                <span>
                  {" "}
                  · Cada hoyo del playoff sigue valiendo hasta 2 puntos. El
                  match termina en el primer hoyo donde una pareja saque
                  ventaja en puntos. Si quedan 1-1, siguen al próximo.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {playoffCapture.orphanPlayoffScores ? (
          <div className="rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
            El match ya quedó decidido en la ronda normal (
            {meta.matchPlay?.resultText}). Los hoyos de desempate capturados no
            cambian el resultado.
          </div>
        ) : null}

        {playoffCapture.missingPlayerNames.length > 0 ? (
          <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-900">
            Desempate P{playoffCapture.pendingPlayoffHole}: faltan scores de{" "}
            {playoffCapture.missingPlayerNames.join(", ")}. Sin los 4 jugadores
            no se calculan puntos ni se cierra el match.
          </div>
        ) : null}

        {/* Tabla principal: 4 jugadores × 18 hoyos */}
        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <div className={scrollClass}>
            <table className={tableClass}>
              <HoleTableHeader
                holes={[...HOLES_FRONT, ...HOLES_BACK] as HoleNumber[]}
                showInternalTotals
                totalLabel="TOT"
              />
              <tbody>
                {meta.players.map((player) => {
                  const highlight: "me" | "witness" | null =
                    meta.myEntryId === player.entryId
                      ? "me"
                      : witnessTargetForMe === player.entryId
                        ? "witness"
                        : null;
                  return (
                    <PlayerRow
                      key={player.entryId}
                      player={player}
                      scores={scoresByEntry[player.entryId] ?? player.scores}
                      pending={pendingByEntry[player.entryId] ?? {}}
                      holes={[...HOLES_FRONT, ...HOLES_BACK] as HoleNumber[]}
                      groupId={meta.groupId}
                      savingKey={savingKey}
                      setSavingKey={setSavingKey}
                      onScoreSaved={onScoreSaved}
                      highlight={highlight}
                    />
                  );
                })}
                {progressionMap.size > 0 ? (
                  <MatchRow
                    holes={[...HOLES_FRONT, ...HOLES_BACK] as HoleNumber[]}
                    progressionMap={progressionMap}
                    showInternalTotals
                  />
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-1 px-1 text-[10px] text-slate-500">
            Toca una celda y escribe el número de tiros. Los cambios se
            guardan automáticamente al salir del campo o al presionar Enter.
          </p>
        </div>

        {/* Desempate: solo si aplica */}
        {playoffCapture.showPlayoffSection ? (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-2 shadow-sm">
            <div className="mb-2 px-1 text-[11px] font-bold tracking-wide text-amber-900">
              DESEMPATE · muerte súbita (hoyos 1-9 físicos)
            </div>
            <div className={scrollClass}>
              <table className={tableClass}>
                <HoleTableHeader
                  holes={HOLES_PLAYOFF}
                  showInternalTotals={false}
                  totalLabel="PO"
                />
                <tbody>
                  {meta.players.map((player) => {
                    const highlight: "me" | "witness" | null =
                      meta.myEntryId === player.entryId
                        ? "me"
                        : witnessTargetForMe === player.entryId
                          ? "witness"
                          : null;
                    return (
                      <PlayerRow
                        key={`po-${player.entryId}`}
                        player={player}
                        scores={scoresByEntry[player.entryId] ?? player.scores}
                        pending={pendingByEntry[player.entryId] ?? {}}
                        holes={HOLES_PLAYOFF}
                        groupId={meta.groupId}
                        savingKey={savingKey}
                        setSavingKey={setSavingKey}
                        onScoreSaved={onScoreSaved}
                        disabledHoles={playoffDisabled}
                        highlight={highlight}
                      />
                    );
                  })}
                  {progressionMap.size > 0 &&
                  HOLES_PLAYOFF.some((h) => progressionMap.has(h)) ? (
                    <MatchRow
                      holes={HOLES_PLAYOFF}
                      progressionMap={progressionMap}
                      showInternalTotals={false}
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="mt-1 px-1 text-[10px] text-amber-800">
              Mismas ventajas que la ronda normal (los hoyos 1-9 se vuelven
              a jugar físicamente). El match termina en el primer hoyo
              donde una pareja saque ventaja en puntos.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
