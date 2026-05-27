"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getScoreClass,
  HOLES_BACK,
  HOLES_FRONT,
  PAR_BY_HOLE,
} from "@/lib/captura/loadGroupCapture";
import type {
  GroupCapturePayload,
  GroupCapturePlayer,
  HoleNumber,
  HoleScores,
} from "@/lib/captura/types";

type ActiveCell = { entryId: string; hole: HoleNumber };

function scoresFromPlayers(players: GroupCapturePlayer[]): Record<string, HoleScores> {
  const map: Record<string, HoleScores> = {};
  for (const p of players) {
    map[p.entryId] = { ...p.scores };
  }
  return map;
}

function Section({
  title,
  holes,
  players,
  scoresByEntry,
  activeCell,
  savingKey,
  onCellTap,
}: {
  title: string;
  holes: HoleNumber[];
  players: GroupCapturePlayer[];
  scoresByEntry: Record<string, HoleScores>;
  activeCell: ActiveCell | null;
  savingKey: string | null;
  onCellTap: (entryId: string, hole: HoleNumber) => void;
}) {
  return (
    <div className="rounded-lg bg-white p-2 shadow-sm">
      <div className="mb-1 text-[11px] font-bold tracking-[0.04em] text-slate-500">
        {title}
      </div>
      <div className="overflow-hidden rounded">
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className="bg-[#0d2747] text-white">
              <th className="w-10 px-1 py-1 text-left font-bold">H</th>
              {holes.map((hole) => (
                <th key={hole} className="px-0 py-1 text-center font-bold">
                  {hole}
                </th>
              ))}
              <th className="w-8 px-0 py-1 text-center font-bold">TOT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-300 bg-slate-100">
              <td className="px-1 py-1 font-bold text-slate-800">PAR</td>
              {holes.map((hole) => (
                <td
                  key={`par-${title}-${hole}`}
                  className="px-0 py-1 text-center text-slate-800"
                >
                  {PAR_BY_HOLE[hole]}
                </td>
              ))}
              <td className="px-0 py-1 text-center font-bold text-slate-800">
                {holes.reduce((acc, hole) => acc + PAR_BY_HOLE[hole], 0)}
              </td>
            </tr>
            {players.map((player) => {
              const scores = scoresByEntry[player.entryId] ?? player.scores;
              const total = holes.reduce(
                (acc, hole) => acc + (scores[hole] ?? 0),
                0
              );
              return (
                <tr
                  key={player.entryId}
                  className="border-b border-slate-300 last:border-b-0"
                >
                  <td className="px-1 py-2 font-bold text-slate-900">
                    {player.initials}
                  </td>
                  {holes.map((hole) => {
                    const val = scores[hole];
                    const isActive =
                      activeCell?.entryId === player.entryId &&
                      activeCell.hole === hole;
                    const key = `${player.entryId}-${hole}`;
                    const isSaving = savingKey === key;
                    return (
                      <td key={key} className="px-0 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => onCellTap(player.entryId, hole)}
                          className={[
                            "inline-flex h-6 w-6 items-center justify-center text-[10px] font-bold text-slate-900",
                            getScoreClass(val, PAR_BY_HOLE[hole]),
                            isActive ? "ring-2 ring-sky-500 ring-offset-1" : "",
                            isSaving ? "opacity-60" : "",
                          ].join(" ")}
                        >
                          {val ?? ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-0 py-1 text-center font-bold text-slate-900">
                    {total > 0 ? total : ""}
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

export default function TarjetaCaptureClient({
  initial,
}: {
  initial: GroupCapturePayload;
}) {
  const [meta, setMeta] = useState(initial);
  const [scoresByEntry, setScoresByEntry] = useState(() =>
    scoresFromPlayers(initial.players)
  );
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const activeCellRef = useRef<ActiveCell | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    activeCellRef.current = activeCell;
  }, [activeCell]);

  const refresh = useCallback(async () => {
    if (savingRef.current) return;
    try {
      const res = await fetch(
        `/api/captura/group?group_id=${encodeURIComponent(initial.groupId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: GroupCapturePayload;
      };
      if (!json.ok || !json.data) return;
      setMeta(json.data);
      const remote = scoresFromPlayers(json.data.players);
      setScoresByEntry((prev) => {
        const next = { ...prev };
        const editing = activeCellRef.current;
        for (const p of json.data!.players) {
          const entryId = p.entryId;
          if (!next[entryId]) next[entryId] = { ...p.scores };
          for (const h of [...HOLES_FRONT, ...HOLES_BACK]) {
            if (editing?.entryId === entryId && editing.hole === h) continue;
            next[entryId][h] = remote[entryId]?.[h] ?? null;
          }
        }
        return next;
      });
      setSyncHint(
        new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch {
      // polling silencioso
    }
  }, [initial.groupId]);

  useEffect(() => {
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const activePlayer = activeCell
    ? meta.players.find((p) => p.entryId === activeCell.entryId)
    : null;

  async function persistScore(
    entryId: string,
    hole: HoleNumber,
    strokes: number | null
  ) {
    const key = `${entryId}-${hole}`;
    setSavingKey(key);
    savingRef.current = true;
    setSaveError(null);

    setScoresByEntry((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [hole]: strokes,
      },
    }));

    try {
      const res = await fetch("/api/captura/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: meta.groupId,
          entry_id: entryId,
          hole,
          strokes,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setSaveError(json.error ?? "No se pudo guardar.");
        await refresh();
      }
    } catch {
      setSaveError("Error de red al guardar.");
    } finally {
      setSavingKey(null);
      savingRef.current = false;
    }
  }

  function pickScore(strokes: number | null) {
    if (!activeCell) return;
    void persistScore(activeCell.entryId, activeCell.hole, strokes);
    setActiveCell(null);
  }

  const mobileUrl = `/score-entry/mobile?group_id=${encodeURIComponent(meta.groupId)}`;

  return (
    <div className="w-full bg-slate-100">
      <div className="flex w-full justify-center bg-slate-100">
        <div className="w-full max-w-[390px] bg-slate-100 pb-28">
          <div className="bg-black px-2 py-2 text-white">
            <div className="text-sm font-semibold">List.golf</div>
            <div className="text-[10px] opacity-70">
              Captura grupal · tiempo real
            </div>
          </div>

          <div className="space-y-2 p-2">
            <div className="rounded-lg bg-white p-2 text-center text-[11px] shadow-sm">
              {meta.tournamentName ? (
                <div className="font-semibold text-slate-900">
                  {meta.tournamentName}
                </div>
              ) : null}
              <div className="text-slate-600">
                Grupo #{meta.groupNo ?? "?"}
                {meta.startingHole != null ? ` · Salida hoyo ${meta.startingHole}` : ""}
                {meta.teeTime ? ` · ${meta.teeTime}` : ""}
              </div>
              {syncHint ? (
                <div className="mt-1 text-[10px] text-emerald-700">
                  Sincronizado {syncHint}
                </div>
              ) : null}
              <p className="mt-1 text-[10px] text-slate-500">
                Toca un score para anotar. Todos en el grupo ven los cambios al
                instante.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link
                  href={mobileUrl}
                  className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-900"
                >
                  Anotar por hoyo
                </Link>
              </div>
            </div>

            {saveError ? (
              <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                {saveError}
              </div>
            ) : null}

            {meta.players.length === 0 ? (
              <div className="rounded-lg bg-white p-3 text-center text-[11px] text-slate-500 shadow-sm">
                No hay jugadores en este grupo.
              </div>
            ) : (
              <>
                <Section
                  title="FRONT 9"
                  holes={HOLES_FRONT}
                  players={meta.players}
                  scoresByEntry={scoresByEntry}
                  activeCell={activeCell}
                  savingKey={savingKey}
                  onCellTap={(entryId, hole) => setActiveCell({ entryId, hole })}
                />
                <Section
                  title="BACK 9"
                  holes={HOLES_BACK}
                  players={meta.players}
                  scoresByEntry={scoresByEntry}
                  activeCell={activeCell}
                  savingKey={savingKey}
                  onCellTap={(entryId, hole) => setActiveCell({ entryId, hole })}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {activeCell && activePlayer ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white px-2 pb-3 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
          <div className="mx-auto max-w-[390px]">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                {activePlayer.initials} · Hoyo {activeCell.hole} (Par{" "}
                {PAR_BY_HOLE[activeCell.hole]})
              </span>
              <button
                type="button"
                onClick={() => setActiveCell(null)}
                className="text-slate-500"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickScore(n)}
                  className="h-10 rounded-lg bg-slate-900 text-sm font-bold text-white"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickScore(PAR_BY_HOLE[activeCell.hole])}
                className="h-10 rounded-lg border-2 border-slate-800 text-sm font-bold text-slate-900"
              >
                Par
              </button>
              <button
                type="button"
                onClick={() => pickScore(null)}
                className="col-span-2 h-10 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
