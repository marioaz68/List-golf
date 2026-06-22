"use client";

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
  onSelect: (code: TeeSetCode) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border-2 border-emerald-400/50 bg-slate-950 px-4 py-4 shadow-2xl">
        <p className="text-center text-base font-black text-emerald-50">
          ¿Desde qué salida juegas?
        </p>
        <p className="mt-1 text-center text-[11px] leading-snug text-slate-300">
          Hoyo {holeNo} · aplica a todo el campo (18 hoyos)
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CCQ_CALIBRATION_TEE_SETS.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => onSelect(t.code)}
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
          La bola quedará en la salida calibrada de{" "}
          {teeSetLabel(selectedCode)} · luego elige bastón.
        </p>
      </div>
    </div>
  );
}
