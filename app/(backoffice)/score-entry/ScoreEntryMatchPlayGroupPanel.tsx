"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GrupoCaptureClient from "@/app/captura/grupo/GrupoCaptureClient";
import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";
import type { GroupCapturePayload } from "@/lib/captura/types";
import {
  closeMatchPlayGroupRoundAction,
  type CloseMatchPlayGroupState,
} from "./actions";

const initial: CloseMatchPlayGroupState = { ok: false, message: "" };

export default function ScoreEntryMatchPlayGroupPanel({
  initialGroup,
  tournamentId,
  anchorEntryId,
  searchQuery,
  currentRoundNo,
}: {
  initialGroup: GroupCapturePayload;
  tournamentId: string;
  anchorEntryId: string;
  searchQuery: string;
  currentRoundNo: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    closeMatchPlayGroupRoundAction,
    initial
  );
  const redirectedRef = useRef(false);
  const hasTelegramReport = Boolean(
    state.telegram &&
      (state.telegram.recipients.length > 0 ||
        state.telegram.skippedNames.length > 0)
  );

  const allLocked = initialGroup.players.every((p) => Boolean(p.lockedAt));
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

  useEffect(() => {
    if (!state.ok || redirectedRef.current) return;
    // Si hay reporte de Telegram, dejamos que el marshal lo lea y luego
    // pulse «Ir a R{n+1}». Solo auto-redirect cuando no hay nada que mostrar.
    if (hasTelegramReport) {
      router.refresh();
      return;
    }
    redirectedRef.current = true;

    if (state.nextRoundNo != null && state.nextRoundNo > currentRoundNo) {
      router.push(
        buildScoreEntryHref({
          tournamentId,
          q: searchQuery,
          entryId: anchorEntryId,
          roundNo: state.nextRoundNo,
        })
      );
    }
    router.refresh();
  }, [
    state.ok,
    state.nextRoundNo,
    currentRoundNo,
    tournamentId,
    searchQuery,
    anchorEntryId,
    hasTelegramReport,
    router,
  ]);

  const nextRoundHref =
    state.ok && state.nextRoundNo != null && state.nextRoundNo > currentRoundNo
      ? buildScoreEntryHref({
          tournamentId,
          q: searchQuery,
          entryId: anchorEntryId,
          roundNo: state.nextRoundNo,
        })
      : null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border-2 border-emerald-400 bg-white shadow-sm">
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-950">
              Captura del grupo · R{currentRoundNo}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              {initialGroup.players.length} jugadores
              {initialGroup.groupNo != null
                ? ` · Grupo ${initialGroup.groupNo}`
                : ""}
              {initialGroup.teeTime ? ` · ${initialGroup.teeTime}` : ""}
            </p>
          </div>
          <form action={action}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="group_id" value={initialGroup.groupId} />
            <input
              type="hidden"
              name="anchor_entry_id"
              value={anchorEntryId}
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          </form>
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
        {state.ok && state.telegram ? (
          <TelegramRecipientsReport telegram={state.telegram} />
        ) : null}
        {nextRoundHref ? (
          <div className="mt-2">
            <Link
              href={nextRoundHref}
              className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Ir a captura R{state.nextRoundNo} →
            </Link>
          </div>
        ) : null}
        {!allLocked ? (
          <p className="mt-2 text-[11px] text-emerald-700">
            Cierra las 4 tarjetas de este grupo y pasa automáticamente a la
            captura de la ronda {nextRoundLabel}.
          </p>
        ) : null}
      </div>

      <GrupoCaptureClient initial={initialGroup} embedded />
    </div>
  );
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
