"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  deleteClosestToPinPrize,
  saveClosestToPinPrize,
  type SaveCercanosPremiosState,
} from "./actions";
import type { ClosestToPinPrize } from "@/lib/cercanos/loadPrizes";
import { prizeText } from "@/lib/cercanos/loadPrizes";
import { CLOSEST_TO_PIN_MAX_PRIZES } from "@/lib/cercanos/types";

const initial: SaveCercanosPremiosState = { ok: false, message: "" };

type Props = {
  tournamentId: string;
  tournamentName: string;
  par3Holes: number[];
  prizes: ClosestToPinPrize[];
};

export default function CercanosPremiosClient({
  tournamentId,
  tournamentName,
  par3Holes,
  prizes,
}: Props) {
  const [state, formAction, pending] = useActionState(
    saveClosestToPinPrize,
    initial
  );
  const [edit, setEdit] = useState<ClosestToPinPrize | null>(null);

  if (par3Holes.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-amber-100">
        No hay pares 3 en la tarjeta del torneo. Configura los hoyos (par) en{" "}
        <strong>Hoyos torneo</strong>.
      </div>
    );
  }

  const byHole = new Map<number, ClosestToPinPrize[]>();
  for (const h of par3Holes) byHole.set(h, []);
  for (const p of prizes) {
    const list = byHole.get(p.holeNumber) ?? [];
    list.push(p);
    byHole.set(p.holeNumber, list);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">
            Premios · más cerca de la bandera
          </h1>
          <p className="mt-1 text-sm text-slate-300">{tournamentName}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Alta de premios por par 3 y lugar (1.º = más cercano, hasta{" "}
            {CLOSEST_TO_PIN_MAX_PRIZES}). Se muestran en la página pública.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/cercanos?tournament_id=${tournamentId}`}
            className="rounded-lg border border-cyan-400/40 bg-cyan-950/40 px-3 py-2 text-xs font-bold text-cyan-100"
          >
            → Captura distancias
          </Link>
          <Link
            href={`/torneos/${tournamentId}/cercanos`}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200"
            target="_blank"
          >
            Ver público
          </Link>
        </div>
      </header>

      <form
        action={formAction}
        className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
      >
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="prize_id" value={edit?.id ?? ""} />
        <input type="hidden" name="is_active" value="1" />

        <div className="text-sm font-bold text-cyan-200">
          {edit ? "Editar premio" : "Dar de alta premio"}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-300">
            Par 3
            <select
              name="hole_number"
              key={`h-${edit?.id ?? "new"}`}
              defaultValue={edit?.holeNumber ?? par3Holes[0]}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-white"
              required
            >
              {par3Holes.map((h) => (
                <option key={h} value={h}>
                  Hoyo {h}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-300">
            Lugar (1 = más cercano)
            <select
              name="prize_position"
              key={`p-${edit?.id ?? "new"}`}
              defaultValue={edit?.prizePosition ?? 1}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-white"
              required
            >
              {Array.from(
                { length: CLOSEST_TO_PIN_MAX_PRIZES },
                (_, i) => i + 1
              ).map((pos) => (
                <option key={pos} value={pos}>
                  {pos}º
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs font-semibold text-slate-300">
          Premio *
          <input
            name="prize_label"
            key={`l-${edit?.id ?? "new"}`}
            defaultValue={edit?.prizeLabel ?? ""}
            placeholder="Ej. Set de hierros · Gift card $2,000 · Caja de pelotas"
            required
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-300">
          Patrocinador (opcional)
          <input
            name="sponsor"
            key={`s-${edit?.id ?? "new"}`}
            defaultValue={edit?.sponsor ?? ""}
            placeholder="Ej. Casa de pro shop"
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="block text-xs font-semibold text-slate-300">
          Notas (opcional)
          <input
            name="notes"
            key={`n-${edit?.id ?? "new"}`}
            defaultValue={edit?.notes ?? ""}
            placeholder="Condiciones, talla, color…"
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg border border-cyan-400 bg-gradient-to-b from-cyan-400 to-cyan-600 px-4 py-2 text-sm font-bold text-[#08111f] disabled:opacity-50"
          >
            {pending
              ? "Guardando…"
              : edit
                ? "Guardar cambios"
                : "Alta de premio"}
          </button>
          {edit ? (
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="min-h-10 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200"
            >
              Cancelar edición
            </button>
          ) : null}
          {state.message ? (
            <span
              className={`text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </form>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
          Premios por hoyo
        </h2>
        {par3Holes.map((hole) => {
          const list = (byHole.get(hole) ?? [])
            .slice()
            .sort((a, b) => a.prizePosition - b.prizePosition);
          return (
            <div
              key={hole}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <div className="border-b border-white/10 bg-emerald-950/40 px-4 py-2 text-sm font-bold text-white">
                Hoyo {hole}
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  {list.length} premio{list.length === 1 ? "" : "s"}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">
                  Sin premios dados de alta en este hoyo.
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {list.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 px-4 py-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-xs font-black text-amber-200">
                        {p.prizePosition}º
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">
                          {prizeText(p)}
                        </div>
                        {p.notes ? (
                          <div className="text-[11px] text-slate-500">
                            {p.notes}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEdit(p)}
                          className="rounded border border-white/15 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10"
                        >
                          Editar
                        </button>
                        <form action={deleteClosestToPinPrize}>
                          <input
                            type="hidden"
                            name="tournament_id"
                            value={tournamentId}
                          />
                          <input type="hidden" name="prize_id" value={p.id} />
                          <button
                            type="submit"
                            className="rounded border border-rose-400/30 px-2 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-950/40"
                            onClick={(e) => {
                              if (
                                !confirm(
                                  `¿Borrar premio ${p.prizePosition}º del hoyo ${p.holeNumber}?`
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            Borrar
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
