"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GrupoCaptureClient from "@/app/captura/grupo/GrupoCaptureClient";
import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";
import type { GroupCapturePayload } from "@/lib/captura/types";
import {
  closeMatchPlayGroupRoundAction,
  reopenMatchPlayGroupRoundAction,
  type CloseMatchPlayGroupState,
  type ReopenMatchPlayGroupState,
} from "./actions";

const closeInitial: CloseMatchPlayGroupState = { ok: false, message: "" };
const reopenInitial: ReopenMatchPlayGroupState = { ok: false, message: "" };

export default function ScoreEntryMatchPlayGroupPanel({
  initialGroup,
  tournamentId,
  anchorEntryId,
  searchQuery,
  currentRoundNo,
  mode = "capture",
}: {
  initialGroup: GroupCapturePayload;
  tournamentId: string;
  anchorEntryId: string;
  searchQuery: string;
  currentRoundNo: number;
  mode?: "capture" | "modify";
}) {
  const router = useRouter();
  const isModifyMode = mode === "modify";
  const [state, action, pending] = useActionState(
    closeMatchPlayGroupRoundAction,
    closeInitial
  );
  const [reopenState, reopenAction, reopenPending] = useActionState(
    reopenMatchPlayGroupRoundAction,
    reopenInitial
  );
  const refreshedRef = useRef(false);
  const reopenRefreshedRef = useRef(false);

  const allLocked = initialGroup.players.every((p) => Boolean(p.lockedAt));

  // ¿El grupo ya está completamente capturado? En match play eso significa
  // que el match quedó decidido (o resuelto el desempate). Cuando lo está
  // pero las tarjetas siguen abiertas, mostramos un aviso prominente para
  // cerrar la ronda antes de avanzar.
  const matchDecided =
    initialGroup.matchPlay?.decidedAtHole != null &&
    !initialGroup.matchPlay?.needsPlayoff;
  const fullyCaptured = initialGroup.matchPlay
    ? matchDecided
    : initialGroup.players.every(
        (p) =>
          Object.values(p.scores ?? {}).filter((v) => v != null).length >= 18
      );
  const needsClosePrompt = fullyCaptured && !allLocked;

  const nextRoundLabel = currentRoundNo + 1;
  const buttonLabel = pending
    ? "Cerrando tarjetas…"
    : allLocked
      ? `Abrir captura R${nextRoundLabel} →`
      : `Cerrar todas y abrir R${nextRoundLabel} →`;

  const backHref = buildScoreEntryHref({
    tournamentId,
    q: searchQuery,
    entryId: anchorEntryId,
  });
  const backQs = `&back=${encodeURIComponent(backHref)}`;
  const tarjetaCompletaHref = `/captura/tarjeta?group_id=${initialGroup.groupId}${backQs}`;
  const capturaRapidaHref = `/captura/grupo?group_id=${initialGroup.groupId}${backQs}`;

  // Tras cerrar con éxito NO redirigimos automáticamente: refrescamos los
  // datos del servidor (para reflejar el cierre) y dejamos que el usuario
  // elija cómo capturar la siguiente ronda (tarjeta completa vs rápida).
  useEffect(() => {
    if (!state.ok || refreshedRef.current) return;
    refreshedRef.current = true;
    router.refresh();
  }, [state.ok, router]);

  useEffect(() => {
    if (!reopenState.ok || reopenRefreshedRef.current) return;
    reopenRefreshedRef.current = true;
    router.refresh();
  }, [reopenState.ok, router]);

  const showEliminatedNotice =
    (state.ok && state.eliminated) ||
    (allLocked &&
      matchDecided &&
      initialGroup.matchPlay?.matchplayCompleted &&
      isAnchorEliminatedPreview(initialGroup, anchorEntryId));

  const showNextRoundChoice =
    !showEliminatedNotice &&
    state.ok &&
    state.nextRoundNo != null &&
    state.nextRoundNo > currentRoundNo;

  const showReopenControl =
    isModifyMode || allLocked || Boolean(state.ok && !state.eliminated);

  // Destino de la siguiente ronda. Si ya existe el grupo, enlazamos directo
  // a la captura del grupo; si no (la salida se crea cuando el rival
  // termine), volvemos a score-entry de la ronda siguiente.
  const nextGroupId = state.nextGroupId?.trim() || null;
  const nextBackHref = buildScoreEntryHref({
    tournamentId,
    q: searchQuery,
    entryId: anchorEntryId,
    roundNo: state.nextRoundNo ?? null,
  });
  const nextBackQs = `&back=${encodeURIComponent(nextBackHref)}`;
  const nextTarjetaHref = nextGroupId
    ? `/captura/tarjeta?group_id=${nextGroupId}${nextBackQs}`
    : null;
  const nextRapidaHref = nextGroupId
    ? `/captura/grupo?group_id=${nextGroupId}${nextBackQs}`
    : null;
  const nextScoreEntryHref = nextBackHref;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border-2 border-emerald-400 bg-white shadow-sm">
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-950">
              Captura del grupo · R{currentRoundNo}
              {initialGroup.bracketRoundLabel
                ? ` · ${initialGroup.bracketRoundLabel}`
                : ""}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              {initialGroup.players.length} jugadores
              {initialGroup.groupNo != null
                ? ` · Grupo ${initialGroup.groupNo}`
                : ""}
              {initialGroup.teeTime ? ` · ${initialGroup.teeTime}` : ""}
            </p>
          </div>
          {!isModifyMode ? (
            <form action={action}>
              <input type="hidden" name="tournament_id" value={tournamentId} />
              <input
                type="hidden"
                name="group_id"
                value={initialGroup.groupId}
              />
              <input
                type="hidden"
                name="anchor_entry_id"
                value={anchorEntryId}
              />
              <button
                type="submit"
                disabled={pending || reopenPending}
                className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buttonLabel}
              </button>
            </form>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <Link
            href={tarjetaCompletaHref}
            className="inline-flex items-center justify-center rounded-md border-2 border-emerald-600 bg-white px-3 py-1.5 font-bold text-emerald-900 hover:bg-emerald-50"
          >
            Tarjeta completa (hoyo por hoyo) →
          </Link>
          <Link
            href={capturaRapidaHref}
            className="inline-flex items-center justify-center rounded-md border border-emerald-400 bg-white px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-50"
          >
            Captura rápida (pantalla completa) →
          </Link>
        </div>
        {state.message ? (
          <p
            className={`mt-2 text-xs font-medium ${state.ok ? "text-emerald-800" : "text-red-700"}`}
          >
            {state.message}
          </p>
        ) : null}

        {showEliminatedNotice ? (
          <EliminatedFromTournamentNotice
            names={
              state.eliminatedPlayerNames?.length
                ? state.eliminatedPlayerNames
                : initialGroup.players
                    .filter((p) => p.entryId === anchorEntryId)
                    .map((p) => p.name)
            }
          />
        ) : null}

        {state.ok && state.telegram ? (
          <TelegramRecipientsReport telegram={state.telegram} />
        ) : null}

        {showReopenControl ? (
          <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5">
            <p className="text-xs font-bold text-orange-950">
              {isModifyMode
                ? "Corregir tarjetas del grupo"
                : "¿Hubo un error en el resultado?"}
            </p>
            <p className="mt-0.5 text-[11px] text-orange-900">
              Abre las 4 tarjetas, revierte el avance en el cuadro y elimina la
              salida auto-generada de la ronda siguiente. Al corregir y volver a
              cerrar, se regeneran grupos y captura rápida.
            </p>
            <form action={reopenAction} className="mt-2">
              <input type="hidden" name="tournament_id" value={tournamentId} />
              <input
                type="hidden"
                name="group_id"
                value={initialGroup.groupId}
              />
              <button
                type="submit"
                disabled={reopenPending || pending}
                className="rounded-md border-2 border-orange-700 bg-orange-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {reopenPending
                  ? "Abriendo tarjetas…"
                  : "Abrir tarjetas y corregir →"}
              </button>
            </form>
            {reopenState.message ? (
              <p
                className={`mt-2 text-[11px] font-medium ${reopenState.ok ? "text-orange-900" : "text-red-700"}`}
              >
                {reopenState.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Tras cerrar: el usuario elige cómo capturar la siguiente ronda. */}
        {showNextRoundChoice ? (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-2.5">
            <p className="text-xs font-bold text-emerald-950">
              R{currentRoundNo} cerrada. ¿Cómo quieres capturar la R
              {state.nextRoundNo}?
            </p>
            {nextGroupId ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <Link
                  href={nextTarjetaHref!}
                  className="inline-flex items-center justify-center rounded-md border-2 border-emerald-600 bg-white px-3 py-1.5 font-bold text-emerald-900 hover:bg-emerald-50"
                >
                  Tarjeta completa (hoyo por hoyo) →
                </Link>
                <Link
                  href={nextRapidaHref!}
                  className="inline-flex items-center justify-center rounded-md border border-emerald-400 bg-white px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  Captura rápida (pantalla completa) →
                </Link>
              </div>
            ) : (
              <div className="mt-2">
                <Link
                  href={nextScoreEntryHref}
                  className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800"
                >
                  Ir a captura R{state.nextRoundNo} →
                </Link>
                <p className="mt-1 text-[11px] text-emerald-700">
                  La salida del grupo de la R{state.nextRoundNo} se crea cuando
                  el rival también cierre su partido.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Aviso prominente: ronda totalmente capturada pero sin cerrar. */}
        {!state.ok && needsClosePrompt ? (
          <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-bold text-amber-950">
              Esta ronda ya está capturada.
            </p>
            <p className="mt-0.5 text-[11px] text-amber-900">
              Ciérrala con el botón «Cerrar todas y abrir R{nextRoundLabel}»
              de arriba antes de pasar a la siguiente ronda. Mientras no se
              cierre, no se publica en el leaderboard oficial ni se genera la
              salida del rival.
            </p>
          </div>
        ) : null}

        {!state.ok && !needsClosePrompt && !allLocked ? (
          <p className="mt-2 text-[11px] text-emerald-700">
            Captura las 4 tarjetas; al terminar pulsa «Cerrar todas y abrir R
            {nextRoundLabel}».
          </p>
        ) : null}
      </div>

      <GrupoCaptureClient initial={initialGroup} embedded />
    </div>
  );
}

function EliminatedFromTournamentNotice({ names }: { names: string[] }) {
  const label =
    names.length > 0 ? names.join(" y ") : "Jugador eliminado del torneo";
  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border-2 border-red-500 bg-red-50 px-3 py-3"
    >
      <p className="text-sm font-bold text-red-950">
        Jugador eliminado del torneo
      </p>
      <p className="mt-1 text-xs text-red-900">
        <span className="font-semibold">{label}</span> quedó fuera tras perder
        el match. La ronda quedó cerrada; no hay captura de ronda siguiente para
        esta pareja.
      </p>
    </div>
  );
}

/** Vista previa: anchor en pareja perdedora con match ya cerrado en cuadro. */
function isAnchorEliminatedPreview(
  group: GroupCapturePayload,
  anchorEntryId: string
): boolean {
  const mp = group.matchPlay;
  if (!mp?.matchplayCompleted || mp.decidedAtHole == null) return false;
  const prog = mp.progression;
  if (!prog?.length) return false;
  const last = prog[prog.length - 1]!;
  const topWins = last.top_cum > last.bottom_cum;
  const bottomWins = last.bottom_cum > last.top_cum;
  if (!topWins && !bottomWins) return false;
  const anchorIndex = group.players.findIndex(
    (p) => p.entryId === anchorEntryId
  );
  if (anchorIndex < 0) return false;
  const anchorIsTop = anchorIndex < 2;
  if (anchorIsTop && bottomWins) return true;
  if (!anchorIsTop && topWins) return true;
  return false;
}

function TelegramRecipientsReport({
  telegram,
}: {
  telegram: NonNullable<CloseMatchPlayGroupState["telegram"]>;
}) {
  const sentRecipients = telegram.recipients.filter((r) => r.ok);
  const failedRecipients = telegram.recipients.filter((r) => !r.ok);

  if (
    sentRecipients.length === 0 &&
    failedRecipients.length === 0 &&
    telegram.skippedNames.length === 0
  ) {
    return (
      <p className="mt-2 text-[11px] text-emerald-700">
        Telegram: nadie en este grupo tiene chat vinculado al bot.
      </p>
    );
  }

  const replacedTotal = telegram.recipients.reduce(
    (acc, r) => acc + (r.replacedPrevious || 0),
    0
  );

  return (
    <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-[11px] text-sky-950">
      <p className="text-xs font-bold text-sky-900">
        Notificaciones de Telegram
      </p>
      <p className="mt-0.5 text-[11px] text-sky-800">
        Enviadas {telegram.sent} · Fallaron {telegram.failed} · Sin chat{" "}
        {telegram.skipped}
        {replacedTotal > 0
          ? ` · Mensajes previos borrados: ${replacedTotal}`
          : ""}
      </p>

      {sentRecipients.length > 0 ? (
        <div className="mt-1.5">
          <p className="text-[11px] font-semibold text-emerald-800">
            Enviado a:
          </p>
          <ul className="mt-0.5 list-disc pl-4">
            {sentRecipients.map((r, i) => (
              <li key={`s-${i}`} className="text-[11px] text-emerald-900">
                {r.name}{" "}
                <span className="text-[10px] text-emerald-700">
                  ({r.role === "player" ? "jugador" : "caddie"}
                  {r.replacedPrevious > 0
                    ? `, reemplaza ${r.replacedPrevious} mensaje${r.replacedPrevious === 1 ? "" : "s"} previo${r.replacedPrevious === 1 ? "" : "s"}`
                    : ""}
                  )
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failedRecipients.length > 0 ? (
        <div className="mt-1.5">
          <p className="text-[11px] font-semibold text-red-800">
            No se pudo entregar:
          </p>
          <ul className="mt-0.5 list-disc pl-4">
            {failedRecipients.map((r, i) => (
              <li key={`f-${i}`} className="text-[11px] text-red-900">
                {r.name}{" "}
                <span className="text-[10px] text-red-700">
                  ({r.role === "player" ? "jugador" : "caddie"}
                  {r.error ? `: ${r.error}` : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {telegram.skippedNames.length > 0 ? (
        <div className="mt-1.5">
          <p className="text-[11px] font-semibold text-amber-800">
            Sin Telegram vinculado:
          </p>
          <ul className="mt-0.5 list-disc pl-4">
            {telegram.skippedNames.map((r, i) => (
              <li key={`k-${i}`} className="text-[11px] text-amber-900">
                {r.name}{" "}
                <span className="text-[10px] text-amber-700">
                  ({r.role === "player" ? "jugador" : "caddie"})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
