"use client";

import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";

export const AUCTION_DRUM_COLORS = [
  "#e11d48",
  "#0284c7",
  "#ca8a04",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0d9488",
  "#4f46e5",
  "#c026d3",
] as const;

export function drumPlayerLine(
  t: MatchPlayTeamRow,
  which: "a" | "b"
): string {
  const row = which === "a" ? t.player_a : t.player_b;
  if (row) return formatPlayerName(row.player);
  if (which === "a") return t.team_name?.split("/")[0]?.trim() || "—";
  const parts = (t.team_name ?? "").split("/");
  return parts[1]?.trim() || "";
}

export function drumInitials(t: MatchPlayTeamRow): string {
  const a = drumPlayerLine(t, "a");
  const b = drumPlayerLine(t, "b");
  return ((a.trim().charAt(0) || "?") + (b.trim().charAt(0) || "")).toUpperCase();
}

export function drumSegmentColor(index: number, teamId: string): string {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) {
    h = (h + teamId.charCodeAt(i) * (i + 1)) % 997;
  }
  return AUCTION_DRUM_COLORS[(index + h) % AUCTION_DRUM_COLORS.length]!;
}

type Props = {
  teams: MatchPlayTeamRow[];
  activeIndex: number;
  itemHeight?: number;
  className?: string;
};

/**
 * Tambor tipo ruleta de casino (vista frontal): segmentos de color,
 * nombres a la izquierda, iniciales a la derecha, flecha y marco central.
 */
export default function CasinoAuctionDrum({
  teams,
  activeIndex,
  itemHeight = 112,
  className = "",
}: Props) {
  if (teams.length === 0) return null;

  const idx = ((activeIndex % teams.length) + teams.length) % teams.length;
  // Mostrar 5 ranuras: 2 arriba, centro, 2 abajo
  const windowIdx = [-2, -1, 0, 1, 2].map(
    (d) => (idx + d + teams.length * 10) % teams.length
  );

  return (
    <div className={`relative mx-auto w-full max-w-3xl ${className}`}>
      {/* Flecha */}
      <div
        className="pointer-events-none absolute left-0 z-30"
        style={{ top: "50%", transform: "translate(-70%, -50%)" }}
        aria-hidden
      >
        <div
          className="h-0 w-0"
          style={{
            borderTop: "18px solid transparent",
            borderBottom: "18px solid transparent",
            borderLeft: "34px solid #ef4444",
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
          }}
        />
      </div>

      <div
        className="relative overflow-hidden rounded-[28px] border-[8px] border-[#1a1d24] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
        style={{
          height: itemHeight * 5,
          background:
            "linear-gradient(90deg, #0b0d12 0%, #151922 8%, #0f1218 50%, #151922 92%, #0b0d12 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-4 bg-gradient-to-r from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-4 bg-gradient-to-l from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(0,0,0,0.4)_0%,transparent_18%,transparent_82%,rgba(0,0,0,0.4)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[18%] bg-gradient-to-b from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[18%] bg-gradient-to-t from-black/70 to-transparent" />

        <div
          className="pointer-events-none absolute inset-x-2 z-20 rounded-lg border-[3px] border-white/90 shadow-[0_0_0_2px_rgba(239,68,68,0.5),0_0_28px_rgba(251,191,36,0.3)]"
          style={{
            height: itemHeight,
            top: "50%",
            marginTop: -itemHeight / 2,
          }}
        />

        {windowIdx.map((ti, row) => {
          const t = teams[ti]!;
          const color = drumSegmentColor(ti, t.id);
          const a = drumPlayerLine(t, "a");
          const b = drumPlayerLine(t, "b");
          const center = row === 2;
          return (
            <div
              key={`${t.id}-${row}`}
              className="relative flex items-center gap-3 border-b border-black/25 px-4 pr-5"
              style={{
                height: itemHeight,
                background: `linear-gradient(90deg, ${color} 0%, ${color} 72%, rgba(0,0,0,0.18) 100%)`,
                boxShadow: center
                  ? "inset 0 0 0 9999px rgba(255,255,255,0.12)"
                  : undefined,
              }}
            >
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[clamp(1.1rem,2.8vw,1.85rem)] font-black uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                  {a}
                </div>
                {b ? (
                  <div className="mt-0.5 truncate text-[clamp(1.1rem,2.8vw,1.85rem)] font-black uppercase leading-[0.95] tracking-tight text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                    {b}
                  </div>
                ) : null}
              </div>
              <div
                className="flex aspect-square h-[70%] shrink-0 items-center justify-center rounded-full border-4 border-white/35 bg-black/25 text-lg font-black text-white md:text-2xl"
                aria-hidden
              >
                {drumInitials(t)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
