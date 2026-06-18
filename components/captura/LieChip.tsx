"use client";

import { lieChipClass, lieLabel, type LieKind } from "@/lib/distances/detectLie";

interface LieChipProps {
  kind: LieKind;
  size?: "sm" | "md";
  className?: string;
}

/** Etiqueta visible del lie (Fairway, Rough, Green, …). */
export function LieChip({ kind, size = "md", className = "" }: LieChipProps) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-md border font-black uppercase tracking-wide shadow",
        size === "sm"
          ? "px-1.5 py-0.5 text-[9px]"
          : "px-2 py-0.5 text-[10px]",
        lieChipClass(kind),
        className,
      ].join(" ")}
    >
      {lieLabel(kind)}
    </span>
  );
}
