"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type HoleNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

type HoleScores = Record<HoleNumber, number | null>;

type PlayerRow = {
  id: string;
  name: string;
  scores: HoleScores;
};

const HOLES_FRONT: HoleNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HOLES_BACK: HoleNumber[] = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ALL_HOLES: HoleNumber[] = [...HOLES_FRONT, ...HOLES_BACK];

const PAR_BY_HOLE: Record<HoleNumber, number> = {
  1: 4,
  2: 4,
  3: 3,
  4: 5,
  5: 4,
  6: 4,
  7: 4,
  8: 3,
  9: 5,
  10: 4,
  11: 5,
  12: 3,
  13: 4,
  14: 5,
  15: 4,
  16: 4,
  17: 3,
  18: 4,
};

const HCP_BY_HOLE: Record<HoleNumber, number> = {
  1: 13,
  2: 1,
  3: 15,
  4: 7,
  5: 3,
  6: 5,
  7: 11,
  8: 17,
  9: 9,
  10: 6,
  11: 14,
  12: 18,
  13: 8,
  14: 12,
  15: 10,
  16: 2,
  17: 16,
  18: 4,
};

function createEmptyScores(): HoleScores {
  return {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
    7: null,
    8: null,
    9: null,
    10: null,
    11: null,
    12: null,
    13: null,
    14: null,
    15: null,
    16: null,
    17: null,
    18: null,
  };
}

function getShortName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 3) {
    return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
  }

  if (parts.length === 2) {
    const first = parts[0][0] ?? "";
    const last = parts[1].slice(0, 2) ?? "";
    return (first + last).toUpperCase();
  }

  return parts[0]?.slice(0, 3).toUpperCase() ?? "";
}

function sumScores(scores: HoleScores, holes: HoleNumber[]) {
  return holes.reduce((acc, hole) => acc + (scores[hole] ?? 0), 0);
}

function sumPar(holes: HoleNumber[]) {
  return holes.reduce((acc, hole) => acc + PAR_BY_HOLE[hole], 0);
}

function getScoreCellClass(score: number | null, par: number) {
  if (score === null) {
    return "text-slate-800";
  }

  const diff = score - par;

  if (diff <= -1) {
    return "inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-600 text-[11px] font-bold text-slate-900";
  }

  if (diff === 0) {
    return "inline-flex h-6 w-6 items-center justify-center text-[11px] font-bold text-slate-900";
  }

  if (diff === 1) {
    return "inline-flex h-6 w-6 items-center justify-center border-2 border-slate-800 text-[11px] font-bold text-slate-900";
  }

  return "inline-flex h-6 w-6 items-center justify-center border-2 border-slate-800 text-[11px] font-bold text-slate-900 shadow-[inset_0_0_0_2px_white,inset_0_0_0_4px_#1f2937]";
}

function ScoreCell({
  score,
  par,
}: {
  score: number | null;
  par: number;
}) {
  if (score === null) {
    return <span className="inline-flex h-6 w-6 items-center justify-center" />;
  }

  return <span className={getScoreCellClass(score, par)}>{score}</span>;
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);

  function resizeCanvas() {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = wrapper.getBoundingClientRect();

    const oldData = canvas.toDataURL("image/png");

    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(180 * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = "180px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 180);

    if (value || (oldData && oldData !== "data:,")) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, 180);
      };
      img.src = value ?? oldData;
    }
  }

  useEffect(() => {
    resizeCanvas();

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawingRef.current = true;
    hasStrokeRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function endDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    drawingRef.current = false;

    if (hasStrokeRef.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = wrapper.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 180);

    hasStrokeRef.current = false;
    onChange(null);
  }

  return (
    <div>
      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={endDrawing}
          onPointerLeave={endDrawing}
          onPointerCancel={endDrawing}
        />
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={clearSignature}
          className="h-10 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800"
        >
          Limpiar firma
        </button>
      </div>
    </div>
  );
}

function CompactCardSection({
  title,
  holes,
  players,
  totalLabel,
  showGrandTotal,
}: {
  title: string;
  holes: HoleNumber[];
  players: PlayerRow[];
  totalLabel: string;
  showGrandTotal: boolean;
}) {
  const gridCols = showGrandTotal
    ? "56px repeat(9,minmax(0,1fr)) 36px 36px"
    : "56px repeat(9,minmax(0,1fr)) 36px";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold tracking-[0.14em] text-slate-600">
        {title}
      </div>

      <div className="w-full">
        <div
          className="grid items-center bg-[#0d2747] text-white"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold">HOY</div>

          {holes.map((hole) => (
            <div
              key={`${title}-hole-${hole}`}
              className="py-1 text-center text-[10px] font-bold"
            >
              {hole}
            </div>
          ))}

          <div className="py-1 text-center text-[10px] font-bold">{totalLabel}</div>

          {showGrandTotal ? (
            <div className="py-1 text-center text-[10px] font-bold">TOT</div>
          ) : null}
        </div>

        <div
          className="grid items-center border-b border-slate-200 bg-[#eef2f7] text-slate-700"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold">PAR</div>

          {holes.map((hole) => (
            <div
              key={`${title}-par-${hole}`}
              className="py-1 text-center text-[10px] font-bold"
            >
              {PAR_BY_HOLE[hole]}
            </div>
          ))}

          <div className="py-1 text-center text-[10px] font-bold">
            {sumPar(holes)}
          </div>

          {showGrandTotal ? (
            <div className="py-1 text-center text-[10px] font-bold">
              {sumPar(ALL_HOLES)}
            </div>
          ) : null}
        </div>

        <div
          className="grid items-center border-b border-slate-200 bg-white text-slate-500"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold text-slate-800">
            HCP
          </div>

          {holes.map((hole) => (
            <div
              key={`${title}-hcp-${hole}`}
              className="py-1 text-center text-[10px]"
            >
              {HCP_BY_HOLE[hole]}
            </div>
          ))}

          <div />
          {showGrandTotal ? <div /> : null}
        </div>

        {players.map((player) => {
          const sectionTotal = sumScores(player.scores, holes);
          const grandTotal = sumScores(player.scores, ALL_HOLES);

          return (
            <div
              key={`${title}-player-${player.id}`}
              className="grid items-center border-b border-slate-200 bg-white last:border-b-0"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="px-1 py-1 text-center">
                <div className="text-[10px] font-bold leading-none text-slate-900">
                  {getShortName(player.name)}
                </div>
              </div>

              {holes.map((hole) => (
                <div
                  key={`${title}-score-${player.id}-${hole}`}
                  className="flex items-center justify-center py-1"
                >
                  <ScoreCell
                    score={player.scores[hole]}
                    par={PAR_BY_HOLE[hole]}
                  />
                </div>
              ))}

              <div className="py-1 text-center text-[10px] font-bold text-slate-900">
                {sectionTotal > 0 ? sectionTotal : ""}
              </div>

              {showGrandTotal ? (
                <div className="py-1 text-center text-[10px] font-bold text-slate-900">
                  {grandTotal > 0 ? grandTotal : ""}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HoleDots({
  currentHole,
  onSelectHole,
  isHoleComplete,
}: {
  currentHole: HoleNumber;
  onSelectHole: (hole: HoleNumber) => void;
  isHoleComplete: (hole: HoleNumber) => boolean;
}) {
  return (
    <div className="border-b bg-white px-2 py-1">
      <div className="flex gap-1 overflow-x-auto">
        {ALL_HOLES.map((hole) => {
          const isActive = hole === currentHole;
          const isDone = isHoleComplete(hole);

          return (
            <button
              key={`hole-dot-${hole}`}
              type="button"
              onClick={() => onSelectHole(hole)}
              className={[
                "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isActive
                  ? "bg-black text-white"
                  : "bg-slate-200 text-slate-700",
              ].join(" ")}
            >
              {hole}
              {isDone ? (
                <span className="absolute -right-1 -top-1 text-[9px] leading-none text-emerald-600">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileScoreEntryContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group_id");

  const [tab, setTab] = useState<"anotar" | "tarjeta" | "firmar">("anotar");
  const [currentHole, setCurrentHole] = useState<HoleNumber>(18);

  const [players, setPlayers] = useState<PlayerRow[]>([
    { id: "p1", name: "Cecilia Mosti", scores: createEmptyScores() },
    { id: "p2", name: "Chapo Álvarez", scores: createEmptyScores() },
    { id: "p3", name: "Eduardo Urbiola", scores: createEmptyScores() },
    { id: "p4", name: "Gabi Sánchez", scores: createEmptyScores() },
    { id: "p5", name: "Gallo Torres", scores: createEmptyScores() },
    { id: "p6", name: "Tere Ruiz", scores: createEmptyScores() },
  ]);

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState<string>("");
  const [signPlayerId, setSignPlayerId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});

  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activePlayer = useMemo(
    () => players.find((p) => p.id === activePlayerId) ?? null,
    [players, activePlayerId]
  );

  const signPlayer = useMemo(
    () => players.find((p) => p.id === signPlayerId) ?? null,
    [players, signPlayerId]
  );

  function isHoleComplete(hole: HoleNumber) {
    return players.every((player) => player.scores[hole] !== null);
  }

  function getPlayerHoleScore(player: PlayerRow, hole: HoleNumber) {
    return player.scores[hole];
  }

  function setHoleScore(playerId: string, hole: HoleNumber, value: number | null) {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? {
              ...player,
              scores: {
                ...player.scores,
                [hole]: value === null ? null : Math.max(1, value),
              },
            }
          : player
      )
    );
  }

  function selectPlayer(playerId: string) {
    const player = players.find((p) => p.id === playerId);
    const existing = player?.scores[currentHole];
    setActivePlayerId(playerId);
    setDraftScore(existing ? String(existing) : "");
  }

  function handleNumber(n: number) {
    if (!activePlayerId) return;

    const next = `${draftScore}${n}`.replace(/^0+(?=\d)/, "");
    setDraftScore(next);

    const numeric = Number(next);
    if (numeric > 0) {
      setHoleScore(activePlayerId, currentHole, numeric);
    }
  }

  function handleClear() {
    if (!activePlayerId) return;
    setDraftScore("");
    setHoleScore(activePlayerId, currentHole, null);
  }

  function handleBackspace() {
    if (!activePlayerId) return;

    const next = draftScore.slice(0, -1);
    setDraftScore(next);

    if (!next) {
      setHoleScore(activePlayerId, currentHole, null);
      return;
    }

    const numeric = Number(next);
    if (numeric > 0) {
      setHoleScore(activePlayerId, currentHole, numeric);
    }
  }

  function handlePreset(playerId: string, value: number) {
    setHoleScore(playerId, currentHole, value);
    setActivePlayerId(null);
    setDraftScore("");
  }

  function handleOpenSign(playerId: string) {
    setSignPlayerId(playerId);
    setActivePlayerId(null);
    setDraftScore("");
    setTab("firmar");
  }

  function handleConfirmSign() {
    if (!signPlayerId) return;
    if (!signatures[signPlayerId]) return;
    setTab("tarjeta");
  }

  useEffect(() => {
    if (!activePlayerId || tab !== "anotar") return;

    const el = playerRefs.current[activePlayerId];
    if (!el) return;

    const t = window.setTimeout(() => {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    return () => window.clearTimeout(t);
  }, [activePlayerId, tab]);

  const signedCount = players.filter((player) => signatures[player.id]).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#eef3f7]">
        <header className="sticky top-0 z-20 bg-black px-3 py-2 text-white">
          <div className="text-sm font-semibold">List.golf</div>
          <div className="text-[10px] opacity-70">Captura por grupo</div>
        </header>

        {tab === "anotar" ? (
          <HoleDots
            currentHole={currentHole}
            onSelectHole={(hole) => {
              setCurrentHole(hole);
              setActivePlayerId(null);
              setDraftScore("");
            }}
            isHoleComplete={isHoleComplete}
          />
        ) : null}

        <div className="flex border-b bg-white">
          <button
            type="button"
            onClick={() => setTab("anotar")}
            className={[
              "flex-1 py-2 text-sm font-semibold",
              tab === "anotar"
                ? "border-b-2 border-black text-black"
                : "text-slate-500",
            ].join(" ")}
          >
            Anotar
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("tarjeta");
              setActivePlayerId(null);
              setDraftScore("");
            }}
            className={[
              "flex-1 py-2 text-sm font-semibold",
              tab === "tarjeta"
                ? "border-b-2 border-black text-black"
                : "text-slate-500",
            ].join(" ")}
          >
            Tarjeta
          </button>

          <button
            type="button"
            onClick={() => {
              if (signPlayerId) {
                setTab("firmar");
              } else if (players[0]) {
                setSignPlayerId(players[0].id);
                setTab("firmar");
              }
            }}
            className={[
              "flex-1 py-2 text-sm font-semibold",
              tab === "firmar"
                ? "border-b-2 border-black text-black"
                : "text-slate-500",
            ].join(" ")}
          >
            Firmar
          </button>
        </div>

        {tab === "anotar" && (
          <>
            <main
              className={[
                "flex-1 space-y-2 px-3 py-2",
                activePlayerId ? "pb-44" : "pb-4",
              ].join(" ")}
            >
              <section className="rounded-xl bg-white px-3 py-3 text-center shadow-sm">
                <div className="text-base font-bold">Hoyo {currentHole}</div>
                <div className="text-xs text-slate-600">
                  Par {PAR_BY_HOLE[currentHole]}
                </div>
                <div className="text-[11px] text-slate-500">
                  Grupo: {groupId || "Sin group_id"}
                </div>

                <div className="mt-3">
                  <a
                    href={groupId ? `/captura/tarjeta?group_id=${groupId}` : "/captura/tarjeta"}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm"
                  >
                    Ver tarjeta completa
                  </a>
                </div>
              </section>

              <section className="space-y-2">
                {players.map((player) => {
                  const isActive = player.id === activePlayerId;
                  const currentHoleScore = getPlayerHoleScore(player, currentHole);

                  return (
                    <div
                      key={player.id}
                      ref={(el) => {
                        playerRefs.current[player.id] = el;
                      }}
                      className={[
                        "rounded-xl border px-3 py-2 shadow-sm",
                        isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[15px] font-semibold">
                          {player.name}
                        </div>

                        <div className="text-xs text-slate-500">
                          {currentHoleScore ?? "-"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectPlayer(player.id)}
                          className="flex h-11 w-[62px] shrink-0 items-center justify-center rounded-lg border border-red-500 bg-red-50 text-2xl font-bold text-black"
                        >
                          {currentHoleScore ?? ""}
                        </button>

                        <div className="flex flex-1 gap-1">
                          {[
                            { label: "Birdie", value: PAR_BY_HOLE[currentHole] - 1 },
                            { label: "Par", value: PAR_BY_HOLE[currentHole] },
                            { label: "Bogey", value: PAR_BY_HOLE[currentHole] + 1 },
                            { label: "Doble", value: PAR_BY_HOLE[currentHole] + 2 },
                          ].map((btn) => (
                            <button
                              key={btn.label}
                              type="button"
                              onClick={() => handlePreset(player.id, btn.value)}
                              className={[
                                "h-11 flex-1 rounded-lg border text-[10px] font-semibold",
                                currentHoleScore === btn.value
                                  ? "border-blue-500 bg-blue-200 text-blue-900"
                                  : "border-slate-300 bg-white text-slate-700",
                              ].join(" ")}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            </main>

            {activePlayerId && (
              <div className="fixed bottom-0 left-0 right-0 z-30">
                <div className="mx-auto w-full max-w-md border-t border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
                  <div className="mb-2 text-center text-xs font-semibold">
                    {activePlayer?.name}
                  </div>

                  <div className="mb-2 text-center text-3xl font-bold text-black">
                    {draftScore}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleNumber(n)}
                        className="h-12 rounded-lg bg-slate-100 text-lg font-bold"
                      >
                        {n}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={handleClear}
                      className="h-12 rounded-lg bg-red-100 text-sm font-semibold"
                    >
                      C
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNumber(0)}
                      className="h-12 rounded-lg bg-slate-100 text-lg font-bold"
                    >
                      0
                    </button>

                    <button
                      type="button"
                      onClick={handleBackspace}
                      className="h-12 rounded-lg bg-slate-200 text-sm font-semibold"
                    >
                      ←
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "tarjeta" && (
          <main className="flex-1 space-y-2 p-2">
            <section className="rounded-xl bg-white px-2 py-2 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Tarjeta completa
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Front 9 arriba · Back 9 abajo
                  </div>
                </div>

                <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                  Firmas {signedCount}/{players.length}
                </div>
              </div>

              <div className="space-y-2">
                <CompactCardSection
                  title="FRONT 9"
                  holes={HOLES_FRONT}
                  players={players}
                  totalLabel="IN"
                  showGrandTotal={false}
                />

                <CompactCardSection
                  title="BACK 9"
                  holes={HOLES_BACK}
                  players={players}
                  totalLabel="OUT"
                  showGrandTotal
                />
              </div>
            </section>

            <section className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
              <div className="text-sm font-bold text-slate-900">
                Firma individual por jugador
              </div>

              {players.map((player) => {
                const isSigned = Boolean(signatures[player.id]);

                return (
                  <button
                    key={`sign-${player.id}`}
                    type="button"
                    onClick={() => handleOpenSign(player.id)}
                    className={[
                      "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left",
                      isSigned
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-300 bg-white",
                    ].join(" ")}
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {player.name}
                    </span>

                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-bold",
                        isSigned
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-700",
                      ].join(" ")}
                    >
                      {isSigned ? "Firmado" : "Firmar"}
                    </span>
                  </button>
                );
              })}
            </section>
          </main>
        )}

        {tab === "firmar" && (
          <main className="flex-1 space-y-3 p-3">
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-900">
                  Firma de jugador
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {signPlayer?.name ?? "Sin jugador seleccionado"}
                </div>
              </div>

              <div className="mt-4">
                <SignaturePad
                  value={signPlayerId ? signatures[signPlayerId] ?? null : null}
                  onChange={(next) => {
                    if (!signPlayerId) return;
                    setSignatures((current) => ({
                      ...current,
                      [signPlayerId]: next,
                    }));
                  }}
                />
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setTab("tarjeta")}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800"
                >
                  Regresar a tarjeta
                </button>

                <button
                  type="button"
                  onClick={handleConfirmSign}
                  disabled={!signPlayerId || !signatures[signPlayerId]}
                  className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
                >
                  Confirmar firma
                </button>
              </div>
            </section>

            <section className="rounded-xl bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-bold text-slate-900">
                Seleccionar jugador
              </div>

              <div className="space-y-2">
                {players.map((player) => {
                  const isActive = player.id === signPlayerId;
                  const isSigned = Boolean(signatures[player.id]);

                  return (
                    <button
                      key={`firmar-picker-${player.id}`}
                      type="button"
                      onClick={() => setSignPlayerId(player.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left",
                        isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-300 bg-white",
                      ].join(" ")}
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        {player.name}
                      </span>

                      <span
                        className={[
                          "rounded-full px-2 py-1 text-[11px] font-bold",
                          isSigned
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-200 text-slate-700",
                        ].join(" ")}
                      >
                        {isSigned ? "Firmado" : "Pendiente"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
} export default function MobileScoreEntryPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Cargando...</div>}>
      <MobileScoreEntryContent />
    </Suspense>
  );
}