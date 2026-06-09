"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  addPlayerToSalida,
  removePlayerFromSalida,
  startAndNotifySalida,
} from "../actions";

export type SalidaPlayer = {
  memberId: string;
  playerId: string;
  name: string;
  handicapIndex: number | null;
  hasTelegram: boolean;
};

export type SalidaRow = {
  groupId: string;
  groupNo: number | null;
  teeTime: string | null;
  startingHole: number | null;
  notes: string | null;
  startedAt: string | null;
  players: SalidaPlayer[];
};

type PlayerSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  club: string | null;
};

function fmtHi(hi: number | null): string {
  if (hi == null) return "S/H";
  return Number(hi).toFixed(1);
}

export default function SalidasClient({
  tournamentId,
  tournamentName,
  roundId,
  roundDate,
  groupSize,
  salidas,
}: {
  tournamentId: string;
  tournamentName: string;
  roundId: string;
  roundDate: string | null;
  groupSize: number;
  clubId: string | null;
  salidas: SalidaRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hideEmpty, setHideEmpty] = useState(true);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const occupied = salidas.filter((s) => s.players.length > 0).length;
  const visible = hideEmpty
    ? salidas.filter((s) => s.players.length > 0)
    : salidas;

  const showFlash = useCallback((kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 5000);
  }, []);

  const handleAdd = (groupId: string, playerId: string) => {
    startTransition(async () => {
      const res = await addPlayerToSalida({ tournamentId, groupId, playerId });
      if (!res.ok) {
        showFlash("err", res.error ?? "No se pudo agregar.");
        return;
      }
      router.refresh();
    });
  };

  const handleRemove = (memberId: string) => {
    startTransition(async () => {
      const res = await removePlayerFromSalida({ tournamentId, memberId });
      if (!res.ok) {
        showFlash("err", res.error ?? "No se pudo quitar.");
        return;
      }
      router.refresh();
    });
  };

  const handleStart = (groupId: string) => {
    startTransition(async () => {
      const res = await startAndNotifySalida({
        tournamentId,
        roundId,
        groupId,
      });
      if (!res.ok) {
        showFlash("err", res.error ?? "No se pudo iniciar.");
        return;
      }
      const sent = res.sent ?? 0;
      const failed = res.failed ?? 0;
      const skipped = res.skipped ?? 0;
      const parts = [`${sent} aviso(s) enviado(s)`];
      if (failed) parts.push(`${failed} fallido(s)`);
      if (skipped) parts.push(`${skipped} sin Telegram`);
      showFlash("ok", `Salida iniciada · ${parts.join(" · ")}`);
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Link
              href="/rondas-diarias"
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              ← Rondas diarias
            </Link>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {tournamentName}
            </h1>
            <p className="text-sm text-slate-500">
              {roundDate ? `Fecha: ${roundDate} · ` : ""}
              {occupied} salida(s) con jugadores · grupos de {groupSize}
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
          Asigna jugadores directo del módulo <strong>Jugadores</strong> (sin
          inscripción). Al tocar <strong>Iniciar y avisar</strong> se marca la
          hora de salida y se manda Telegram a jugadores y caddies con el link
          para capturar scores.
        </div>

        {flash && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ring-1 ${
              flash.kind === "ok"
                ? "bg-emerald-600 text-white ring-emerald-700"
                : "bg-red-600 text-white ring-red-700"
            }`}
          >
            {flash.text}
          </div>
        )}

        {!roundId && (
          <div className="rounded-lg bg-white p-6 text-sm text-red-600 shadow ring-1 ring-slate-200">
            Esta ronda no tiene salidas configuradas. Vuelve a crear la ronda
            del día desde el panel.
          </div>
        )}

        {roundId && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {visible.length} de {salidas.length} salidas
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={hideEmpty}
                  onChange={(e) => setHideEmpty(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Ocultar salidas vacías
              </label>
            </div>

            <div className="space-y-3">
              {visible.map((s) => (
                <SalidaCard
                  key={s.groupId}
                  salida={s}
                  groupSize={groupSize}
                  busy={pending}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  onStart={handleStart}
                />
              ))}
              {visible.length === 0 && (
                <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow ring-1 ring-slate-200">
                  No hay salidas con jugadores. Desactiva «Ocultar salidas
                  vacías» para asignar jugadores a una hora.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SalidaCard({
  salida,
  groupSize,
  busy,
  onAdd,
  onRemove,
  onStart,
}: {
  salida: SalidaRow;
  groupSize: number;
  busy: boolean;
  onAdd: (groupId: string, playerId: string) => void;
  onRemove: (memberId: string) => void;
  onStart: (groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const started = Boolean(salida.startedAt);
  const full = salida.players.length >= groupSize;
  const existingIds = new Set(salida.players.map((p) => p.playerId));

  const runSearch = useCallback((raw: string) => {
    const q = raw.replace(/[%,]/g, "").trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    setOpen(true);
    void (async () => {
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name, handicap_index, club")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order("last_name", { ascending: true })
        .limit(15);
      setResults((data ?? []) as PlayerSearchResult[]);
      setSearching(false);
    })();
  }, []);

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(v), 250);
  };

  const pick = (p: PlayerSearchResult) => {
    onAdd(salida.groupId, p.id);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-900">
            {salida.teeTime ?? "--:--"}
          </span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            Grupo #{salida.groupNo ?? "?"}
          </span>
          {salida.startingHole != null && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Hoyo {salida.startingHole}
            </span>
          )}
          {salida.notes && (
            <span className="text-xs text-slate-400">{salida.notes}</span>
          )}
        </div>
        {started && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            ● En juego
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {salida.players.length === 0 && (
          <p className="text-xs italic text-slate-400">Sin jugadores.</p>
        )}
        {salida.players.map((p, idx) => (
          <div
            key={p.memberId}
            className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
              <span className="w-4 text-right text-xs text-slate-400">
                {idx + 1}
              </span>
              <span className="truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-slate-500">
                HI {fmtHi(p.handicapIndex)}
              </span>
              <span
                title={
                  p.hasTelegram
                    ? "Recibirá Telegram"
                    : "Sin Telegram vinculado"
                }
                className={`shrink-0 text-xs ${
                  p.hasTelegram ? "text-sky-500" : "text-slate-300"
                }`}
              >
                ✈
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(p.memberId)}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      {!full && (
        <div className="relative mt-3">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => query.length >= 2 && setOpen(true)}
            placeholder="Buscar jugador por nombre…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          {open && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {searching && (
                <div className="px-3 py-2 text-xs text-slate-400">
                  Buscando…
                </div>
              )}
              {!searching && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-400">
                  Sin resultados.
                </div>
              )}
              {results.map((r) => {
                const already = existingIds.has(r.id);
                const name =
                  [r.first_name, r.last_name].filter(Boolean).join(" ") ||
                  "(sin nombre)";
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={already || busy}
                    onClick={() => pick(r)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 disabled:opacity-40"
                  >
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {already ? "ya está" : `HI ${fmtHi(r.handicap_index)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {full && (
        <p className="mt-3 text-xs text-amber-600">
          Salida completa ({groupSize} jugadores).
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={busy || salida.players.length === 0}
          onClick={() => onStart(salida.groupId)}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {started ? "Reenviar aviso" : "Iniciar y avisar"}
        </button>
      </div>
    </div>
  );
}
