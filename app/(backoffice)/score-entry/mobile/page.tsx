"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { analyzePlayoffCapture } from "@/lib/captura/playoffCaptureState";
import { PICKED_UP_STROKES } from "@/lib/captura/types";
import BackButton from "@/components/captura/BackButton";
import GpsChip from "@/components/captura/GpsChip";
import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";

/**
 * Hoyos 1-18 = recorrido normal.
 * Hoyos 19-27 = tramo de desempate (muerte súbita): se vuelven a jugar
 * físicamente los hoyos 1-9 y se guardan en BD como hole_no 19..27.
 * En la UI se muestran como H1..H9 con etiqueta "Desempate".
 */
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
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27;

type HoleScores = Record<HoleNumber, number | null>;

type PlayerRow = {
  id: string;
  name: string;
  scores: HoleScores;
  /** Celdas con cambio pendiente de aprobación del testigo. */
  pending?: Partial<Record<HoleNumber, boolean>>;
  /** Match play: hoyos donde el jugador levantó (X). strokes = 10 en BD;
   *  la UI muestra X y pierde la bola alta automáticamente. */
  pickedUp?: Partial<Record<HoleNumber, boolean>>;
};

const HOLES_FRONT: HoleNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HOLES_BACK: HoleNumber[] = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const HOLES_PLAYOFF: HoleNumber[] = [
  19, 20, 21, 22, 23, 24, 25, 26, 27,
];
const ALL_HOLES: HoleNumber[] = [...HOLES_FRONT, ...HOLES_BACK];

const PAR_BASE: Record<number, number> = {
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

const HCP_BASE: Record<number, number> = {
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

/** PAR/HCP para los hoyos 19-27 se reflejan desde los hoyos 1-9
 *  porque físicamente se vuelven a jugar esos mismos hoyos. */
const PAR_BY_HOLE: Record<HoleNumber, number> = (() => {
  const map = {} as Record<HoleNumber, number>;
  for (const h of [...HOLES_FRONT, ...HOLES_BACK]) map[h] = PAR_BASE[h]!;
  for (const h of HOLES_PLAYOFF) map[h] = PAR_BASE[h - 18]!;
  return map;
})();

const HCP_BY_HOLE: Record<HoleNumber, number> = (() => {
  const map = {} as Record<HoleNumber, number>;
  for (const h of [...HOLES_FRONT, ...HOLES_BACK]) map[h] = HCP_BASE[h]!;
  for (const h of HOLES_PLAYOFF) map[h] = HCP_BASE[h - 18]!;
  return map;
})();

function createEmptyScores(): HoleScores {
  const map = {} as HoleScores;
  for (const h of [...HOLES_FRONT, ...HOLES_BACK, ...HOLES_PLAYOFF]) {
    map[h] = null;
  }
  return map;
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

function getInitials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  isPending,
  pickedUp,
}: {
  score: number | null;
  par: number;
  isPending?: boolean;
  pickedUp?: boolean;
}) {
  if (pickedUp) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[10px] font-extrabold text-amber-700"
        title="No terminó el hoyo (pierde bola alta)"
      >
        X
      </span>
    );
  }

  if (score === null) {
    return <span className="inline-flex h-6 w-6 items-center justify-center" />;
  }

  if (isPending) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        {score}
      </span>
    );
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
  highlightPlayerId,
  witnessTargetPlayerId,
  headerToneClass,
  labelForHole,
}: {
  title: string;
  holes: HoleNumber[];
  players: PlayerRow[];
  totalLabel: string;
  showGrandTotal: boolean;
  /** Si se proporciona, esa fila se pinta en azul cielo (jugador identificado). */
  highlightPlayerId?: string | null;
  /** Si se proporciona, esa fila se pinta en ámbar (mi jugador a atestiguar). */
  witnessTargetPlayerId?: string | null;
  /** Color de la barra superior (default azul oscuro). Usado por desempate. */
  headerToneClass?: string;
  /** Etiqueta personalizada por hoyo (usado por desempate: H1..H9). */
  labelForHole?: (hole: HoleNumber) => string | number;
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
          className={[
            "grid items-center text-white",
            headerToneClass ?? "bg-[#0d2747]",
          ].join(" ")}
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold">HOY</div>

          {holes.map((hole) => (
            <div
              key={`${title}-hole-${hole}`}
              className="py-1 text-center text-[10px] font-bold"
            >
              {labelForHole ? labelForHole(hole) : hole}
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
          const isMe =
            highlightPlayerId != null && player.id === highlightPlayerId;
          const isWitnessTarget =
            !isMe &&
            witnessTargetPlayerId != null &&
            player.id === witnessTargetPlayerId;
          const rowBg = isMe
            ? "bg-sky-50"
            : isWitnessTarget
              ? "bg-amber-50"
              : "bg-white";
          const totalBg = isMe
            ? "bg-sky-100"
            : isWitnessTarget
              ? "bg-amber-100"
              : "";

          return (
            <div
              key={`${title}-player-${player.id}`}
              className={[
                "grid items-center border-b border-slate-200 last:border-b-0",
                rowBg,
              ].join(" ")}
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
                    isPending={Boolean(player.pending?.[hole])}
                    pickedUp={Boolean(player.pickedUp?.[hole])}
                  />
                </div>
              ))}

              <div
                className={[
                  "py-1 text-center text-[10px] font-bold text-slate-900",
                  totalBg,
                ].join(" ")}
              >
                {sectionTotal > 0 ? sectionTotal : ""}
              </div>

              {showGrandTotal ? (
                <div
                  className={[
                    "py-1 text-center text-[10px] font-bold text-slate-900",
                    totalBg,
                  ].join(" ")}
                >
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

function PrivateCardSection({
  title,
  holes,
  scores,
  totalLabel,
  showGrandTotal,
}: {
  title: string;
  holes: HoleNumber[];
  scores: HoleScores;
  totalLabel: string;
  showGrandTotal: boolean;
}) {
  const gridCols = showGrandTotal
    ? "56px repeat(9,minmax(0,1fr)) 36px 36px"
    : "56px repeat(9,minmax(0,1fr)) 36px";

  const sectionTotal = sumScores(scores, holes);
  const grandTotal = sumScores(scores, ALL_HOLES);

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 shadow-sm">
      <div className="border-b border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-bold tracking-[0.14em] text-amber-900">
        {title}
      </div>

      <div className="w-full">
        <div
          className="grid items-center bg-amber-700 text-white"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold">HOY</div>
          {holes.map((hole) => (
            <div
              key={`priv-${title}-hole-${hole}`}
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
          className="grid items-center border-b border-amber-300 bg-amber-100 text-amber-900"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold">PAR</div>
          {holes.map((hole) => (
            <div
              key={`priv-${title}-par-${hole}`}
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
          className="grid items-center bg-amber-50"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-1 text-center text-[10px] font-bold text-amber-900">
            MI
          </div>
          {holes.map((hole) => (
            <div
              key={`priv-${title}-score-${hole}`}
              className="flex items-center justify-center py-1"
            >
              <ScoreCell
                score={scores[hole]}
                par={PAR_BY_HOLE[hole]}
              />
            </div>
          ))}
          <div className="py-1 text-center text-[10px] font-bold text-amber-900">
            {sectionTotal > 0 ? sectionTotal : ""}
          </div>
          {showGrandTotal ? (
            <div className="py-1 text-center text-[10px] font-bold text-amber-900">
              {grandTotal > 0 ? grandTotal : ""}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HoleDots({
  currentHole,
  onSelectHole,
  isHoleComplete,
  showPlayoff,
  decidedAtPlayoffHole,
}: {
  currentHole: HoleNumber;
  onSelectHole: (hole: HoleNumber) => void;
  isHoleComplete: (hole: HoleNumber) => boolean;
  /** Si true, también renderiza los hoyos 19-27 (etiquetados P1-P9). */
  showPlayoff?: boolean;
  /** Hoyo de desempate donde se decidió (1..9); desactiva los siguientes. */
  decidedAtPlayoffHole?: number | null;
}) {
  return (
    <div className="border-b bg-white px-2 py-1">
      <div className="flex items-center gap-1 overflow-x-auto">
        {ALL_HOLES.map((hole) => {
          const isActive = hole === currentHole;
          const isDone = isHoleComplete(hole);
          return (
            <button
              key={`hole-dot-${hole}`}
              type="button"
              onClick={() => onSelectHole(hole)}
              className={[
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold sm:h-8 sm:w-8 md:h-6 md:w-6 md:text-[10px]",
                isActive
                  ? "bg-black text-white"
                  : "bg-slate-200 text-slate-700",
              ].join(" ")}
            >
              {hole}
              {isDone ? (
                <span
                  aria-label="Hoyo completo"
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[12px] font-black leading-none text-white shadow-sm"
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}

        {showPlayoff ? (
          <>
            <span className="mx-1 inline-block h-6 w-px bg-amber-300" />
            {HOLES_PLAYOFF.map((hole) => {
              const isActive = hole === currentHole;
              const isDone = isHoleComplete(hole);
              const playoffNo = hole - 18;
              const disabled =
                decidedAtPlayoffHole != null && playoffNo > decidedAtPlayoffHole;
              return (
                <button
                  key={`hole-dot-${hole}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onSelectHole(hole);
                  }}
                  className={[
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold sm:h-8 sm:w-8 md:h-6 md:w-6 md:text-[10px]",
                    isActive
                      ? "bg-amber-700 text-white"
                      : disabled
                        ? "bg-amber-100 text-amber-400 opacity-40"
                        : "bg-amber-200 text-amber-900",
                  ].join(" ")}
                  title={`Desempate · hoyo ${playoffNo}`}
                >
                  P{playoffNo}
                  {isDone ? (
                    <span
                      aria-label="Hoyo completo"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[12px] font-black leading-none text-white shadow-sm"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

const DEMO_PLAYERS: PlayerRow[] = [
  { id: "p1", name: "Cecilia Mosti", scores: createEmptyScores() },
  { id: "p2", name: "Chapo Álvarez", scores: createEmptyScores() },
  { id: "p3", name: "Eduardo Urbiola", scores: createEmptyScores() },
  { id: "p4", name: "Gabi Sánchez", scores: createEmptyScores() },
  { id: "p5", name: "Gallo Torres", scores: createEmptyScores() },
  { id: "p6", name: "Tere Ruiz", scores: createEmptyScores() },
];

/** Id especial para identificar la card "Mi Score" (tarjeta privada). */
const ME_ID = "__me__";

function buildCapturaTarjetaPath(
  gid: string,
  me: string | null | undefined,
  caddie: string | null | undefined
) {
  const sp = new URLSearchParams({ group_id: gid });
  const meT = me?.trim();
  const caddieT = caddie?.trim();
  if (meT) sp.set("me", meT);
  if (caddieT) sp.set("caddie", caddieT);
  // El botón "← Volver" debe regresar al menú móvil de captura.
  sp.set("back", "/score-entry/mobile");
  return `/captura/tarjeta?${sp.toString()}`;
}

function MobileScoreEntryContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group_id");
  /** `?me=` y `?caddie=` traen los entry IDs identificados desde Telegram. */
  const meParam = searchParams.get("me");
  const caddieParam = searchParams.get("caddie");
  const meFromUrl = meParam?.trim() || null;
  const caddieFromUrl = caddieParam?.trim() || null;
  const tabParam = searchParams.get("tab");
  const isIdentified = Boolean(meFromUrl || caddieFromUrl);

  const [tab, setTab] = useState<"anotar" | "tarjeta" | "firmar">(() => {
    if (tabParam === "anotar" || tabParam === "firmar" || tabParam === "tarjeta") {
      return tabParam;
    }
    return isIdentified ? "tarjeta" : "anotar";
  });
  const [currentHole, setCurrentHole] = useState<HoleNumber>(1);

  const [players, setPlayers] = useState<PlayerRow[]>(
    groupId ? [] : DEMO_PLAYERS
  );
  const [groupLoading, setGroupLoading] = useState(Boolean(groupId));

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState<string>("");
  /** Tras abrir el keypad para un jugador, el primer dígito reemplaza el valor previo. */
  const [draftFresh, setDraftFresh] = useState<boolean>(false);
  const [signPlayerId, setSignPlayerId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});

  // === Estado de identidad / tarjeta privada / testigos ===
  /** Entry ID del jugador visitante (URL primero; API lo confirma después). */
  const [myEntryId, setMyEntryId] = useState<string | null>(meFromUrl);
  /** Scores privados del jugador (sólo él y su caddie los ven aquí). */
  const [myPrivateScores, setMyPrivateScores] = useState<HoleScores>(() =>
    createEmptyScores()
  );
  /** Entry IDs cuyos scores puedo modificar como caddie (lista del API). */
  const [caddieForEntryIds, setCaddieForEntryIds] = useState<string[]>([]);
  /** Mapa entryId (jugador) -> witnessEntryId (su testigo). */
  const [witnessesMap, setWitnessesMap] = useState<Record<string, string>>({});
  /** Mapa entryId (jugador) -> category_id (para link a resultados en vivo). */
  const [categoryByEntry, setCategoryByEntry] = useState<Record<string, string | null>>({});
  /** Tournament ID del grupo (para link a la página pública). */
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  /** Firmas de tarjeta por entry (player + witness). */
  type CardSig = {
    signedByPlayerAt: string | null;
    signedByWitnessAt: string | null;
  };
  const [signaturesByEntry, setSignaturesByEntry] = useState<Record<string, CardSig>>({});
  const [signingFor, setSigningFor] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  /** Entry ID del jugador a quien atestiguo (yo soy su testigo). */
  const [witnessTargetEntryId, setWitnessTargetEntryId] = useState<string | null>(null);
  /** Nombre legible del jugador a quien atestiguo. */
  const [witnessTargetName, setWitnessTargetName] = useState<string | null>(null);
  /** Nombre legible de MI testigo. */
  const [myWitnessName, setMyWitnessName] = useState<string | null>(null);
  /** Cuántos cambios tengo pendientes por aprobar (en celdas del jugador que atestiguo). */
  const [pendingForMeCount, setPendingForMeCount] = useState<number>(0);
  /** Estado de match play del grupo: AS al 18 → desempate; o ya decidido. */
  type GroupMatchPlay = {
    decidedAtHole: number | null;
    resultText: string;
    holesRequired: number;
    viaPlayoff?: boolean;
    playoffHole?: number;
    needsPlayoff?: boolean;
    playoffPendingHole?: number;
  };
  const [matchPlayInfo, setMatchPlayInfo] = useState<GroupMatchPlay | null>(
    null
  );
  /**
   * Visibilidad de "Mi Score" + banner de testigo en la pestaña Tarjeta.
   * Se oculta al volver desde Anotar; el botón toggle siempre queda visible.
   */
  const [showMyCard, setShowMyCard] = useState<boolean>(true);
  /** true tras salir de Tarjeta hacia Anotar (para ocultar Mi Score al regresar). */
  const leftTarjetaForAnotarRef = useRef(false);

  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activePlayerIdRef = useRef<string | null>(null);
  const currentHoleRef = useRef<HoleNumber>(1);
  const savingRef = useRef(false);

  /** Jugador identificado: API o parámetro ?me= en la URL. */
  const viewerEntryId = myEntryId ?? meFromUrl;

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  useEffect(() => {
    currentHoleRef.current = currentHole;
  }, [currentHole]);

  useEffect(() => {
    const gid = groupId?.trim() ?? "";
    if (!gid) return;
    const groupIdCapture = gid;
    const meTrim = meParam?.trim() ?? "";
    const caddieTrim = caddieParam?.trim() ?? "";

    async function pull() {
      if (savingRef.current) return;
      try {
        const qs = new URLSearchParams({ group_id: groupIdCapture });
        if (meTrim) qs.set("me", meTrim);
        if (caddieTrim) qs.set("caddie", caddieTrim);
        const res = await fetch(`/api/captura/group?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            tournamentId?: string | null;
            myEntryId?: string | null;
            caddieForEntryIds?: string[];
            witnesses?: Array<{ entryId: string; witnessEntryId: string }>;
            matchPlay?: GroupMatchPlay | null;
            players: Array<{
              entryId: string;
              name: string;
              scores: PlayerRow["scores"];
              pending?: Partial<Record<HoleNumber, boolean>>;
              pickedUp?: Partial<Record<HoleNumber, boolean>>;
              privateScores?: PlayerRow["scores"];
              categoryId?: string | null;
              signatures?: {
                signedByPlayerAt: string | null;
                signedByWitnessAt: string | null;
                signedByWitnessEntryId: string | null;
              };
            }>;
          };
        };
        if (!json.ok || !json.data?.players) return;
        setGroupLoading(false);

        const data = json.data;
        const myId = data.myEntryId ?? (meTrim || null);
        setMyEntryId(myId);
        setTournamentId(data.tournamentId ?? null);
        setMatchPlayInfo(data.matchPlay ?? null);
        setCaddieForEntryIds(
          Array.isArray(data.caddieForEntryIds) ? data.caddieForEntryIds : []
        );
        const catMap: Record<string, string | null> = {};
        const sigMap: Record<string, CardSig> = {};
        for (const p of data.players) {
          catMap[p.entryId] = p.categoryId ?? null;
          sigMap[p.entryId] = {
            signedByPlayerAt: p.signatures?.signedByPlayerAt ?? null,
            signedByWitnessAt: p.signatures?.signedByWitnessAt ?? null,
          };
        }
        setCategoryByEntry(catMap);
        setSignaturesByEntry(sigMap);

        // Mapa de testigos: yo atestiguo a alguien si soy su witness.
        let targetEid: string | null = null;
        let myWitnessEid: string | null = null;
        const witMap: Record<string, string> = {};
        if (Array.isArray(data.witnesses)) {
          for (const w of data.witnesses) {
            witMap[w.entryId] = w.witnessEntryId;
            if (myId && w.witnessEntryId === myId) targetEid = w.entryId;
            if (myId && w.entryId === myId) myWitnessEid = w.witnessEntryId;
          }
        }
        setWitnessesMap(witMap);
        setWitnessTargetEntryId(targetEid);

        const targetPlayer = targetEid
          ? data.players.find((p) => p.entryId === targetEid) ?? null
          : null;
        setWitnessTargetName(targetPlayer?.name ?? null);

        const myWitnessPlayer = myWitnessEid
          ? data.players.find((p) => p.entryId === myWitnessEid) ?? null
          : null;
        setMyWitnessName(myWitnessPlayer?.name ?? null);

        // Pendientes que yo debo aprobar
        let pCount = 0;
        if (targetPlayer?.pending) {
          for (const v of Object.values(targetPlayer.pending)) {
            if (v) pCount += 1;
          }
        }
        setPendingForMeCount(pCount);

        // Scores privados del jugador identificado
        if (myId) {
          const mePlayer = data.players.find((p) => p.entryId === myId);
          if (mePlayer?.privateScores) {
            const incoming = mePlayer.privateScores;
            const editingMe = activePlayerIdRef.current === ME_ID;
            const editingHole = currentHoleRef.current;
            setMyPrivateScores((prev) => {
              const next: HoleScores = { ...incoming };
              if (editingMe && prev[editingHole] != null) {
                next[editingHole] = prev[editingHole];
              }
              return next;
            });
          }
        }

        const editingId = activePlayerIdRef.current;
        const editingHole = currentHoleRef.current;
        setPlayers((prevPlayers) =>
          data.players.map((p) => {
            const prev = prevPlayers.find((x) => x.id === p.entryId);
            const scores = { ...p.scores };
            if (
              prev &&
              editingId === p.entryId &&
              prev.scores[editingHole] != null
            ) {
              scores[editingHole] = prev.scores[editingHole];
            }
            return {
              id: p.entryId,
              name: p.name,
              scores,
              pending: { ...(p.pending ?? {}) },
              pickedUp: { ...(p.pickedUp ?? {}) },
            };
          })
        );
      } catch {
        setGroupLoading(false);
      }
    }

    void pull();
    const id = window.setInterval(pull, 2000);
    return () => window.clearInterval(id);
  }, [groupId?.trim(), meParam?.trim(), caddieParam?.trim()]);

  const playoffCapture = useMemo(
    () =>
      analyzePlayoffCapture(
        matchPlayInfo,
        players.map((p) => ({
          entryId: p.id,
          name: p.name,
          scores: p.scores,
        }))
      ),
    [matchPlayInfo, players]
  );

  const activePlayer = useMemo<PlayerRow | null>(() => {
    if (activePlayerId === ME_ID) {
      return { id: ME_ID, name: "Mi Score", scores: myPrivateScores };
    }
    return players.find((p) => p.id === activePlayerId) ?? null;
  }, [players, activePlayerId, myPrivateScores]);

  const signPlayer = useMemo(
    () => players.find((p) => p.id === signPlayerId) ?? null,
    [players, signPlayerId]
  );

  const isCardComplete = useCallback(
    (entryId: string | null) => {
      if (!entryId) return false;
      const player = players.find((p) => p.id === entryId);
      if (!player) return false;
      return ALL_HOLES.every(
        (h) => player.scores[h] != null || Boolean(player.pickedUp?.[h])
      );
    },
    [players]
  );

  const myCardComplete = isCardComplete(viewerEntryId);
  const witnessCardComplete = isCardComplete(witnessTargetEntryId);
  const mySig = viewerEntryId ? signaturesByEntry[viewerEntryId] : null;
  const witnessSig = witnessTargetEntryId
    ? signaturesByEntry[witnessTargetEntryId]
    : null;
  const myCardFullySigned = Boolean(
    mySig?.signedByPlayerAt && mySig?.signedByWitnessAt
  );
  const witnessCardFullySigned = Boolean(
    witnessSig?.signedByPlayerAt && witnessSig?.signedByWitnessAt
  );
  const myInitials = viewerEntryId
    ? getInitials(players.find((p) => p.id === viewerEntryId)?.name ?? "")
    : "";
  const witnessTargetInitials = witnessTargetEntryId
    ? getInitials(
        players.find((p) => p.id === witnessTargetEntryId)?.name ?? ""
      )
    : "";

  async function signCard(
    targetEntryId: string,
    role: "player" | "witness"
  ) {
    if (!viewerEntryId || !groupId) return;
    setSigningFor(`${targetEntryId}:${role}`);
    setSignError(null);
    try {
      const res = await fetch("/api/captura/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          entry_id: targetEntryId,
          role,
          me: viewerEntryId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        signedByPlayerAt?: string | null;
        signedByWitnessAt?: string | null;
      };
      if (!json.ok) {
        setSignError(json.error ?? "No se pudo firmar.");
        return;
      }
      setSignaturesByEntry((prev) => ({
        ...prev,
        [targetEntryId]: {
          signedByPlayerAt: json.signedByPlayerAt ?? null,
          signedByWitnessAt: json.signedByWitnessAt ?? null,
        },
      }));
    } catch {
      setSignError("Error de red al firmar.");
    } finally {
      setSigningFor(null);
    }
  }

  /**
   * Link a resultados en vivo del torneo, filtrado a la categoría del
   * jugador identificado (o del primer jugador supervisado si es caddie).
   */
  const liveLeaderboardUrl = useMemo(() => {
    if (!tournamentId) return null;
    let preferredEntryId: string | null = null;
    if (viewerEntryId) preferredEntryId = viewerEntryId;
    else if (caddieForEntryIds.length > 0) {
      preferredEntryId = caddieForEntryIds[0] ?? null;
    }
    const categoryId = preferredEntryId
      ? categoryByEntry[preferredEntryId] ?? null
      : null;
    const sp = new URLSearchParams();
    if (categoryId) sp.set("category_id", categoryId);
    sp.set("view", "live");
    return `/torneos/${tournamentId}?${sp.toString()}`;
  }, [tournamentId, viewerEntryId, caddieForEntryIds, categoryByEntry]);

  function isHoleComplete(hole: HoleNumber) {
    // Match play: el hoyo se considera "completo" si todos los jugadores
    // tienen score o levantaron (X).
    return players.every(
      (player) =>
        player.scores[hole] !== null || Boolean(player.pickedUp?.[hole])
    );
  }

  function getPlayerHoleScore(player: PlayerRow, hole: HoleNumber) {
    return player.scores[hole];
  }

  function setHoleScore(
    playerId: string,
    hole: HoleNumber,
    value: number | null,
    options?: { pickedUp?: boolean }
  ) {
    const pickedUp = Boolean(options?.pickedUp);
    const strokes = pickedUp
      ? PICKED_UP_STROKES
      : value === null
        ? null
        : Math.max(1, value);

    // Score privado del jugador identificado (tabla amber "Mi Score").
    if (playerId === ME_ID) {
      setMyPrivateScores((cur) => ({ ...cur, [hole]: strokes }));
      const entryForPrivate = viewerEntryId;
      if (!groupId || !entryForPrivate) return;
      savingRef.current = true;
      void fetch("/api/captura/private-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          entry_id: entryForPrivate,
          hole,
          strokes,
          me: entryForPrivate,
          caddie: caddieFromUrl ?? "",
        }),
      }).finally(() => {
        savingRef.current = false;
      });
      return;
    }

    setPlayers((current) =>
      current.map((player) => {
        if (player.id !== playerId) return player;
        const nextPickedUp = { ...(player.pickedUp ?? {}) };
        if (pickedUp) nextPickedUp[hole] = true;
        else delete nextPickedUp[hole];
        return {
          ...player,
          scores: {
            ...player.scores,
            [hole]: strokes,
          },
          pickedUp: nextPickedUp,
        };
      })
    );

    if (!groupId) return;

    const targetPlayer = players.find((p) => p.id === playerId);
    // "Autoridad" del jugador objetivo P (no marca rojo):
    //  - P (yo soy ese entry)
    //  - el caddie de P (P en mi lista caddieForEntryIds)
    //  - el testigo de P (mi entry === witness asignado a P)
    //  - el caddie del testigo de P (testigo de P está en mi caddieForEntryIds)
    // Cualquier otro miembro del grupo deja la celda en rojo si la
    // celda ya tenía valor.
    const iAmThePlayer = viewerEntryId === playerId;
    const iAmTheirCaddie = caddieForEntryIds.includes(playerId);
    const iAmTheirWitness =
      witnessTargetEntryId != null && witnessTargetEntryId === playerId;
    const witnessOfTarget = witnessesMap[playerId] ?? null;
    const iAmTheWitnessCaddie =
      witnessOfTarget != null && caddieForEntryIds.includes(witnessOfTarget);
    const isAuthoritative =
      iAmThePlayer ||
      iAmTheirCaddie ||
      iAmTheirWitness ||
      iAmTheWitnessCaddie;
    const mode: "modify" | "approve" = isAuthoritative ? "approve" : "modify";
    const role: "player" | "caddie" | "witness" | null = iAmThePlayer
      ? "player"
      : iAmTheirCaddie
        ? "caddie"
        : iAmTheirWitness
          ? "witness"
          : iAmTheWitnessCaddie
            ? "caddie"
            : null;

    // Optimista: modificación a celda con valor previo → rojo; aprobar → limpia.
    if (mode === "approve") {
      setPlayers((current) =>
        current.map((player) => {
          if (player.id !== playerId) return player;
          const nextPending = { ...(player.pending ?? {}) };
          delete nextPending[hole];
          return { ...player, pending: nextPending };
        })
      );
    } else if (targetPlayer?.scores[hole] != null && strokes != null) {
      setPlayers((current) =>
        current.map((player) =>
          player.id === playerId
            ? {
                ...player,
                pending: { ...(player.pending ?? {}), [hole]: true },
              }
            : player
        )
      );
    }

    savingRef.current = true;
    void fetch("/api/captura/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: groupId,
        entry_id: playerId,
        hole,
        strokes,
        picked_up: pickedUp,
        mode,
        role,
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          pendingWitness?: boolean;
        };
        if (!json.ok || typeof json.pendingWitness !== "boolean") return;
        setPlayers((current) =>
          current.map((player) => {
            if (player.id !== playerId) return player;
            const nextPending = { ...(player.pending ?? {}) };
            if (json.pendingWitness) nextPending[hole] = true;
            else delete nextPending[hole];
            return { ...player, pending: nextPending };
          })
        );
      })
      .finally(() => {
        savingRef.current = false;
      });
  }

  function selectPlayer(playerId: string) {
    let existing: number | null | undefined;
    if (playerId === ME_ID) {
      existing = myPrivateScores[currentHole];
    } else {
      const player = players.find((p) => p.id === playerId);
      existing = player?.scores[currentHole];
    }
    setActivePlayerId(playerId);
    setDraftScore(existing ? String(existing) : "");
    // Si abre con un valor previo, el primer dígito que escriba lo reemplaza
    // (no se concatena). Si no hay valor, también se empieza limpio.
    setDraftFresh(true);
  }

  function handleNumber(n: number) {
    if (!activePlayerId) return;

    const base = draftFresh ? "" : draftScore;
    const next = `${base}${n}`.replace(/^0+(?=\d)/, "");
    setDraftScore(next);
    if (draftFresh) setDraftFresh(false);

    const numeric = Number(next);
    if (numeric > 0) {
      setHoleScore(activePlayerId, currentHole, numeric);
    }
  }

  function handleClear() {
    if (!activePlayerId) return;
    setDraftScore("");
    setDraftFresh(false);
    setHoleScore(activePlayerId, currentHole, null);
  }

  function handleBackspace() {
    if (!activePlayerId) return;

    const next = draftScore.slice(0, -1);
    setDraftScore(next);
    setDraftFresh(false);

    if (!next) {
      setHoleScore(activePlayerId, currentHole, null);
      return;
    }

    const numeric = Number(next);
    if (numeric > 0) {
      setHoleScore(activePlayerId, currentHole, numeric);
    }
  }

  function handleEnter() {
    if (!activePlayerId) return;
    const numeric = Number(draftScore);
    if (Number.isFinite(numeric) && numeric > 0) {
      setHoleScore(activePlayerId, currentHole, numeric);
    }
    setActivePlayerId(null);
    setDraftScore("");
    setDraftFresh(false);
  }

  function handlePreset(playerId: string, value: number) {
    setHoleScore(playerId, currentHole, value);
    setActivePlayerId(null);
    setDraftScore("");
    setDraftFresh(false);
  }

  /** Match play: el jugador levanta (no termina el hoyo). Cuenta 10
   *  automático y pierde la bola alta. */
  function handlePickUp() {
    if (!activePlayerId) return;
    if (activePlayerId === ME_ID) return; // sólo aplica a tarjetas de grupo
    setHoleScore(activePlayerId, currentHole, null, { pickedUp: true });
    setActivePlayerId(null);
    setDraftScore("");
    setDraftFresh(false);
  }

  function handleOpenSign(playerId: string) {
    setSignPlayerId(playerId);
    setActivePlayerId(null);
    setDraftScore("");
    setDraftFresh(false);
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
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-black px-3 py-2 text-white">
          <div>
            <div className="text-sm font-semibold">List.golf</div>
            <div className="text-[10px] opacity-70">Captura por grupo</div>
          </div>
          <div className="flex items-center gap-2">
            <GpsChip
              entryId={viewerEntryId}
              caddieId={caddieFromUrl}
              groupId={groupId}
            />
            <BackButton
              fallbackHref={
                tournamentId
                  ? buildScoreEntryHref({ tournamentId })
                  : "/score-entry"
              }
              className="inline-flex items-center gap-1 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
            />
          </div>
        </header>

        {tab === "anotar" ? (
          <HoleDots
            currentHole={currentHole}
            onSelectHole={(hole) => {
              setCurrentHole(hole);
              setActivePlayerId(null);
              setDraftScore("");
              setDraftFresh(false);
            }}
            isHoleComplete={isHoleComplete}
            showPlayoff={playoffCapture.showPlayoffSection}
            decidedAtPlayoffHole={
              matchPlayInfo?.viaPlayoff
                ? matchPlayInfo.playoffHole ?? null
                : null
            }
          />
        ) : null}

        <div className="flex border-b bg-white">
          <button
            type="button"
            onClick={() => {
              if (tab === "tarjeta") leftTarjetaForAnotarRef.current = true;
              setTab("anotar");
              setActivePlayerId(null);
              setDraftScore("");
              setDraftFresh(false);
            }}
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
              if (leftTarjetaForAnotarRef.current) {
                setShowMyCard(false);
              } else {
                setShowMyCard(true);
              }
              setTab("tarjeta");
              setActivePlayerId(null);
              setDraftScore("");
              setDraftFresh(false);
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
              {playoffCapture.orphanPlayoffScores ? (
                <div className="rounded-md border border-amber-600 bg-amber-50 px-2 py-1.5 text-center text-[11px] font-semibold text-amber-950">
                  El match ya quedó decidido en la ronda normal (
                  {matchPlayInfo?.resultText}). Los scores de desempate no
                  cambian el resultado; puedes borrarlos o ignorarlos.
                </div>
              ) : null}
              {matchPlayInfo?.needsPlayoff ? (
                <div className="rounded-md border border-amber-500 bg-amber-50 px-2 py-1.5 text-center text-[11px] font-semibold text-amber-900">
                  Empate al 18 (AS). Procedan al desempate en muerte súbita
                  (hoyos 1-9). Cada hoyo sigue valiendo hasta 2 puntos
                  (1 bola baja + 1 bola alta). El match termina en el
                  primer hoyo donde una pareja saque <b>ventaja en
                  puntos</b>; si quedan 1-1 (cada pareja se llevó una
                  sub-competencia) el hoyo está empatado y siguen al
                  próximo.
                </div>
              ) : null}
              {playoffCapture.missingPlayerNames.length > 0 ? (
                <div className="rounded-md border border-red-400 bg-red-50 px-2 py-1.5 text-center text-[11px] font-semibold text-red-900">
                  Desempate P{playoffCapture.pendingPlayoffHole}: faltan los
                  scores de{" "}
                  {playoffCapture.missingPlayerNames.join(", ")}. Sin los 4
                  scores no se suman puntos ni se cierra el match.
                </div>
              ) : null}
              {matchPlayInfo &&
              !matchPlayInfo.needsPlayoff &&
              matchPlayInfo.decidedAtHole != null ? (
                <div className="rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-semibold text-emerald-900">
                  Match decidido: {matchPlayInfo.resultText}.
                </div>
              ) : null}

              <section className="rounded-xl bg-white px-3 py-3 text-center shadow-sm">
                <div className="text-base font-bold">
                  {currentHole > 18
                    ? `Desempate · Hoyo ${currentHole - 18}`
                    : `Hoyo ${currentHole}`}
                </div>
                <div className="text-xs text-slate-600">
                  Par {PAR_BY_HOLE[currentHole]}
                </div>
                <div className="text-[11px] text-slate-500">
                  {groupId
                    ? groupLoading
                      ? "Cargando grupo…"
                      : `Grupo vinculado · ${players.length} jugadores`
                    : "Modo demo (sin group_id)"}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={
                      groupId
                        ? buildCapturaTarjetaPath(groupId, meFromUrl, caddieFromUrl)
                        : "/captura/tarjeta?back=/score-entry/mobile"
                    }
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm"
                  >
                    Ver tarjeta completa
                  </a>
                  {liveLeaderboardUrl ? (
                    <a
                      href={liveLeaderboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-400 bg-emerald-50 px-4 text-sm font-semibold text-emerald-900 shadow-sm"
                    >
                      Resultados en vivo
                    </a>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2">
                {players.map((player) => {
                  const isActive = player.id === activePlayerId;
                  const currentHoleScore = getPlayerHoleScore(player, currentHole);
                  const isMe =
                    viewerEntryId != null && player.id === viewerEntryId;
                  const isWitnessTarget =
                    !isMe &&
                    witnessTargetEntryId != null &&
                    player.id === witnessTargetEntryId;
                  const isPendingHole = Boolean(player.pending?.[currentHole]);

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
                          : isMe
                            ? "border-sky-300 bg-sky-50"
                            : isWitnessTarget
                              ? "border-amber-400 bg-amber-50"
                              : "border-slate-200 bg-white",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex flex-1 items-center gap-1 truncate text-[15px] font-semibold">
                          <span className="truncate">{player.name}</span>
                          {isWitnessTarget ? (
                            <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
                              Testigo
                            </span>
                          ) : null}
                        </div>

                        <div className="text-xs text-slate-500">
                          {currentHoleScore ?? "-"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectPlayer(player.id)}
                          className={[
                            "flex h-11 w-[62px] shrink-0 items-center justify-center rounded-lg border text-2xl font-bold",
                            isPendingHole
                              ? "border-red-700 bg-red-500 text-white"
                              : "border-red-500 bg-red-50 text-black",
                          ].join(" ")}
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

                {/*
                  Card "MI SCORE" — sólo visible si el visitante está
                  identificado como jugador. Score privado: lo guarda
                  contra /api/captura/private-score.
                */}
                {viewerEntryId ? (() => {
                  const isActive = activePlayerId === ME_ID;
                  const currentHoleScore = myPrivateScores[currentHole];
                  return (
                    <div
                      key="me-private"
                      ref={(el) => {
                        playerRefs.current[ME_ID] = el;
                      }}
                      className={[
                        "rounded-xl border-2 px-3 py-2 shadow-sm",
                        isActive
                          ? "border-amber-600 bg-amber-100"
                          : "border-amber-400 bg-amber-50",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[15px] font-semibold text-amber-900">
                          MI SCORE (privado)
                        </div>
                        <div className="text-xs text-amber-800">
                          {currentHoleScore ?? "-"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectPlayer(ME_ID)}
                          className="flex h-11 w-[62px] shrink-0 items-center justify-center rounded-lg border border-amber-700 bg-amber-100 text-2xl font-bold text-amber-950"
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
                              key={`me-${btn.label}`}
                              type="button"
                              onClick={() => handlePreset(ME_ID, btn.value)}
                              className={[
                                "h-11 flex-1 rounded-lg border text-[10px] font-semibold",
                                currentHoleScore === btn.value
                                  ? "border-amber-700 bg-amber-300 text-amber-950"
                                  : "border-amber-400 bg-white text-amber-900",
                              ].join(" ")}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </section>
            </main>

            {activePlayerId && (
              <div className="fixed bottom-0 left-0 right-0 z-30">
                <div className="mx-auto w-full max-w-md border-t border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                    <span>{activePlayer?.name}</span>
                    <span className="text-slate-500">
                      Hoyo {currentHole} · Par {PAR_BY_HOLE[currentHole]}
                    </span>
                  </div>

                  <div
                    className={[
                      "mb-2 text-center text-3xl font-bold",
                      draftFresh ? "text-slate-400" : "text-black",
                    ].join(" ")}
                  >
                    {draftScore || "—"}
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

                  {matchPlayInfo && activePlayerId !== ME_ID ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handlePickUp}
                        title="Levantó: no terminó el hoyo (cuenta 10 automático y pierde bola alta)"
                        className="h-12 rounded-lg bg-amber-100 text-base font-extrabold text-amber-700"
                      >
                        X · levantó
                      </button>
                      <button
                        type="button"
                        onClick={handleEnter}
                        disabled={!draftScore || Number(draftScore) <= 0}
                        className="h-12 rounded-lg bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
                      >
                        Enter
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnter}
                      disabled={!draftScore || Number(draftScore) <= 0}
                      className="mt-2 h-12 w-full rounded-lg bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
                    >
                      Enter
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "tarjeta" && (
          <main className="flex-1 space-y-2 p-2">
            {/* Banner de testigo + toggle Mi Score (sólo visible si está identificado el jugador). */}
            {viewerEntryId ? (
              <section className="rounded-xl bg-white px-3 py-2 shadow-sm text-[11px]">
                {showMyCard && witnessTargetName ? (
                  <div
                    className={[
                      "rounded-md border px-2 py-1",
                      pendingForMeCount > 0
                        ? "border-red-400 bg-red-50 text-red-900"
                        : "border-emerald-400 bg-emerald-50 text-emerald-900",
                    ].join(" ")}
                  >
                    Eres testigo de <b>{witnessTargetName}</b>.{" "}
                    {pendingForMeCount > 0
                      ? `Hay ${pendingForMeCount} cambio${pendingForMeCount === 1 ? "" : "s"} por aprobar (celdas rojas).`
                      : "Sin cambios pendientes por aprobar."}
                  </div>
                ) : null}
                {showMyCard && myWitnessName ? (
                  <div className="mt-1 text-[10px] text-slate-500">
                    Tu testigo: {myWitnessName}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {liveLeaderboardUrl ? (
                    <a
                      href={liveLeaderboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-900"
                    >
                      Resultados en vivo
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowMyCard((v) => !v)}
                    className={[
                      "inline-flex rounded-lg border px-3 py-1.5 text-[11px] font-semibold",
                      showMyCard
                        ? "border-amber-400 bg-amber-100 text-amber-900"
                        : "border-slate-300 bg-white text-slate-900",
                    ].join(" ")}
                    aria-pressed={showMyCard}
                  >
                    {showMyCard ? "Ocultar Mi Score" : "Mostrar Mi Score"}
                  </button>
                </div>

                {/* Botones de firma (mis iniciales / testigo) + banner. */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {myCardComplete ? (
                    mySig?.signedByPlayerAt ? (
                      <span className="inline-flex rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
                        ✓ Firmado: {myInitials}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          viewerEntryId && signCard(viewerEntryId, "player")
                        }
                        disabled={signingFor === `${viewerEntryId}:player`}
                        className="inline-flex rounded-lg border border-sky-500 bg-sky-100 px-3 py-1.5 text-[11px] font-bold text-sky-900 disabled:opacity-60"
                      >
                        Firmar: {myInitials}
                      </button>
                    )
                  ) : null}

                  {witnessTargetEntryId && witnessCardComplete ? (
                    witnessSig?.signedByWitnessAt ? (
                      <span className="inline-flex rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
                        ✓ Testigo: {witnessTargetInitials}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          signCard(witnessTargetEntryId, "witness")
                        }
                        disabled={
                          signingFor === `${witnessTargetEntryId}:witness`
                        }
                        className="inline-flex rounded-lg border border-amber-500 bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-900 disabled:opacity-60"
                      >
                        Testigo: {witnessTargetInitials}
                      </button>
                    )
                  ) : null}
                </div>

                {signError ? (
                  <div className="mt-1 rounded-md border border-red-400 bg-red-50 px-2 py-1 text-[10px] text-red-900">
                    {signError}
                  </div>
                ) : null}

                {myCardFullySigned ? (
                  <div className="mt-2 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-bold text-emerald-900">
                    ✓ TU TARJETA ESTÁ ENTREGADA Y FIRMADA
                  </div>
                ) : null}
                {witnessTargetEntryId && witnessCardFullySigned ? (
                  <div className="mt-1 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-bold text-emerald-900">
                    ✓ Tarjeta de {witnessTargetName} · entregada y firmada
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="rounded-xl bg-white px-2 py-2 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">
                    Tarjeta completa
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Front 9 arriba · Back 9 abajo
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {liveLeaderboardUrl && !viewerEntryId ? (
                    <a
                      href={liveLeaderboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-900"
                    >
                      Resultados en vivo
                    </a>
                  ) : null}
                  <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                    Firmas {signedCount}/{players.length}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <CompactCardSection
                  title="FRONT 9"
                  holes={HOLES_FRONT}
                  players={players}
                  totalLabel="IN"
                  showGrandTotal={false}
                  highlightPlayerId={viewerEntryId}
                  witnessTargetPlayerId={witnessTargetEntryId}
                />

                <CompactCardSection
                  title="BACK 9"
                  holes={HOLES_BACK}
                  players={players}
                  totalLabel="OUT"
                  showGrandTotal
                  highlightPlayerId={viewerEntryId}
                  witnessTargetPlayerId={witnessTargetEntryId}
                />

                {/* Tarjeta de desempate (muerte súbita): se muestra
                    cuando hay AS al 18 o ya hay algún hoyo capturado del
                    playoff. Las cabeceras muestran H1..H9. */}
                {playoffCapture.showPlayoffSection ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-1">
                      <div className="px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-amber-900">
                        DESEMPATE · muerte súbita (hoyos 1-9)
                      </div>
                      <CompactCardSection
                        title="PLAYOFF"
                        holes={HOLES_PLAYOFF}
                        players={players}
                        totalLabel="PO"
                        showGrandTotal={false}
                        highlightPlayerId={viewerEntryId}
                        witnessTargetPlayerId={witnessTargetEntryId}
                        headerToneClass="bg-amber-700"
                        labelForHole={(h) => `H${(h as number) - 18}`}
                      />
                    </div>
                ) : null}
              </div>
            </section>

            {/* Sección "MI SCORE" — tarjeta privada del jugador. */}
            {viewerEntryId && showMyCard ? (
              <section className="rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-amber-900">
                      MI SCORE
                    </div>
                    <div className="text-[10px] text-amber-800">
                      Tarjeta privada · sólo la ven tú y tu caddie
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <PrivateCardSection
                    title="FRONT 9"
                    holes={HOLES_FRONT}
                    scores={myPrivateScores}
                    totalLabel="IN"
                    showGrandTotal={false}
                  />
                  <PrivateCardSection
                    title="BACK 9"
                    holes={HOLES_BACK}
                    scores={myPrivateScores}
                    totalLabel="OUT"
                    showGrandTotal
                  />
                </div>
              </section>
            ) : null}

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