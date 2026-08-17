"use client";

import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import {
  teamPlayerName,
  teamPlayerNameWithPh,
  teamTournamentPhSum,
  formatPhSum,
} from "@/lib/matchplay/auctionTeamPh";

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

export function drumInitials(t: MatchPlayTeamRow): string {
  const a = teamPlayerName(t, "a");
  const b = teamPlayerName(t, "b");
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
  /** `tv` = tipografía y marco más grandes para proyección. */
  size?: "md" | "tv";
  className?: string;
};

/**
 * Tambor tipo ruleta de casino (vista frontal): segmentos de color,
 * nombres + PH de torneo, suma de PH, flecha y marco central.
 */
export default function CasinoAuctionDrum({
  teams,
  activeIndex,
  itemHeight,
  size = "md",
  className = "",
}: Props) {
  if (teams.length === 0) return null;

  const isTv = size === "tv";
  const rowH = itemHeight ?? (isTv ? 132 : 112);
  const idx = ((activeIndex % teams.length) + teams.length) % teams.length;
  const windowIdx = [-2, -1, 0, 1, 2].map(
    (d) => (idx + d + teams.length * 10) % teams.length
  );
  const nameCls = isTv
    ? "truncate text-[clamp(1.35rem,3.2vw,2.35rem)] font-black uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
    : "truncate text-[clamp(1rem,2.5vw,1.65rem)] font-black uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]";

  return (
    <div
      className={`relative mx-auto w-full ${isTv ? "max-w-5xl" : "max-w-3xl"} ${className}`}
    >
      <div
        className="pointer-events-none absolute left-0 z-30"
        style={{ top: "50%", transform: "translate(-70%, -50%)" }}
        aria-hidden
      >
        <div
          className="h-0 w-0"
          style={{
            borderTop: `${isTv ? 22 : 18}px solid transparent`,
            borderBottom: `${isTv ? 22 : 18}px solid transparent`,
            borderLeft: `${isTv ? 42 : 34}px solid #ef4444`,
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))",
          }}
        />
      </div>

      <div
        className={`relative overflow-hidden border-[#1a1d24] shadow-[0_20px_50px_rgba(0,0,0,0.55)] ${
          isTv
            ? "rounded-[36px] border-[10px]"
            : "rounded-[28px] border-[8px]"
        }`}
        style={{
          height: rowH * 5,
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
            height: rowH,
            top: "50%",
            marginTop: -rowH / 2,
          }}
        />

        {windowIdx.map((ti, row) => {
          const t = teams[ti]!;
          const color = drumSegmentColor(ti, t.id);
          const a = teamPlayerNameWithPh(t, "a");
          const b = teamPlayerNameWithPh(t, "b");
          const sum = formatPhSum(teamTournamentPhSum(t));
          const center = row === 2;
          return (
            <div
              key={`${t.id}-${row}`}
              className={`relative flex items-center gap-3 border-b border-black/25 ${
                isTv ? "px-6 pr-6" : "px-4 pr-5"
              }`}
              style={{
                height: rowH,
                background: `linear-gradient(90deg, ${color} 0%, ${color} 68%, rgba(0,0,0,0.2) 100%)`,
                boxShadow: center
                  ? "inset 0 0 0 9999px rgba(255,255,255,0.12)"
                  : undefined,
              }}
            >
              <div className="min-w-0 flex-1 text-left">
                <div className={nameCls}>{a}</div>
                {b ? <div className={`mt-0.5 ${nameCls} text-white/95`}>{b}</div> : null}
              </div>
              <div
                className={`flex shrink-0 flex-col items-center justify-center rounded-xl border-2 border-white/30 bg-black/30 ${
                  isTv ? "px-4 py-2" : "px-3 py-1.5"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/70 md:text-xs">
                  Σ PH
                </div>
                <div
                  className={`font-black text-white ${
                    isTv ? "text-2xl md:text-4xl" : "text-xl md:text-2xl"
                  }`}
                >
                  {sum}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
