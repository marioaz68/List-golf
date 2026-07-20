"use client";

import { useEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface VerticalRollerProps {
  values: string[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Claves estables por ítem (evita colisiones en listas largas). */
  itemKeys?: string[];
}

/** Índice del primer botón (hay un spacer arriba). */
const FIRST_ITEM_CHILD_INDEX = 1;

/** Roller vertical: solo se lee el valor centrado (scroll-snap). */
export function VerticalRoller({
  values,
  value,
  onChange,
  className = "",
  itemKeys,
}: VerticalRollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const ignoreScrollRef = useRef(true);
  const mountedRef = useRef(false);
  const scrollCommitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;

    ignoreScrollRef.current = true;
    const child = el.children[idx + FIRST_ITEM_CHILD_INDEX] as
      | HTMLElement
      | undefined;
    if (!child) return;

    const top = child.offsetTop - (el.clientHeight - child.clientHeight) / 2;
    el.scrollTo({
      top,
      behavior: mountedRef.current ? "smooth" : "auto",
    });
    mountedRef.current = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false;
      });
    });
  }, [value, values]);

  const commitNearestValue = () => {
    const el = scrollerRef.current;
    if (!el || !values.length) return;

    const center = el.scrollTop + el.clientHeight / 2;
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < values.length; i++) {
      const child = el.children[i + FIRST_ITEM_CHILD_INDEX] as HTMLElement;
      if (!child) continue;
      const childCenter = child.offsetTop + child.clientHeight / 2;
      const d = Math.abs(childCenter - center);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const next = values[bestIdx];
    if (next && next !== value) {
      onChange(next);
    }
  };

  const handleScroll = () => {
    if (ignoreScrollRef.current) return;
    if (scrollCommitTimerRef.current) {
      window.clearTimeout(scrollCommitTimerRef.current);
    }
    scrollCommitTimerRef.current = window.setTimeout(commitNearestValue, 110);
  };

  useEffect(() => {
    return () => {
      if (scrollCommitTimerRef.current) {
        window.clearTimeout(scrollCommitTimerRef.current);
      }
    };
  }, []);

  const step = (delta: number) => {
    const idx = values.indexOf(value);
    if (idx < 0) return;
    const ni = Math.min(values.length - 1, Math.max(0, idx + delta));
    const next = values[ni];
    if (next && next !== value) onChange(next);
  };

  const idx = values.indexOf(value);

  return (
    <div className={`relative ${className}`}>
      {/* Flechas de precisión (fuera de la máscara para que se vean bien). */}
      <button
        type="button"
        aria-label="Subir"
        onClick={() => step(-1)}
        disabled={idx <= 0}
        className="absolute inset-x-0 top-0 z-20 flex justify-center py-0.5 text-amber-300 disabled:opacity-25"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Bajar"
        onClick={() => step(1)}
        disabled={idx < 0 || idx >= values.length - 1}
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center py-0.5 text-amber-300 disabled:opacity-25"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      <div
        className="relative h-full overflow-hidden"
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
        {values.map((label, i) => {
          const active = label === value;
          return (
            <button
              key={itemKeys?.[i] ?? label}
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
    </div>
  );
}
