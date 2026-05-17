"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { savePlayerScores, type SaveScoresState } from "./actions";
import {
  CapturedRoundsScorecard,
  EditableScorecard,
} from "./ScoreEntryScorecardTables";

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

export default function ScoreEntryClient({
  roundId,
  tournamentId,
  tournamentDayId,
  player,
  holes,
  existingScores,
  capturedRounds,
  selectedRoundNo,
  entryCategoryLabel,
  roundClosed = false,
  captureRoundNotice,
}: {
  roundId: string;
  tournamentId: string;
  tournamentDayId?: string | null;
  player: PlayerLite | null;
  holes: Hole[];
  existingScores: ExistingScores;
  capturedRounds: CapturedRound[];
  selectedRoundNo: number;
  /** Categoría del inscrito (inscripciones cerradas); no se modifica en captura. */
  entryCategoryLabel: string;
  roundClosed?: boolean;
  captureRoundNotice?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

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
  const [saveMode, setSaveMode] = useState<
    "save" | "save_and_close" | "open_round"
  >("save");

  const [saveState, formAction, isPending] = useActionState(
    savePlayerScores,
    initialSaveState
  );

  const playerName = useMemo(() => {
    if (!player) return "";
    return [player.first_name ?? "", player.last_name ?? ""].join(" ").trim();
  }, [player]);

  const playerHcp = player?.handicap_torneo ?? player?.handicap_index ?? null;

  const filledHoleCount = useMemo(
    () =>
      holes.filter((h) => String(scores[h.hole_number] ?? "").trim() !== "")
        .length,
    [holes, scores]
  );

  const canCloseRound = filledHoleCount >= 18;

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

    if (!roundClosed) {
      window.setTimeout(() => {
        focusIndex(firstEmpty);
      }, 0);
    }
  }, [holes, existingScores, player?.id, roundId, roundClosed]);

  useEffect(() => {
    if (!saveState.ok || !saveState.message) return;

    if (typeof window === "undefined") return;

    if (saveMode === "open_round") {
      router.refresh();
      return;
    }

    const sp = new URLSearchParams(window.location.search);
    sp.delete("q");
    sp.delete("entry_id");
    const query = sp.toString();
    const path = window.location.pathname;
    const url = query ? `${path}?${query}` : path;

    // Solo refresh: evita navegación extra que, con sesión recién refrescada, podía mandar a /login.
    router.refresh();

    if (saveMode === "save_and_close") {
      const t = window.setTimeout(() => {
        document.getElementById("score-entry-player-search")?.focus();
      }, 120);
      return () => window.clearTimeout(t);
    }

    router.replace(url, { scroll: false });

    const t = window.setTimeout(() => {
      document.getElementById("score-entry-player-search")?.focus();
    }, 120);

    return () => window.clearTimeout(t);
  }, [saveState.ok, saveState.message, saveMode, router]);

  function handleChange(
    holeNumber: number,
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    if (roundClosed) return;

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
    if (roundClosed) return;

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
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="player_id" value={player.id} />
      <input type="hidden" name="tournament_day_id" value={tournamentDayId ?? ""} />
      <input type="hidden" name="save_mode" value={saveMode} />

      {holes.map((h) => (
        <input
          key={`hidden-${h.hole_number}`}
          type="hidden"
          name={`hole_${h.hole_number}`}
          value={scores[h.hole_number] ?? ""}
          readOnly
        />
      ))}

      {captureRoundNotice ? (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          {captureRoundNotice}
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
          <div className="font-semibold text-black">
            #{player.player_number ?? "-"} · {playerName || "Jugador sin nombre"}
          </div>
          <div
            className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-900"
            title="Definida al inscribir y cerrar inscripciones; no se modifica en captura"
          >
            Inscripción: {entryCategoryLabel}
          </div>
          <div className="text-gray-600">HCP: {playerHcp ?? "-"}</div>
          <div className="text-gray-500">
            Celda activa: hoyo {holes[activeIndex]?.hole_number ?? "-"}
          </div>
          {roundClosed ? (
            <div className="rounded bg-slate-200 px-2 py-0.5 font-medium text-slate-800">
              R{selectedRoundNo} Cerrada
            </div>
          ) : (
            <div className="rounded bg-green-100 px-2 py-0.5 text-green-800">
              Capturando R{selectedRoundNo}
            </div>
          )}
          {!roundClosed && (
            <div className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
              Guardar: Cmd/Ctrl + S
            </div>
          )}
        </div>
      </div>

      <CapturedRoundsScorecard
        capturedRounds={capturedRounds}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedRoundNo={selectedRoundNo}
      />

      <EditableScorecard
        holes={holes}
        frontHoles={frontHoles}
        backHoles={backHoles}
        scores={scores}
        activeIndex={activeIndex}
        inputRefs={inputRefs}
        readOnly={roundClosed}
        onFocusIndex={setActiveIndex}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />

      {roundClosed && (
        <p className="text-sm text-slate-600">
          Tarjeta entregada y cerrada (firmas jugador y testigo). Usa «Abrir
          ronda» solo si necesitas corregir scores.
        </p>
      )}

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
        {roundClosed ? (
          <button
            type="submit"
            disabled={isPending}
            onClick={() => setSaveMode("open_round")}
            className="rounded-lg border border-amber-700 bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {isPending && saveMode === "open_round"
              ? "Abriendo..."
              : "Abrir ronda"}
          </button>
        ) : (
          <>
            <button
              type="submit"
              disabled={isPending}
              onClick={() => setSaveMode("save")}
              className="rounded-lg border border-green-800 bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {isPending && saveMode === "save"
                ? "Guardando..."
                : "Guardar scores"}
            </button>
            <button
              type="submit"
              disabled={isPending || !canCloseRound}
              onClick={() => setSaveMode("save_and_close")}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                canCloseRound
                  ? "Entrega en mesa: firmas jugador y testigo; cuenta para el leaderboard oficial"
                  : `Capture los 18 hoyos antes de cerrar (${filledHoleCount}/18)`
              }
            >
              {isPending && saveMode === "save_and_close"
                ? "Guardando..."
                : "Guardar y cerrar ronda"}
            </button>
            <span className="text-xs text-gray-500">
              «Guardar scores» para borrador; «Cerrar ronda» solo con los 18
              hoyos capturados (tarjeta firmada jugador + testigo).
            </span>
          </>
        )}
      </div>
    </form>
  );
}