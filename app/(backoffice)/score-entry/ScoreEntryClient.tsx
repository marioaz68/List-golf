"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { savePlayerScores, type SaveScoresState } from "./actions";

type Hole = {
  hole_number: number;
  par: number;
  handicap_index: number;
};

type PlayerLite = {
  id: string;
  player_number: number | null;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  handicap_torneo?: number | null;
};

type ExistingScores = Record<number, number>;

type CapturedRound = {
  round_id: string;
  round_no: number;
  round_date: string | null;
  scores: Record<number, number>;
};

const initialSaveState: SaveScoresState = {
  ok: false,
  message: "",
};

function sumByHoles(
  holes: Hole[],
  values: Record<number, string | number | undefined>
) {
  return holes.reduce((acc, h) => acc + Number(values[h.hole_number] || 0), 0);
}

export default function ScoreEntryClient({
  roundId,
  tournamentDayId,
  player,
  holes,
  existingScores,
  capturedRounds,
  selectedRoundNo,
}: {
  roundId: string;
  tournamentDayId?: string | null;
  player: PlayerLite | null;
  holes: Hole[];
  existingScores: ExistingScores;
  capturedRounds: CapturedRound[];
  selectedRoundNo: number;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const holeIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    holes.forEach((h, idx) => map.set(h.hole_number, idx));
    return map;
  }, [holes]);

  const frontHoles = useMemo(
    () => holes.filter((h) => h.hole_number <= 9),
    [holes]
  );
  const backHoles = useMemo(
    () => holes.filter((h) => h.hole_number >= 10),
    [holes]
  );

  const [scores, setScores] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const h of holes) {
      init[h.hole_number] =
        existingScores[h.hole_number] != null
          ? String(existingScores[h.hole_number])
          : "";
    }
    return init;
  });

  const [activeIndex, setActiveIndex] = useState(0);

  const [saveState, formAction, isPending] = useActionState(
    savePlayerScores,
    initialSaveState
  );

  const playerName = useMemo(() => {
    if (!player) return "";
    return [player.first_name ?? "", player.last_name ?? ""].join(" ").trim();
  }, [player]);

  const playerHcp = player?.handicap_torneo ?? player?.handicap_index ?? null;

  function findFirstEmptyIndex(nextScores: Record<number, string>) {
    for (let i = 0; i < holes.length; i++) {
      const holeNo = holes[i]?.hole_number;
      if (!holeNo) continue;
      if (!String(nextScores[holeNo] ?? "").trim()) return i;
    }
    return 0;
  }

  function focusIndex(index: number) {
    if (index < 0 || index >= holes.length) return;
    const el = inputRefs.current[index];
    if (!el) return;

    setActiveIndex(index);
    el.focus();
    el.select();
  }

  function moveTo(index: number) {
    focusIndex(index);
  }

  function setHoleValue(holeNumber: number, value: string) {
    setScores((prev) => ({
      ...prev,
      [holeNumber]: value,
    }));
  }

  useEffect(() => {
    const init: Record<number, string> = {};
    for (const h of holes) {
      init[h.hole_number] =
        existingScores[h.hole_number] != null
          ? String(existingScores[h.hole_number])
          : "";
    }

    setScores(init);

    const firstEmpty = findFirstEmptyIndex(init);
    setActiveIndex(firstEmpty);

    window.setTimeout(() => {
      focusIndex(firstEmpty);
    }, 0);
  }, [holes, existingScores, player?.id, roundId]);

  useEffect(() => {
    if (!saveState.ok || !saveState.message) return;

    window.setTimeout(() => {
      focusIndex(findFirstEmptyIndex(scores));
    }, 50);
  }, [saveState.ok, saveState.message]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(
    holeNumber: number,
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const raw = e.target.value;

    if (raw === "") {
      setHoleValue(holeNumber, "");
      return;
    }

    const cleaned = raw.replace(/[^\d]/g, "");

    if (!cleaned) {
      setHoleValue(holeNumber, "");
      return;
    }

    const n = Number(cleaned);

    if (!Number.isFinite(n) || n < 1) {
      setHoleValue(holeNumber, "");
      return;
    }

    if (n > 15) {
      setHoleValue(holeNumber, "15");
      window.setTimeout(() => moveTo(index + 1), 0);
      return;
    }

    setHoleValue(holeNumber, String(n));

    const shouldAdvance =
      cleaned.length >= 2 || (cleaned.length === 1 && n >= 1 && n <= 9);

    if (shouldAdvance) {
      window.setTimeout(() => moveTo(index + 1), 0);
    }
  }

  function handleKeyDown(
    holeNumber: number,
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) {
    const input = e.currentTarget;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }

    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      moveTo(index + 1);
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveTo(index - 1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(Math.min(index + 9, holes.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(Math.max(index - 9, 0));
      return;
    }

    if (e.key === "Backspace" && !input.value) {
      e.preventDefault();
      moveTo(index - 1);
      return;
    }

    if (e.key === "Delete" || e.key === "Escape") {
      e.preventDefault();
      setHoleValue(holeNumber, "");
    }
  }

  const front9 = useMemo(() => sumByHoles(frontHoles, scores), [frontHoles, scores]);
  const back9 = useMemo(() => sumByHoles(backHoles, scores), [backHoles, scores]);
  const total = front9 + back9;

  function renderInputCell(h: Hole) {
    const idx = holeIndexMap.get(h.hole_number) ?? 0;

    return (
      <td
        key={`input-${h.hole_number}`}
        className="border-b border-gray-100 px-0.5 py-1 text-center"
      >
        <input
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={scores[h.hole_number] ?? ""}
          onFocus={() => setActiveIndex(idx)}
          onClick={() => setActiveIndex(idx)}
          onChange={(e) => handleChange(h.hole_number, idx, e)}
          onKeyDown={(e) => handleKeyDown(h.hole_number, idx, e)}
          className={`h-8 w-full min-w-0 rounded border bg-white px-0 py-0 text-center text-xs text-black outline-none ${
            activeIndex === idx
              ? "border-green-600 ring-2 ring-green-200"
              : "border-gray-300 focus:border-green-600"
          }`}
        />
      </td>
    );
  }

  if (!player?.id) {
    return (
      <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
        El jugador ya no existe o ya no está disponible para captura.
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="player_id" value={player.id} />
      <input type="hidden" name="tournament_day_id" value={tournamentDayId ?? ""} />

      {holes.map((h) => (
        <input
          key={`hidden-${h.hole_number}`}
          type="hidden"
          name={`hole_${h.hole_number}`}
          value={scores[h.hole_number] ?? ""}
          readOnly
        />
      ))}

      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
          <div className="font-semibold text-black">
            #{player.player_number ?? "-"} · {playerName || "Jugador sin nombre"}
          </div>
          <div className="text-gray-600">HCP: {playerHcp ?? "-"}</div>
          <div className="text-gray-500">
            Celda activa: hoyo {holes[activeIndex]?.hole_number ?? "-"}
          </div>
          <div className="rounded bg-green-100 px-2 py-0.5 text-green-800">
            Capturando R{selectedRoundNo}
          </div>
          <div className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
            Guardar: Cmd/Ctrl + S
          </div>
        </div>
      </div>

      {capturedRounds.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-gray-800">
            Rondas capturadas
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[10px] text-black md:text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-16 border-b border-gray-200 px-1 py-1 text-left font-semibold">
                    RONDA
                  </th>

                  {frontHoles.map((h) => (
                    <th
                      key={`capt-front-${h.hole_number}`}
                      className="border-b border-gray-200 px-0.5 py-1 text-center font-semibold"
                    >
                      {h.hole_number}
                    </th>
                  ))}

                  <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                    F9
                  </th>

                  {backHoles.map((h) => (
                    <th
                      key={`capt-back-${h.hole_number}`}
                      className="border-b border-gray-200 px-0.5 py-1 text-center font-semibold"
                    >
                      {h.hole_number}
                    </th>
                  ))}

                  <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                    B9
                  </th>
                  <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                    TOT
                  </th>
                </tr>
              </thead>

              <tbody>
                {capturedRounds.map((r) => {
                  const rowFront9 = sumByHoles(frontHoles, r.scores);
                  const rowBack9 = sumByHoles(backHoles, r.scores);
                  const rowTotal = rowFront9 + rowBack9;

                  return (
                    <tr
                      key={r.round_id}
                      className={r.round_no === selectedRoundNo ? "bg-green-50" : "bg-white"}
                    >
                      <td className="border-b border-gray-100 px-1 py-1 text-left font-semibold">
                        R{r.round_no}
                      </td>

                      {frontHoles.map((h) => (
                        <td
                          key={`${r.round_id}-front-${h.hole_number}`}
                          className="border-b border-gray-100 px-0.5 py-1 text-center"
                        >
                          {r.scores[h.hole_number] ?? ""}
                        </td>
                      ))}

                      <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                        {rowFront9 || ""}
                      </td>

                      {backHoles.map((h) => (
                        <td
                          key={`${r.round_id}-back-${h.hole_number}`}
                          className="border-b border-gray-100 px-0.5 py-1 text-center"
                        >
                          {r.scores[h.hole_number] ?? ""}
                        </td>
                      ))}

                      <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                        {rowBack9 || ""}
                      </td>
                      <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                        {rowTotal || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        <table className="w-full table-fixed border-collapse text-[10px] text-black md:text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="w-12 border-b border-gray-200 px-1 py-1 text-left font-semibold">
                VENT
              </th>

              {frontHoles.map((h) => (
                <th
                  key={`hcp-front-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center text-[9px] text-gray-700"
                >
                  {h.handicap_index}
                </th>
              ))}

              <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                F9
              </th>

              {backHoles.map((h) => (
                <th
                  key={`hcp-back-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center text-[9px] text-gray-700"
                >
                  {h.handicap_index}
                </th>
              ))}

              <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                B9
              </th>
              <th className="w-14 border-b border-gray-200 px-1 py-1 text-center font-semibold">
                TOT
              </th>
            </tr>

            <tr className="bg-gray-50">
              <th className="w-12 border-b border-gray-200 px-1 py-1 text-left font-semibold">
                HOYO
              </th>

              {frontHoles.map((h) => (
                <th
                  key={`hole-front-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center font-semibold"
                >
                  {h.hole_number}
                </th>
              ))}

              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                F9
              </th>

              {backHoles.map((h) => (
                <th
                  key={`hole-back-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center font-semibold"
                >
                  {h.hole_number}
                </th>
              ))}

              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                B9
              </th>
              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                TOT
              </th>
            </tr>

            <tr className="bg-gray-50">
              <th className="w-12 border-b border-gray-200 px-1 py-1 text-left font-semibold">
                PAR
              </th>

              {frontHoles.map((h) => (
                <th
                  key={`par-front-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center text-[9px] text-gray-700"
                >
                  {h.par}
                </th>
              ))}

              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                {sumByHoles(
                  frontHoles,
                  Object.fromEntries(frontHoles.map((h) => [h.hole_number, h.par]))
                )}
              </th>

              {backHoles.map((h) => (
                <th
                  key={`par-back-${h.hole_number}`}
                  className="border-b border-gray-200 px-0.5 py-1 text-center text-[9px] text-gray-700"
                >
                  {h.par}
                </th>
              ))}

              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                {sumByHoles(
                  backHoles,
                  Object.fromEntries(backHoles.map((h) => [h.hole_number, h.par]))
                )}
              </th>
              <th className="border-b border-gray-200 px-1 py-1 text-center font-semibold">
                {sumByHoles(
                  holes,
                  Object.fromEntries(holes.map((h) => [h.hole_number, h.par]))
                )}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="border-b border-gray-100 px-1 py-1 text-left text-[10px] font-semibold">
                SCORE
              </td>

              {frontHoles.map((h) => renderInputCell(h))}

              <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                {front9 || ""}
              </td>

              {backHoles.map((h) => renderInputCell(h))}

              <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                {back9 || ""}
              </td>
              <td className="border-b border-gray-100 px-1 py-1 text-center font-semibold">
                {total || ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {saveState.message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            saveState.ok
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {saveState.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar scores"}
        </button>
      </div>
    </form>
  );
}