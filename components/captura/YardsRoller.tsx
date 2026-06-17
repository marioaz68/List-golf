"use client";

import { useEffect, useRef } from "react";

interface YardsRollerProps {
  values: number[];
  value: number;
  onChange: (yards: number) => void;
  className?: string;
}

/** Roller horizontal compacto (scroll-snap) para ajustar yardas objetivo. */
export function YardsRoller({
  values,
  value,
  onChange,
  className = "",
}: YardsRollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const skipScrollRef = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || skipScrollRef.current) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;
    const left = child.offsetLeft - (el.clientWidth - child.clientWidth) / 2;
    el.scrollTo({ left, behavior: "smooth" });
  }, [value, values]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || !values.length) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.clientWidth / 2;
      const d = Math.abs(childCenter - center);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = values[bestIdx];
    if (next !== value) {
      skipScrollRef.current = true;
      onChange(next);
      requestAnimationFrame(() => {
        skipScrollRef.current = false;
      });
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-amber-400/90" />
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-9 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-[42%] shrink-0" aria-hidden />
        {values.map((y) => {
          const active = y === value;
          return (
            <button
              key={y}
              type="button"
              onClick={() => onChange(y)}
              className={[
                "snap-center shrink-0 px-2 text-center transition-all",
                active
                  ? "text-base font-black text-amber-300"
                  : "text-xs font-semibold text-slate-500",
              ].join(" ")}
            >
              {y}
            </button>
          );
        })}
        <div className="w-[42%] shrink-0" aria-hidden />
      </div>
    </div>
  );
}
