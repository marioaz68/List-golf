import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { saveCourseHoles, seedCourseHoles } from "./actions";
import {
  backofficeTableStickyScroll,
  twStickyTheadGray50,
} from "@/lib/ui/backofficeTableSticky";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Course = {
  id: string;
  name: string | null;
  club_name: string | null;
};

type HoleRow = {
  hole_number: number;
  par: number;
  handicap_index: number | null;
  pace_minutes: number | null;
};

function buildDefaultHoles(): HoleRow[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
    pace_minutes: null,
  }));
}

function formatTotalPace(holes: HoleRow[]): string {
  const total = holes.reduce((acc, h) => acc + (h.pace_minutes ?? 0), 0);
  if (total <= 0) return "—";
  const hh = Math.floor(total / 60);
  const mm = Math.round(total % 60);
  return `${total} min (${hh}:${String(mm).padStart(2, "0")})`;
}

export default async function CourseHolesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const courseId = typeof sp.course_id === "string" ? sp.course_id.trim() : "";

  const { data: cData, error: cErr } = await supabase
    .from("courses")
    .select("id, name, club_name, created_at")
    .order("name", { ascending: true });

  if (cErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-base font-semibold leading-none text-white">
          Tarjeta base del campo
        </h1>
        <p className="text-xs text-red-200">
          Error cargando campos: {cErr.message}
        </p>
      </div>
    );
  }

  const courses: Course[] = (cData ?? []) as Course[];
  const effectiveCourseId = courseId || (courses[0]?.id ?? "");

  if (!courseId && effectiveCourseId) {
    redirect(`/course-holes?course_id=${effectiveCourseId}`);
  }

  let holes: HoleRow[] = buildDefaultHoles();
  let hasRealRows = false;
  let holesError = "";

  if (effectiveCourseId) {
    const { data, error } = await supabase
      .from("course_holes")
      .select("hole_number, par, handicap_index, pace_minutes")
      .eq("course_id", effectiveCourseId)
      .order("hole_number", { ascending: true });

    if (error) {
      holesError = error.message;
    } else if (data && data.length > 0) {
      hasRealRows = true;
      holes = (data as any[]).map((r) => ({
        hole_number: Number(r.hole_number),
        par: Number(r.par),
        handicap_index:
          r.handicap_index == null ? null : Number(r.handicap_index),
        pace_minutes:
          r.pace_minutes == null ? null : Number(r.pace_minutes),
      }));
    }
  }

  const courseLabel = (c: Course) => {
    const n = (c.name ?? "").trim() || `Campo ${c.id.slice(0, 8)}`;
    const club = (c.club_name ?? "").trim();
    return club ? `${club} · ${n}` : n;
  };

  return (
    <div className="space-y-2 p-3">
      <div className="rounded border border-white/15 bg-white/10 px-2 py-1.5">
        <div className="flex flex-col gap-1.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">
            Tarjeta base del campo
          </div>

          <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:items-center">
            {courses.length === 0 ? (
              <div className="text-[11px] text-red-200">
                No hay campos. Crea uno primero en /courses.
              </div>
            ) : (
              <form
                method="GET"
                action="/course-holes"
                className="flex flex-wrap items-center gap-1"
              >
                <select
                  name="course_id"
                  defaultValue={effectiveCourseId}
                  className="h-7 min-w-[260px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {courseLabel(c)}
                    </option>
                  ))}
                </select>

                <button
                  className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
                  type="submit"
                >
                  Cambiar
                </button>

                <a
                  href="/courses"
                  className="inline-flex min-h-7 items-center justify-center rounded border border-gray-300 bg-white px-2.5 text-[11px] font-medium leading-none text-gray-700 hover:bg-gray-50"
                >
                  Campos
                </a>
              </form>
            )}
          </div>
        </div>
      </div>

      {holesError && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-700">
          {holesError}
        </div>
      )}

      <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
        <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
              Configuración de hoyos
            </div>
            <div className="mt-1 text-[11px] leading-none text-gray-500">
              Edita los 18 hoyos. Par entre 3 y 6. HCP hoyo entre 1 y 18.
              Ritmo = minutos objetivo por hoyo (ritmo del torneo).
            </div>
            <div className="mt-1 text-[11px] font-semibold leading-none text-gray-700">
              Ritmo total ronda: {formatTotalPace(holes)}
            </div>
          </div>

          {!hasRealRows && effectiveCourseId ? (
            <form action={seedCourseHoles}>
              <input type="hidden" name="course_id" value={effectiveCourseId} />
              <button
                className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
                type="submit"
              >
                Generar 18 hoyos base
              </button>
            </form>
          ) : null}
        </div>

        <form action={saveCourseHoles} className="space-y-1">
          <input type="hidden" name="course_id" value={effectiveCourseId} />

          <div className="rounded border border-gray-300" style={backofficeTableStickyScroll}>
            <table className="min-w-[680px] w-full border-collapse text-[11px] text-black">
              <thead className={twStickyTheadGray50}>
                <tr>
                  <th className="w-24 border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Hoyo
                  </th>
                  <th className="w-32 border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Par
                  </th>
                  <th className="w-40 border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    HCP hoyo
                  </th>
                  <th className="w-40 border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Ritmo (min)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-black">
                {holes.map((h) => (
                  <tr key={h.hole_number}>
                    <td className="border border-gray-300 px-1.5 py-[3px] font-medium leading-none">
                      {h.hole_number}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        name={`par_${h.hole_number}`}
                        type="number"
                        min="3"
                        max="6"
                        defaultValue={h.par}
                        className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
                        required
                        disabled={!effectiveCourseId}
                      />
                    </td>
                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        name={`hcp_${h.hole_number}`}
                        type="number"
                        min="1"
                        max="18"
                        defaultValue={h.handicap_index ?? ""}
                        className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
                        required
                        disabled={!effectiveCourseId}
                      />
                    </td>
                    <td className="border border-gray-300 px-1.5 py-[3px]">
                      <input
                        name={`pace_${h.hole_number}`}
                        type="number"
                        min="1"
                        max="60"
                        step="0.5"
                        defaultValue={h.pace_minutes ?? ""}
                        placeholder="16"
                        className="h-7 w-full rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
                        disabled={!effectiveCourseId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-3 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!effectiveCourseId}
              type="submit"
            >
              Guardar hoyos
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}