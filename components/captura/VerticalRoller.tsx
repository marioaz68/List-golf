"use client";

import { useEffect, useRef } from "react";

interface VerticalRollerProps {
  values: string[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/** Roller vertical: solo se lee el valor centrado (scroll-snap). */
export function VerticalRoller({
  values,
  value,
  onChange,
  className = "",
}: VerticalRollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const skipScrollRef = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || skipScrollRef.current) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;
    const top = child.offsetTop - (el.clientHeight - child.clientHeight) / 2;
    el.scrollTo({ top, behavior: "smooth" });
  }, [value, values]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || !values.length) return;
    const center = el.scrollTop + el.clientHeight / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i] as HTMLElement;
      const childCenter = child.offsetTop + child.clientHeight / 2;
      const d = Math.abs(childCenter - center);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = values[bestIdx];
    if (next && next !== value) {
      skipScrollRef.current = true;
      onChange(next);
      requestAnimationFrame(() => {
        skipScrollRef.current = false;
      });
    }
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-amber-400/80" />
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="h-[32%] shrink-0" aria-hidden />
        {values.map((label) => {
          const active = label === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(label)}
              className={[
                "flex w-full snap-center items-center justify-center py-0.5 transition-all",
                active
                  ? "text-sm font-black text-amber-300"
                  : "text-[10px] font-semibold text-slate-600 opacity-40",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
        <div className="h-[32%] shrink-0" aria-hidden />
      </div>
    </div>
  );
}
