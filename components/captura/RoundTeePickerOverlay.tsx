"use client";

import { useState } from "react";
import {
  CCQ_CALIBRATION_TEE_SETS,
  teeSetLabel,
  type TeeSetCode,
} from "@/lib/distances/teePositions";

export function RoundTeePickerOverlay({
  holeNo,
  selectedCode,
  onSelect,
}: {
  holeNo: number;
  selectedCode: TeeSetCode;
  onSelect: (code: TeeSetCode, startHole: number) => void;
}) {
  const [startHole, setStartHole] = useState<number>(holeNo === 10 ? 10 : 1);

  return (
    <div className="pointer-events-none absolute inset-0 z-[1120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border-2 border-emerald-400/50 bg-slate-950 px-4 py-4 shadow-2xl">
        {/* 1) ¿Por dónde sales? */}
        <p className="text-center text-base font-black text-emerald-50">
          ¿Por dónde sales?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[1, 10].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setStartHole(h)}
              className={[
                "rounded-xl border px-2 py-3 text-[13px] font-black shadow-lg active:scale-[0.98]",
                startHole === h
                  ? "border-amber-300 bg-amber-500 text-black ring-2 ring-amber-400/80"
                  : "border-white/30 bg-black/60 text-amber-100",
              ].join(" ")}
            >
              Hoyo {h}
            </button>
          ))}
        </div>

        {/* 2) ¿Desde qué marca? — al tocar, confirma con el hoyo elegido. */}
        <p className="mt-4 text-center text-base font-black text-emerald-50">
          ¿Desde qué salida juegas?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CCQ_CALIBRATION_TEE_SETS.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => onSelect(t.code, startHole)}
              className={[
                "rounded-xl border px-2 py-3 text-[12px] font-black shadow-lg active:scale-[0.98]",
                selectedCode === t.code
                  ? "border-amber-400 ring-2 ring-amber-400/80"
                  : "",
                t.chipClass,
              ].join(" ")}
            >
              {t.name}
            </button>
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] leading-snug text-slate-400">
          Sales por el hoyo {startHole} desde la salida que elijas · luego elige
          bastón.
        </p>
      </div>
    </div>
  );
}
