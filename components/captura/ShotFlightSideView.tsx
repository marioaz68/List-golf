"use client";

import { useMemo } from "react";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";
import {
  buildFlightProfilePoints,
  flightApexHeightYards,
  launchAngleForClub,
  type CompletedShotArc,
  type ShotPreview,
} from "@/lib/distances/shotTrajectory";
import { CLUB_BY_ID } from "@/lib/distances/clubCatalog";

type FlightCurve = {
  key: string;
  carry: number;
  launch: number;
  color: string;
  landingColor: string;
  strokeNo?: number;
  label: string;
  dashed?: boolean;
};

function profilePathD(
  carry: number,
  launch: number,
  maxCarry: number,
  maxHeight: number,
  padX: number,
  padY: number,
  w: number,
  h: number
): string {
  const pts = buildFlightProfilePoints(carry, launch, 40);
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const toSvg = (x: number, y: number) => ({
    sx: padX + (x / maxCarry) * innerW,
    sy: padY + innerH - (y / maxHeight) * innerH,
  });
  const first = toSvg(pts[0].x, pts[0].y);
  let d = `M ${first.sx} ${first.sy}`;
  for (let i = 1; i < pts.length; i++) {
    const p = toSvg(pts[i].x, pts[i].y);
    d += ` L ${p.sx} ${p.sy}`;
  }
  return d;
}

function landingPoint(
  carry: number,
  maxCarry: number,
  maxHeight: number,
  padX: number,
  padY: number,
  w: number,
  h: number
): { x: number; y: number } {
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  return {
    x: padX + (carry / maxCarry) * innerW,
    y: padY + innerH,
  };
}

/** Vista lateral del vuelo (prueba 3D): preview verde + golpes confirmados ámbar. */
export function ShotFlightSideView({
  preview,
  completedArcs = [],
}: {
  preview?: ShotPreview | null;
  completedArcs?: CompletedShotArc[];
}) {
  const curves = useMemo(() => {
    const out: FlightCurve[] = [];

    for (const arc of completedArcs) {
      const carry = Math.round(
        yardsBetween(arc.from.lat, arc.from.lon, arc.to.lat, arc.to.lon)
      );
      if (carry <= 0) continue;
      const launch = launchAngleForClub(arc.catalogId, arc.swing);
      const clubLabel =
        CLUB_BY_ID[arc.catalogId]?.shortLabel ?? arc.catalogId;
      out.push({
        key: `done-${arc.strokeNo}`,
        carry,
        launch,
        color: "#fbbf24",
        landingColor: "#f59e0b",
        strokeNo: arc.strokeNo,
        label: `${clubLabel} · ${carry} yds`,
        dashed: launch <= 0,
      });
    }

    if (preview && preview.plannedYards > 0) {
      const launch = launchAngleForClub(preview.catalogId, preview.swing);
      const clubLabel =
        CLUB_BY_ID[preview.catalogId]?.shortLabel ?? preview.catalogId;
      out.push({
        key: "preview",
        carry: preview.plannedYards,
        launch,
        color: "#34d399",
        landingColor: "#6ee7b7",
        label: `${clubLabel} · ${preview.plannedYards} yds · plan`,
        dashed: launch <= 0,
      });
    }

    return out;
  }, [preview, completedArcs]);

  const layout = useMemo(() => {
    if (!curves.length) return null;

    const padX = 28;
    const padY = 24;
    const w = 280;
    const h = Math.min(140, 72 + curves.length * 8);
    const maxCarry = Math.max(...curves.map((c) => c.carry), 20);
    const maxHeight = Math.max(
      8,
      ...curves.map((c) => flightApexHeightYards(c.carry, c.launch))
    );

    const paths = curves.map((c) => ({
      ...c,
      d: profilePathD(
        c.carry,
        c.launch,
        maxCarry,
        maxHeight,
        padX,
        padY,
        w,
        h
      ),
      landing: landingPoint(
        c.carry,
        maxCarry,
        maxHeight,
        padX,
        padY,
        w,
        h
      ),
      apex: (() => {
        const innerW = w - padX * 2;
        const innerH = h - padY * 2;
        const apex = flightApexHeightYards(c.carry, c.launch);
        return {
          x: padX + (c.carry / 2 / maxCarry) * innerW,
          y: padY + innerH - (apex / maxHeight) * innerH,
          h: apex,
        };
      })(),
    }));

    const previewCurve = paths.find((p) => p.key === "preview");
    const startX = padX;
    const groundY = padY + (h - padY * 2);

    return { paths, maxCarry, padX, padY, w, h, previewCurve, startX, groundY };
  }, [curves]);

  if (!layout) return null;

  const { paths, maxCarry, padX, padY, w, h, previewCurve, startX, groundY } =
    layout;
  const doneCount = completedArcs.length;

  return (
    <div
      className="pointer-events-none fixed bottom-[15.5rem] right-2 z-[1062] w-[min(calc(100vw-1rem),18rem)] rounded-xl border border-emerald-400/40 bg-black/90 px-2 py-1.5 shadow-xl backdrop-blur-md"
      data-yardage-map-ui
    >
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-[9px] font-black uppercase tracking-wide text-emerald-300">
          Vuelo 3D · prueba
        </span>
        <span className="text-[9px] font-bold text-slate-400">
          {doneCount > 0
            ? `${doneCount} golpe${doneCount > 1 ? "s" : ""}${previewCurve ? " + plan" : ""}`
            : previewCurve
              ? "plan"
              : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-0.5 w-full" aria-hidden>
        <line
          x1={padX}
          y1={groundY}
          x2={w - padX}
          y2={groundY}
          stroke="rgba(148,163,184,0.45)"
          strokeWidth="1"
        />
        {paths.map((p) => (
          <g key={p.key}>
            <path
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.key === "preview" ? 2.5 : 2}
              strokeLinecap="round"
              strokeDasharray={p.dashed ? "4,4" : undefined}
              opacity={p.key === "preview" ? 1 : 0.82}
            />
            <circle
              cx={p.landing.x}
              cy={p.landing.y}
              r={p.key === "preview" ? 4 : 3.5}
              fill={p.landingColor}
              stroke="#0f172a"
              strokeWidth="1"
            />
            {p.strokeNo != null ? (
              <text
                x={p.landing.x}
                y={p.landing.y - 7}
                textAnchor="middle"
                fill="#fde68a"
                fontSize="8"
                fontWeight="900"
              >
                #{p.strokeNo}
              </text>
            ) : null}
            {p.key === "preview" && p.apex.h > 0 ? (
              <text
                x={p.apex.x}
                y={p.apex.y - 5}
                textAnchor="middle"
                fill="#a7f3d0"
                fontSize="7"
                fontWeight="800"
              >
                ↑ {p.apex.h} yds
              </text>
            ) : null}
          </g>
        ))}
        {previewCurve ? (
          <circle cx={startX} cy={groundY} r="3" fill="#3b82f6" />
        ) : null}
        <text
          x={w - padX}
          y={groundY + 10}
          textAnchor="end"
          fill="#64748b"
          fontSize="7"
          fontWeight="700"
        >
          {maxCarry} yds máx
        </text>
      </svg>
      <p className="text-center text-[8px] leading-tight text-slate-500">
        Ámbar = caídas marcadas · verde = plan actual
      </p>
    </div>
  );
}
