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
type PickedUpByEntry = Record<string, Partial<Record<HoleNumber, boolean>>>;

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

/** Avanza el foco a la siguiente celda de score (habilitada) en orden
 *  visual. Si la fila del jugador termina, salta al primer hoyo del
 *  siguiente jugador automáticamente (orden del DOM). Si no hay
 *  siguiente, hace `blur()`.
 */
function focusNextScoreCell(current: HTMLInputElement): void {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-score-cell="1"]')
  );
  const idx = all.indexOf(current);
  if (idx < 0) return;
  for (let i = idx + 1; i < all.length; i += 1) {
    const el = all[i];
    if (el && !el.disabled && !el.readOnly) {
      el.focus();
      el.select();
      return;
    }
  }
  // No hay siguiente celda: cerramos el teclado en mobile.
  current.blur();
}

/**
 * Celda de score con auto-guardado.
 *
 * Cada vez que el usuario teclea un dígito válido el valor se guarda
 * automáticamente — no hace falta hacer blur ni dar Enter para que se
 * persista. La lógica:
 *  - Un dígito (1-9)  → se guarda al instante y el cursor salta a la
 *    siguiente casilla tras ~250 ms (para permitir teclear 10-15).
 *  - Dos dígitos (10-15) → se guarda y salta al instante.
 *  - "X" → se guarda como "levantó" y salta al instante.
 *  - Limpia con Backspace/Delete → se manda `null`, queda en blanco y
 *    NO salta el cursor.
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
  pickedUp,
  allowPickup,
  onCommit,
}: {
  value: number | null;
  par: number;
  isPending: boolean;
  isSaving: boolean;
  disabled: boolean;
  /** True si el jugador levantó (X). value debe ser null. */
  pickedUp?: boolean;
  /** Si true, se acepta "x"/"X" para marcar levantó. Sólo match play. */
  allowPickup?: boolean;
  onCommit: (next: number | null, options?: { pickedUp?: boolean }) => void;
}) {
  const initialDraft = pickedUp ? "X" : value != null ? String(value) : "";
  const [draft, setDraft] = useState<string>(initialDraft);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCommittedRef = useRef<{ strokes: number | null; pickedUp: boolean }>({
    strokes: value,
    pickedUp: Boolean(pickedUp),
  });

  useEffect(() => {
    lastCommittedRef.current = {
      strokes: value,
      pickedUp: Boolean(pickedUp),
    };
    setDraft(pickedUp ? "X" : value != null ? String(value) : "");
  }, [value, pickedUp]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

  function scheduleAdvance(delayMs: number) {
    if (advanceRef.current) clearTimeout(advanceRef.current);
    advanceRef.current = setTimeout(() => {
      const el = inputRef.current;
      // Sólo avanzamos si el input sigue enfocado (el usuario no se movió
      // manualmente a otra celda mientras tanto).
      if (el && document.activeElement === el) {
        focusNextScoreCell(el);
      }
    }, delayMs);
  }

  function cancelAdvance() {
    if (advanceRef.current) {
      clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
  }

  function sameAsCommitted(
    strokes: number | null,
    isPicked: boolean
  ): boolean {
    return (
      lastCommittedRef.current.strokes === strokes &&
      lastCommittedRef.current.pickedUp === isPicked
    );
  }

  function scheduleCommit(strokes: number | null, isPicked: boolean) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (sameAsCommitted(strokes, isPicked)) return;
      lastCommittedRef.current = { strokes, pickedUp: isPicked };
      onCommit(strokes, { pickedUp: isPicked });
    }, 150);
  }

  function flushCommit(strokes: number | null, isPicked: boolean) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (sameAsCommitted(strokes, isPicked)) return;
    lastCommittedRef.current = { strokes, pickedUp: isPicked };
    onCommit(strokes, { pickedUp: isPicked });
  }

  function handleChange(raw: string) {
    // Aceptamos sólo "x"/"X" (si está permitido) o dígitos. Cualquier
    // otra cosa se descarta — nunca lanzamos error.
    const trimmed = raw.trim();
    if (
      allowPickup &&
      (trimmed === "x" || trimmed === "X" || trimmed === "xx" || trimmed === "XX")
    ) {
      setDraft("X");
      scheduleCommit(null, true);
      // X es valor final → avanzar de inmediato.
      scheduleAdvance(0);
      return;
    }

    const cleaned = trimmed.replace(/[^0-9]/g, "").slice(0, 2);
    setDraft(cleaned);
    if (cleaned === "") {
      // Borrado: no avanzamos para que el usuario pueda re-teclear.
      cancelAdvance();
      scheduleCommit(null, false);
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 1 || n > 15) {
      // Valor fuera de rango: descartamos sin guardar (no error).
      cancelAdvance();
      return;
    }
    scheduleCommit(Math.trunc(n), false);
    // Auto-avance:
    //  - 2 dígitos válidos (10-15) → final, saltar ya.
    //  - 1 dígito → esperamos 250 ms por si el usuario está tecleando 10-15.
    //    Si dentro de ese plazo entra otro keypress, se reinicia el timer.
    if (cleaned.length >= 2) {
      scheduleAdvance(0);
    } else {
      scheduleAdvance(250);
    }
  }

  function handleBlur() {
    const trimmed = draft.trim();
    if (allowPickup && (trimmed === "x" || trimmed === "X")) {
      flushCommit(null, true);
      return;
    }
    if (trimmed === "") {
      flushCommit(null, false);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1 || n > 15) {
      // Restauramos visualmente lo último confirmado.
      setDraft(
        lastCommittedRef.current.pickedUp
          ? "X"
          : lastCommittedRef.current.strokes != null
            ? String(lastCommittedRef.current.strokes)
            : ""
      );
      return;
    }
    flushCommit(Math.trunc(n), false);
  }

  // Marca circular para birdies/eagles, cuadrada para bogeys/dobles.
  const diff = value == null ? null : value - par;
  let frame = "border-gray-300 bg-white";
  if (pickedUp) {
    frame = "border-amber-500 bg-amber-50 text-amber-700";
  } else if (value != null) {
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
  const pendingClass =
    isPending && !pickedUp ? "bg-red-500 text-white border-red-700" : "";
  const savingClass = isSaving ? "opacity-60" : "";

  return (
    <input
      ref={inputRef}
      data-score-cell="1"
      type="text"
      inputMode={allowPickup ? "text" : "numeric"}
      pattern={allowPickup ? "[0-9xX]*" : "[0-9]*"}
      value={draft}
      readOnly={disabled}
      disabled={disabled}
      title={
        allowPickup
          ? "Score 1–15 o X para no terminó el hoyo (pierde bola alta)"
          : undefined
      }
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={(e) => {
        cancelAdvance();
        handleBlur();
        void e;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          // Tab y Enter avanzan manualmente: cancelamos cualquier avance
          // automático pendiente para no saltar dos celdas.
          cancelAdvance();
          if (e.key === "Enter") {
            e.preventDefault();
            focusNextScoreCell(e.currentTarget as HTMLInputElement);
          }
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
  pickedUp,
  allowPickup,
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
  pickedUp?: Partial<Record<HoleNumber, boolean>>;
  /** Si true, las celdas aceptan "X" para marcar levantó. */
  allowPickup?: boolean;
  holes: HoleNumber[];
  groupId: string;
  savingKey: string | null;
  setSavingKey: (key: string | null) => void;
  onScoreSaved: (
    entryId: string,
    hole: HoleNumber,
    strokes: number | null,
    isPickedUp: boolean
  ) => void;
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

  async function saveScore(
    hole: HoleNumber,
    strokes: number | null,
    isPickedUp: boolean
  ) {
    const key = `${player.entryId}-${hole}`;
    setSavingKey(key);
    try {
      const sp = new URLSearchParams(window.location.search);
      const meId = sp.get("me")?.trim() || null;
      const caddieIdParam = sp.get("caddie")?.trim() || null;
      const res = await fetch("/api/captura/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          entry_id: player.entryId,
          hole,
          strokes,
          picked_up: isPickedUp,
          mode: "modify",
          me_entry_id: meId,
          caddie_id: caddieIdParam,
          role: caddieIdParam ? "caddie" : meId ? "player" : null,
        }),
      });
      if (res.ok) {
        onScoreSaved(player.entryId, hole, strokes, isPickedUp);
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
            pickedUp={Boolean(pickedUp?.[h])}
            allowPickup={allowPickup}
            onCommit={(next, opts) =>
              saveScore(h, next, Boolean(opts?.pickedUp))
            }
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
            pickedUp={Boolean(pickedUp?.[h])}
            allowPickup={allowPickup}
            onCommit={(next, opts) =>
              saveScore(h, next, Boolean(opts?.pickedUp))
            }
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

function CloseMatchPrompt({
  groupId,
  resultText,
  onClosed,
  onError,
}: {
  groupId: string;
  resultText: string;
  onClosed: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function doClose() {
    setBusy(true);
    try {
      const res = await fetch("/api/captura/close-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        nextGroupCreated?: boolean;
        nextRoundId?: string | null;
        nextGroupNo?: number | null;
        nextTeeTime?: string | null;
      };
      if (!json.ok) {
        onError(json.error ?? "No se pudo cerrar el match.");
        return;
      }
      const parts: string[] = ["Match cerrado y ganador avanzado al cuadro."];
      if (json.nextGroupCreated) {
        parts.push(
          `Siguiente salida creada: Grupo ${json.nextGroupNo}${
            json.nextTeeTime ? ` · ${json.nextTeeTime}` : ""
          }.`
        );
      } else if (json.message) {
        parts.push(json.message);
      }
      onClosed(parts.join(" "));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="mt-2 rounded-md border border-emerald-300 bg-white px-2 py-2">
        <div className="text-[11px] text-slate-800">
          ¿Cerrar este match con resultado{" "}
          <span className="font-bold">{resultText}</span>? El ganador pasará a
          la siguiente ronda del cuadro y se generará automáticamente la
          salida cuando la otra pareja del bracket esté lista.
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => doClose()}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Cerrando…" : "Sí, cerrar y avanzar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-2 rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700"
    >
      Cerrar match y avanzar ganador →
    </button>
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
  const [pickedUpByEntry, setPickedUpByEntry] = useState<PickedUpByEntry>(() =>
    Object.fromEntries(
      meta.players.map((p) => [p.entryId, { ...(p.pickedUp ?? {}) }])
    )
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [closeFeedback, setCloseFeedback] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);
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
        setPickedUpByEntry((prev) => {
          const next: PickedUpByEntry = { ...prev };
          for (const p of data.players) {
            next[p.entryId] = { ...(p.pickedUp ?? {}) };
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
    strokes: number | null,
    isPickedUp: boolean
  ) {
    setScoresByEntry((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [hole]: isPickedUp ? null : strokes,
      } as HoleScores,
    }));
    setPickedUpByEntry((prev) => {
      const cur = { ...(prev[entryId] ?? {}) };
      if (isPickedUp) cur[hole] = true;
      else delete cur[hole];
      return { ...prev, [entryId]: cur };
    });
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

            {/* CTA de cierre + avance al cuadro */}
            {meta.matchPlay.decidedAtHole != null &&
            meta.matchPlay.matchplayMatchId &&
            !meta.matchPlay.matchplayCompleted ? (
              <CloseMatchPrompt
                groupId={meta.groupId}
                resultText={meta.matchPlay.resultText}
                onClosed={(msg) => {
                  setCloseFeedback({ kind: "ok", message: msg });
                }}
                onError={(msg) => {
                  setCloseFeedback({ kind: "err", message: msg });
                }}
              />
            ) : null}

            {meta.matchPlay.matchplayCompleted ? (
              <div className="mt-2 rounded border border-emerald-300 bg-white/60 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                ✓ Match cerrado en el cuadro. Ganador ya avanzó al siguiente
                partido.
              </div>
            ) : null}

            {closeFeedback ? (
              <div
                className={[
                  "mt-2 rounded border px-2 py-1 text-[11px] font-semibold",
                  closeFeedback.kind === "ok"
                    ? "border-emerald-300 bg-white/60 text-emerald-700"
                    : "border-red-300 bg-white/60 text-red-700",
                ].join(" ")}
              >
                {closeFeedback.message}
              </div>
            ) : null}
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
                      pickedUp={pickedUpByEntry[player.entryId] ?? {}}
                      allowPickup={Boolean(meta.matchPlay)}
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
                        pickedUp={pickedUpByEntry[player.entryId] ?? {}}
                        allowPickup={Boolean(meta.matchPlay)}
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
