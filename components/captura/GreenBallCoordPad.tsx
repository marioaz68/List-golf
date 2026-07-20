"use client";

import { ChevronUp, ChevronDown } from "lucide-react";

export interface GreenBallCoord {
  /** Profundidad: desde el frente o el fondo del green. */
  fb: "front" | "back" | null;
  fbSteps: number;
  /** Lateral: desde la orilla izquierda o derecha. */
  lr: "left" | "right" | null;
  lrSteps: number;
}

/**
 * Pad de coordenadas de la bola en el green (igual al diagrama):
 *   A (atrás) arriba · F (frente) abajo · I (izq) · D (der).
 * Pasos de la bola a la orilla más cercana (1 paso ≈ 1 yarda).
 * Frente/atrás y izq/der son EXCLUYENTES: si uno tiene valor ≠ 0, el opuesto
 * queda deshabilitado hasta regresarlo a 0.
 */
export function GreenBallCoordPad({
  value,
  onChange,
}: {
  value: GreenBallCoord;
  onChange: (v: GreenBallCoord) => void;
}) {
  const setVert = (dir: "front" | "back", delta: number) => {
    const cur = value.fb === dir ? value.fbSteps : 0;
    const next = Math.max(0, cur + delta);
    onChange({ ...value, fb: next > 0 ? dir : null, fbSteps: next });
  };
  const setHorz = (dir: "left" | "right", delta: number) => {
    const cur = value.lr === dir ? value.lrSteps : 0;
    const next = Math.max(0, cur + delta);
    onChange({ ...value, lr: next > 0 ? dir : null, lrSteps: next });
  };

  const vVal = (dir: "front" | "back") => (value.fb === dir ? value.fbSteps : 0);
  const hVal = (dir: "left" | "right") => (value.lr === dir ? value.lrSteps : 0);
  // Deshabilita el opuesto cuando el otro está activo (≠ 0).
  const vDisabled = (dir: "front" | "back") =>
    value.fb != null && value.fb !== dir && value.fbSteps > 0;
  const hDisabled = (dir: "left" | "right") =>
    value.lr != null && value.lr !== dir && value.lrSteps > 0;

  const Box = ({ letter, val, onUp, onDown, active, disabled }: {
    letter: string; val: number; onUp: () => void; onDown: () => void; active: boolean; disabled: boolean;
  }) => (
    <div className="flex flex-col items-center" style={{ opacity: disabled ? 0.3 : 1 }}>
      <span className="mb-0.5 text-xs font-black text-amber-300">{letter}</span>
      <div
        className="flex flex-col items-center rounded-lg border-2 px-2 py-1"
        style={{ borderColor: active ? "#fbbf24" : "rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.55)" }}
      >
        <button
          type="button"
          onClick={onUp}
          disabled={disabled}
          className="flex h-11 w-14 items-center justify-center rounded-md text-amber-300 active:bg-amber-400/20"
        >
          <ChevronUp className="h-7 w-7" />
        </button>
        <span className="min-w-8 py-0.5 text-center text-2xl font-black tabular-nums text-white">{val}</span>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || val <= 0}
          className="flex h-11 w-14 items-center justify-center rounded-md text-amber-300 active:bg-amber-400/20 disabled:opacity-25"
        >
          <ChevronDown className="h-7 w-7" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-3 items-center justify-items-center gap-2">
      <div />
      <Box letter="A (atrás)" val={vVal("back")} active={value.fb === "back"} disabled={vDisabled("back")}
        onUp={() => setVert("back", 1)} onDown={() => setVert("back", -1)} />
      <div />

      <Box letter="I (izq)" val={hVal("left")} active={value.lr === "left"} disabled={hDisabled("left")}
        onUp={() => setHorz("left", 1)} onDown={() => setHorz("left", -1)} />
      <div className="text-3xl">⛳️</div>
      <Box letter="D (der)" val={hVal("right")} active={value.lr === "right"} disabled={hDisabled("right")}
        onUp={() => setHorz("right", 1)} onDown={() => setHorz("right", -1)} />

      <div />
      <Box letter="F (frente)" val={vVal("front")} active={value.fb === "front"} disabled={vDisabled("front")}
        onUp={() => setVert("front", 1)} onDown={() => setVert("front", -1)} />
      <div />
    </div>
  );
}
