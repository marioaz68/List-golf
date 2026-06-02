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
    router,
  ]);

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
