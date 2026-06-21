"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import { defaultDistanciasCourseId } from "@/lib/distances/loadCourseReferencePoints";
import {
  pointAlongCenterline,
  createLocalProjector,
  yardsFromPlayerToCenter,
} from "@/lib/distances/fairway3DMath";
import type { LatLon } from "@/lib/distances/holeBoundary";

const HoleFairway3DPreview = dynamic(
  () =>
    import("@/components/captura/HoleFairway3DPreview").then(
      (m) => m.HoleFairway3DPreview
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
        Cargando vista 3D…
      </div>
    ),
  }
);

const DEMO_HOLES = [
  { no: 1, label: "H1 · prueba real" },
  { no: 15, label: "H15 · dogleg" },
  { no: 16, label: "H16 · largo" },
  { no: 10, label: "H10 · vuelta 2" },
] as const;

type HoleLayout = {
  holeNo: number;
  par: number;
  waypoints: LatLon[];
  center: LatLon;
  tee: LatLon;
  source: string;
};

export default function DistanciasDemo3DClient() {
  const searchParams = useSearchParams();
  const pruebaHref = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("prueba", "1");
    return `/captura/distancias?${p.toString()}`;
  }, [searchParams]);

  const [holeNo, setHoleNo] = useState(1);
  const [progress, setProgress] = useState(0);
  const [layout, setLayout] = useState<HoleLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const courseId = defaultDistanciasCourseId();
    void (async () => {
      try {
        const res = await fetch(
          `/api/captura/distancias/course-layout?course_id=${courseId}`
        );
        const data = (await res.json()) as {
          ok?: boolean;
          centerlines?: Array<{
            hole_number: number;
            source: string;
            waypoints: LatLon[];
          }>;
          greens?: Array<{
            hole_number: number;
            center: LatLon;
            front: LatLon;
            back: LatLon;
          }>;
        };
        if (cancelled) return;
        if (!data.ok) {
          setError("No se pudo cargar el layout del campo.");
          setLayout(null);
          return;
        }
        const cl = data.centerlines?.find((c) => c.hole_number === holeNo);
        const green = data.greens?.find((g) => g.hole_number === holeNo);
        const hp = CCQ_HOLE_POINTS[holeNo];
        if (!cl?.waypoints?.length || !green?.center || !hp?.tee) {
          setError(`Sin datos suficientes para el hoyo ${holeNo}.`);
          setLayout(null);
          return;
        }
        setLayout({
          holeNo,
          par: hp.par,
          waypoints: cl.waypoints,
          center: green.center,
          tee: hp.tee,
          source: cl.source,
        });
      } catch {
        if (!cancelled) {
          setError("Error de red al cargar el hoyo.");
          setLayout(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holeNo]);

  const playerLatLon = useMemo(() => {
    if (!layout) return null;
    const locals = layout.waypoints.map(createLocalProjector(layout.waypoints[0]));
    const p = pointAlongCenterline(locals, progress * 0.96);
    const mLon =
      111_320 * Math.cos((layout.waypoints[0].lat * Math.PI) / 180);
    return {
      lat: layout.waypoints[0].lat - p.z / 110_574,
      lon: layout.waypoints[0].lon + p.x / mLon,
    };
  }, [layout, progress]);

  const yardsToCenter = useMemo(() => {
    if (!layout || !playerLatLon) return 0;
    return yardsFromPlayerToCenter(playerLatLon, layout.center);
  }, [layout, playerLatLon]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      <div className="absolute inset-0">
        {loading ? (
          <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-400">
            Preparando hoyo {holeNo}…
          </div>
        ) : error || !layout ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-950 px-6 text-center text-sm text-red-200">
            <p>{error ?? "Sin datos."}</p>
            <Link href={pruebaHref} className="text-sky-300 underline">
              Volver al demo 2D
            </Link>
          </div>
        ) : (
          <HoleFairway3DPreview
            holeNo={layout.holeNo}
            waypoints={layout.waypoints}
            center={layout.center}
            progress={progress}
            yardsToCenter={yardsToCenter}
          />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[4.25rem] z-[1000] flex justify-center px-2">
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
          {DEMO_HOLES.map((h) => (
            <button
              key={h.no}
              type="button"
              onClick={() => {
                setHoleNo(h.no);
                setProgress(0);
              }}
              className={[
                "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                holeNo === h.no
                  ? "bg-violet-500 text-white"
                  : "text-slate-300 hover:bg-white/10",
              ].join(" ")}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {layout && !loading ? (
        <div className="pointer-events-none absolute inset-x-0 top-[6.25rem] z-[1000] flex justify-center px-2">
          <div className="rounded-full border border-white/15 bg-black/70 px-3 py-1 text-[11px] font-semibold text-emerald-100 backdrop-blur-sm">
            H{layout.holeNo} · par {layout.par} · {yardsToCenter} yds al hoyo · centerline{" "}
            {layout.source === "db" ? "calibrada" : "default"}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-4 pt-8">
        <div className="pointer-events-auto mx-auto max-w-md space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300">
            <span>Salida</span>
            <span>Caminar al green ({Math.round(progress * 100)}%)</span>
            <span>Hoyo</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(progress * 100)}
            onChange={(e) => setProgress(Number(e.target.value) / 100)}
            className="w-full accent-violet-500"
            aria-label="Simular avance tee a green"
          />
          <p className="text-center text-[10px] leading-snug text-slate-400">
            Hoyo 1 con árboles, rough, tee y bunkers · cámara detrás del jugador ·
            bandera en el centro calibrado.
          </p>
          <div className="flex justify-center pt-1">
            <Link
              href="/captura/distancias"
              className="rounded-lg border border-emerald-500/40 bg-emerald-950/80 px-3 py-1.5 text-[11px] font-bold text-emerald-100"
            >
              Yardas real
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
