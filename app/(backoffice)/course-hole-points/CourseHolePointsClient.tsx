"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import {
  hasGreenOverride,
  resolveHoleGreenPoints,
  type HoleGreenOverride,
  type LatLon,
} from "@/lib/distances/greenPoints";
import {
  REFERENCE_KIND_LABELS,
  type DbReferencePoint,
  type DbReferencePointKind,
} from "@/lib/distances/courseReferencePoints";
import {
  deleteCourseHolePoint,
  saveCourseHolePoint,
  saveHoleGreenPoints,
} from "./actions";
import type { GreenPointKey } from "@/components/captura/GreenPointsEditorMap";

const CoursePointEditorMap = dynamic(
  () =>
    import("@/components/captura/CoursePointEditorMap").then(
      (m) => m.CoursePointEditorMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-lg bg-slate-800" />
    ),
  }
);

const GreenPointsEditorMap = dynamic(
  () =>
    import("@/components/captura/GreenPointsEditorMap").then(
      (m) => m.GreenPointsEditorMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-lg bg-slate-800" />
    ),
  }
);

type Course = { id: string; name: string | null; club_name: string | null };
type EditorMode = "green" | "custom";

interface Props {
  courses: Course[];
  courseId: string;
  initialPoints: DbReferencePoint[];
  initialGreenOverrides: HoleGreenOverride[];
}

export default function CourseHolePointsClient({
  courses,
  courseId,
  initialPoints,
  initialGreenOverrides,
}: Props) {
  const [mode, setMode] = useState<EditorMode>("green");
  const [hole, setHole] = useState(1);
  const [pending, setPending] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [label, setLabel] = useState("");
  const [shortLabel, setShortLabel] = useState("");
  const [kind, setKind] = useState<DbReferencePointKind>("bunker");
  const [greenDraft, setGreenDraft] = useState<{
    front: LatLon;
    center: LatLon;
    back: LatLon;
  }>(() => {
    const hp = CCQ_HOLE_POINTS[1];
    return { front: hp.front, center: hp.center, back: hp.back };
  });
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, startTransition] = useTransition();
  const router = useRouter();

  const savedGreen = useMemo(
    () => initialGreenOverrides.find((g) => g.holeNumber === hole) ?? null,
    [initialGreenOverrides, hole]
  );

  const holePoints = useMemo(
    () => initialPoints.filter((p) => p.holeNumber === hole),
    [initialPoints, hole]
  );

  useEffect(() => {
    const resolved = resolveHoleGreenPoints(hole, savedGreen);
    setGreenDraft({
      front: resolved.front,
      center: resolved.center,
      back: resolved.back,
    });
  }, [hole, savedGreen]);

  const onMapClick = (lat: number, lon: number) => {
    setPending({ lat, lon });
    setError(null);
  };

  const onGreenDrag = (key: GreenPointKey, lat: number, lon: number) => {
    setGreenDraft((prev) => ({ ...prev, [key]: { lat, lon } }));
    setError(null);
  };

  const saveGreen = () => {
    const fd = new FormData();
    fd.set("course_id", courseId);
    fd.set("hole_number", String(hole));
    fd.set("front_lat", String(greenDraft.front.lat));
    fd.set("front_lon", String(greenDraft.front.lon));
    fd.set("center_lat", String(greenDraft.center.lat));
    fd.set("center_lon", String(greenDraft.center.lon));
    fd.set("back_lat", String(greenDraft.back.lat));
    fd.set("back_lon", String(greenDraft.back.lon));
    startTransition(async () => {
      try {
        await saveHoleGreenPoints(fd);
        setError(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar green");
      }
    });
  };

  const savePoint = () => {
    if (!pending) {
      setError("Toca el mapa para elegir la ubicación.");
      return;
    }
    if (!label.trim()) {
      setError("Escribe un nombre para el punto.");
      return;
    }
    const fd = new FormData();
    fd.set("course_id", courseId);
    fd.set("hole_number", String(hole));
    fd.set("label", label.trim());
    fd.set("short_label", shortLabel.trim());
    fd.set("kind", kind);
    fd.set("lat", String(pending.lat));
    fd.set("lon", String(pending.lon));
    fd.set("sort_order", String(holePoints.length));
    startTransition(async () => {
      try {
        await saveCourseHolePoint(fd);
        setPending(null);
        setLabel("");
        setShortLabel("");
        setError(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  };

  const removePoint = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        await deleteCourseHolePoint(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al eliminar");
      }
    });
  };

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-slate-300">
          Campo
          <select
            name="course_id"
            defaultValue={courseId}
            className="mt-1 block rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.club_name ?? c.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold text-white"
        >
          Cambiar campo
        </button>
      </form>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("green");
            setError(null);
          }}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-bold",
            mode === "green"
              ? "bg-emerald-600 text-white"
              : "bg-slate-800 text-slate-300",
          ].join(" ")}
        >
          Greens (entrada / centro / atrás)
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("custom");
            setError(null);
          }}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-bold",
            mode === "custom"
              ? "bg-emerald-600 text-white"
              : "bg-slate-800 text-slate-300",
          ].join(" ")}
        >
          Otros puntos (bunkers, agua…)
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setHole(n);
              setPending(null);
              setError(null);
            }}
            className={[
              "min-w-[2rem] rounded px-2 py-1 text-xs font-bold",
              n === hole
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
      </div>

      {mode === "green" ? (
        <>
          <GreenPointsEditorMap
            holeNo={hole}
            front={greenDraft.front}
            center={greenDraft.center}
            back={greenDraft.back}
            onDrag={onGreenDrag}
          />
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <h2 className="text-sm font-bold text-white">
              Calibrar green · Hoyo {hole}
            </h2>
            <p className="mt-1 text-[11px] text-slate-400">
              Arrastra los <strong className="text-emerald-300">puntos verdes</strong>{" "}
              hasta la entrada, centro y atrás del green. Guarda una vez por hoyo;
              la mini app de yardas usará estas coordenadas.
            </p>
            {savedGreen && hasGreenOverride(savedGreen) ? (
              <p className="mt-1 text-[11px] text-emerald-300">
                ✓ Este hoyo ya tiene green calibrado en el sistema.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-amber-300">
                Usando posición automática (polígono). Arrastra y guarda para
                corregir.
              </p>
            )}
            {error ? (
              <p className="mt-2 text-xs text-red-300">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={pendingAction}
              onClick={saveGreen}
              className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {pendingAction ? "Guardando…" : "Guardar green del hoyo"}
            </button>
          </div>
        </>
      ) : (
        <>
          <CoursePointEditorMap
            holeNo={hole}
            points={holePoints}
            pendingLatLon={pending}
            onMapClick={onMapClick}
          />

          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <h2 className="text-sm font-bold text-white">
              Nuevo punto · Hoyo {hole}
            </h2>
            {pending ? (
              <p className="mt-1 text-[11px] text-emerald-300">
                Ubicación: {pending.lat.toFixed(6)}, {pending.lon.toFixed(6)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                Toca el mapa para marcar la ubicación.
              </p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-300">
                Nombre
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej. Bunker derecho"
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-300">
                Etiqueta corta (mapa)
                <input
                  value={shortLabel}
                  onChange={(e) => setShortLabel(e.target.value)}
                  placeholder="Ej. BK"
                  maxLength={6}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-300 sm:col-span-2">
                Tipo
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as DbReferencePointKind)
                  }
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-white"
                >
                  {(
                    Object.keys(REFERENCE_KIND_LABELS) as DbReferencePointKind[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {REFERENCE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? (
              <p className="mt-2 text-xs text-red-300">{error}</p>
            ) : null}
            <button
              type="button"
              disabled={pendingAction}
              onClick={savePoint}
              className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {pendingAction ? "Guardando…" : "Guardar punto"}
            </button>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-white">
              Puntos del hoyo {hole} ({holePoints.length})
            </h2>
            {holePoints.length === 0 ? (
              <p className="text-xs text-slate-400">
                Sin puntos personalizados además del green.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {holePoints.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {p.label}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {REFERENCE_KIND_LABELS[p.kind]} · {p.lat.toFixed(5)},{" "}
                        {p.lon.toFixed(5)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={() => removePoint(p.id)}
                      className="shrink-0 rounded border border-red-700/50 px-2 py-1 text-[10px] text-red-300"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
