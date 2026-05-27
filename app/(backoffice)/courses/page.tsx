import { createClient } from "@/utils/supabase/server";
import {
  createCourse,
  updateCourse,
  saveCourseHoles,
  saveCourseTeeSets,
} from "./actions";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import {
  backofficeTableStickyScroll,
  twStickyTheadGray50,
} from "@/lib/ui/backofficeTableSticky";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Course = {
  id: string;
  name: string;
  club_name: string | null;
  club_id: string | null;
  short_name: string | null;
};

type Club = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
};

type Hole = {
  hole_number: number;
  par: number;
  handicap_index: number;
};

type CourseTeeSet = {
  id: string;
  code: string | null;
  name: string | null;
  color: string | null;
  sort_order: number | null;
  gender_default?: string | null;
  slope_men?: number | null;
  slope_women?: number | null;
  course_rating_men?: number | null;
  course_rating_women?: number | null;
  par?: number | null;
  yardage?: number | null;
};

const TEE_SET_SELECT_WHS =
  "id,code,name,color,sort_order,gender_default,slope_men,slope_women,course_rating_men,course_rating_women,par,yardage";

function numInputValue(v: number | null | undefined) {
  return v != null && Number.isFinite(Number(v)) ? String(v) : "";
}

function normalizeCode(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

function uniqueClubOptions(rows: Club[]) {
  const seen = new Set<string>();
  const list: Club[] = [];

  for (const row of rows) {
    const key = row.id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(row);
  }

  return list.sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
      sensitivity: "base",
    })
  );
}

const inputClass =
  "h-7 min-w-0 rounded border border-gray-300 bg-white px-2 text-[11px] text-black placeholder:text-gray-400";

export default async function CoursesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const locale = await getLocale();
  const co = messages[locale].courses;
  const courseTitle = co.title;
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const courseId =
    typeof sp.course_id === "string" ? sp.course_id.trim() : "";

  const [{ data: courses }, { data: clubs }] = await Promise.all([
    supabase
      .from("courses")
      .select("id,name,club_name,club_id,short_name")
      .order("club_name")
      .order("name"),
    supabase
      .from("clubs")
      .select("id,name,short_name,normalized_name,is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  const courseRows = (courses ?? []) as Course[];
  const clubRows = uniqueClubOptions((clubs ?? []) as Club[]);

  const effectiveCourseId =
    courseId || (courseRows.length > 0 ? courseRows[0].id : "");

  type TeeWhsSummary = {
    course_id: string;
    course_rating_men: number | null;
    slope_men: number | null;
    course_rating_women: number | null;
    slope_women: number | null;
  };

  let teeSummaries: TeeWhsSummary[] = [];
  if (courseRows.length > 0) {
    const courseIds = courseRows.map((c) => c.id);
    const summaryRes = await supabase
      .from("course_tee_sets")
      .select(
        "course_id,course_rating_men,slope_men,course_rating_women,slope_women"
      )
      .in("course_id", courseIds);
    if (!summaryRes.error) {
      teeSummaries = (summaryRes.data ?? []) as TeeWhsSummary[];
    }
  }

  const courseWhs = new Map<
    string,
    { tees: number; withWhs: number }
  >();
  for (const row of teeSummaries) {
    const prev = courseWhs.get(row.course_id) ?? { tees: 0, withWhs: 0 };
    const hasAny =
      row.course_rating_men != null ||
      row.slope_men != null ||
      row.course_rating_women != null ||
      row.slope_women != null;
    courseWhs.set(row.course_id, {
      tees: prev.tees + 1,
      withWhs: prev.withWhs + (hasAny ? 1 : 0),
    });
  }

  let course: Course | null = null;
  let holes: Hole[] = [];
  let teeSets: CourseTeeSet[] = [];
  let whsColumnsAvailable = true;

  if (effectiveCourseId) {
    course =
      (courseRows.find((c) => c.id === effectiveCourseId) as Course) ?? null;

    const { data: holesData } = await supabase
      .from("course_holes")
      .select("hole_number,par,handicap_index")
      .eq("course_id", effectiveCourseId)
      .order("hole_number");

    holes = (holesData ?? []) as Hole[];

    const teeSetsWhsRes = await supabase
      .from("course_tee_sets")
      .select(TEE_SET_SELECT_WHS)
      .eq("course_id", effectiveCourseId)
      .order("sort_order", { ascending: true });

    if (
      teeSetsWhsRes.error &&
      (teeSetsWhsRes.error.message.includes("slope_men") ||
        teeSetsWhsRes.error.message.includes("course_rating"))
    ) {
      whsColumnsAvailable = false;
      const teeSetsBasicRes = await supabase
        .from("course_tee_sets")
        .select("id,code,name,color,sort_order")
        .eq("course_id", effectiveCourseId)
        .order("sort_order", { ascending: true });
      if (teeSetsBasicRes.error) {
        throw new Error(teeSetsBasicRes.error.message);
      }
      teeSets = (teeSetsBasicRes.data ?? []) as CourseTeeSet[];
    } else {
      if (teeSetsWhsRes.error) {
        throw new Error(teeSetsWhsRes.error.message);
      }
      teeSets = (teeSetsWhsRes.data ?? []) as CourseTeeSet[];
    }
  }

  const teeSetRows =
    teeSets.length > 0
      ? teeSets
      : [
          {
            id: "tmp_1",
            code: "BLK",
            name: "Negras",
            color: "black",
            sort_order: 1,
          },
          {
            id: "tmp_2",
            code: "BLU",
            name: "Azules",
            color: "blue",
            sort_order: 2,
          },
          {
            id: "tmp_3",
            code: "WHT",
            name: "Blancas",
            color: "white",
            sort_order: 3,
          },
          {
            id: "tmp_4",
            code: "GLD",
            name: "Doradas",
            color: "gold",
            sort_order: 4,
          },
          {
            id: "tmp_5",
            code: "RED",
            name: "Rojas",
            color: "red",
            sort_order: 5,
          },
        ];

  const selectedClub =
    course && course.club_id
      ? clubRows.find((club) => club.id === course.club_id) ?? null
      : null;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-gray-900">{courseTitle}</h1>

        <form
          method="GET"
          action="/courses"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-[11px] font-medium text-gray-600">Campo</span>

          <select
            name="course_id"
            defaultValue={effectiveCourseId}
            className="h-7 min-w-[260px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black"
          >
            {courseRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.club_name ? ` (${c.club_name})` : ""}
                {c.short_name ? ` - ${c.short_name}` : ""}
              </option>
            ))}
          </select>

          <button className="h-7 rounded border border-gray-300 bg-white px-3 text-[11px] text-black">
            Cambiar
          </button>
        </form>
      </div>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase text-gray-700">
            {co.coursesListTitle} ({courseRows.length})
          </div>
          <div className="text-[11px] text-gray-500">{co.coursesListHint}</div>
        </div>

        {courseRows.length === 0 ? (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
            {co.coursesEmpty}
          </div>
        ) : (
          <div style={backofficeTableStickyScroll}>
            <table className="w-full border-collapse text-[11px]">
              <thead className={twStickyTheadGray50}>
                <tr>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                    {co.thClub}
                  </th>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                    {co.thCourse}
                  </th>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                    {co.shortNameLabel}
                  </th>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-center font-semibold">
                    {co.thTees}
                  </th>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-center font-semibold">
                    {co.thWhsStatus}
                  </th>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-right font-semibold">
                    {co.thAction}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-black">
                {courseRows.map((c) => {
                  const summary =
                    courseWhs.get(c.id) ?? { tees: 0, withWhs: 0 };
                  const isSelected = c.id === effectiveCourseId;
                  const whsState: "complete" | "partial" | "empty" =
                    summary.tees > 0 && summary.withWhs >= summary.tees
                      ? "complete"
                      : summary.withWhs > 0
                        ? "partial"
                        : "empty";
                  const whsLabel =
                    whsState === "complete"
                      ? co.whsComplete
                      : whsState === "partial"
                        ? co.whsPartial
                        : co.whsEmpty;
                  const whsClass =
                    whsState === "complete"
                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                      : whsState === "partial"
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-rose-100 text-rose-900 border-rose-300";
                  return (
                    <tr
                      key={c.id}
                      className={isSelected ? "bg-sky-50" : undefined}
                    >
                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        {c.club_name ?? "—"}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-[3px] font-medium">
                        {c.name}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-[3px]">
                        {c.short_name ?? "—"}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-[3px] text-center tabular-nums">
                        {summary.withWhs} / {summary.tees}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-[3px] text-center">
                        <span
                          className={`inline-flex rounded-full border px-2 py-[1px] text-[10px] font-semibold ${whsClass}`}
                        >
                          {whsLabel}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-1.5 py-[3px] text-right">
                        {isSelected ? (
                          <span className="inline-flex rounded border border-sky-300 bg-sky-100 px-2 py-[1px] text-[10px] font-semibold text-sky-900">
                            {co.btnSelected}
                          </span>
                        ) : (
                          <a
                            href={`/courses?course_id=${c.id}#course-detail`}
                            className="inline-flex rounded bg-gray-800 px-2 py-[2px] text-[10px] font-semibold text-white hover:bg-gray-700"
                          >
                            {co.btnOpen}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-[11px] font-semibold uppercase text-gray-700">
          Nuevo campo
        </div>

        <form action={createCourse} className="space-y-3">
          <div className="grid gap-2 md:grid-cols-5">
            <div className="rounded border border-gray-200 bg-gray-50 p-3 md:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                Nombre campo
              </label>
              <input
                name="name"
                placeholder="Nombre campo"
                className={`${inputClass} w-full`}
                required
              />
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                {co.shortNameLabel}
              </label>
              <input
                name="short_name"
                placeholder={co.shortNamePlaceholderCourse}
                className={`${inputClass} w-full`}
              />
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3 md:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                Modo club
              </label>

              <div className="flex h-7 items-center gap-4 text-[11px] text-gray-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="club_mode"
                    value="existing"
                    defaultChecked
                  />
                  Club existente
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="club_mode"
                    value="new"
                  />
                  Club nuevo
                </label>
              </div>
            </div>
          </div>

          <div
            id="existing-club-box"
            className="grid gap-2 md:grid-cols-1"
          >
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                Club existente
              </label>
              <select
                id="club_id"
                name="club_id"
                defaultValue=""
                className={`${inputClass} w-full min-w-[280px]`}
              >
                <option value="">Selecciona club</option>
                {clubRows.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name ?? "Club sin nombre"}
                    {club.short_name ? ` - ${club.short_name}` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-gray-500">
                Usa esta opción cuando el club ya existe en catálogo.
              </div>
            </div>
          </div>

          <div
            id="new-club-box"
            className="hidden grid gap-2 md:grid-cols-2"
          >
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                Nombre club nuevo
              </label>
              <input
                id="new_club_name"
                name="new_club_name"
                placeholder="Nombre oficial del club"
                className={`${inputClass} w-full`}
              />
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                {co.shortNameLabel}
              </label>
              <input
                id="new_club_short_name"
                name="new_club_short_name"
                placeholder={co.shortNamePlaceholderNewClub}
                className={`${inputClass} w-full`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="h-7 rounded bg-gray-800 px-3 text-[11px] text-white">
              Crear
            </button>
          </div>

          <div className="text-[11px] text-gray-500">
            Si el club no existe, aquí mismo se da de alta en Clubs y luego se
            liga automáticamente al campo nuevo.
          </div>
        </form>
      </section>

      {course && (
        <>
          <section
            id="course-detail"
            className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 scroll-mt-4"
          >
            <div className="text-[11px] font-semibold uppercase text-gray-700">
              Datos del campo seleccionado
            </div>

            <form action={updateCourse} className="space-y-3">
              <input type="hidden" name="course_id" value={course.id} />

              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                    Club
                  </label>

                  <select
                    name="club_id"
                    defaultValue={course.club_id ?? ""}
                    className={`${inputClass} w-full`}
                    required
                  >
                    <option value="">Selecciona club</option>
                    {clubRows.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name ?? "Club sin nombre"}
                        {club.short_name ? ` - ${club.short_name}` : ""}
                      </option>
                    ))}
                  </select>

                  <div className="mt-1 text-[11px] text-gray-500">
                    {selectedClub ? (
                      <>
                        Club actual: <strong>{selectedClub.name}</strong>
                        {selectedClub.short_name
                          ? ` (${selectedClub.short_name})`
                          : ""}
                      </>
                    ) : course.club_name?.trim() ? (
                      <>
                        Curso ligado por nombre legado:{" "}
                        <strong>{course.club_name}</strong>
                      </>
                    ) : (
                      "Selecciona un club del catálogo maestro."
                    )}
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                    Campo
                  </label>
                  <input
                    name="name"
                    defaultValue={course.name}
                    placeholder="Nombre campo"
                    className={`${inputClass} w-full`}
                    required
                  />
                </div>

                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                    {co.shortNameLabel}
                  </label>
                  <input
                    name="short_name"
                    defaultValue={course.short_name ?? ""}
                    placeholder={co.shortNamePlaceholderCourse}
                    className={`${inputClass} w-full`}
                  />
                </div>

                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-1 block text-[10px] font-semibold uppercase text-gray-500">
                    Salidas base
                  </div>
                  <div className="text-[12px] font-semibold text-gray-900">
                    {teeSetRows.length}
                  </div>
                </div>
              </div>

              <div>
                <button className="h-7 rounded bg-gray-800 px-4 text-[11px] text-white">
                  Guardar datos campo
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase text-gray-700">
              Tarjeta del campo — {course.name}
            </div>

            <form action={saveCourseHoles}>
              <input type="hidden" name="course_id" value={course.id} />

              <div style={backofficeTableStickyScroll}>
                <table className="w-full border-collapse text-[11px]">
                  <thead className={twStickyTheadGray50}>
                    <tr>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        HOYO
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        PAR
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        VENTAJA
                      </th>
                    </tr>
                  </thead>

                  <tbody className="bg-white text-black">
                    {Array.from({ length: 18 }).map((_, i) => {
                      const hole = i + 1;
                      const row = holes.find((h) => h.hole_number === hole) ?? null;

                      return (
                        <tr key={hole}>
                          <td className="border border-gray-300 px-1.5 py-[3px] font-medium">
                            {hole}
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`par_${hole}`}
                              defaultValue={row?.par ?? 4}
                              className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`hcp_${hole}`}
                              defaultValue={row?.handicap_index ?? hole}
                              className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <button className="h-7 rounded bg-gray-800 px-4 text-[11px] text-white">
                  Guardar tarjeta
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase text-gray-700">
                {co.teeSetsSection} — {course.name}
              </div>

              <div className="text-[11px] text-gray-500">{co.teeSetsHint}</div>
            </div>

            {!whsColumnsAvailable ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                {co.whsColumnsMissing}
              </div>
            ) : null}

            <form action={saveCourseTeeSets} className="space-y-3">
              <input type="hidden" name="course_id" value={course.id} />
              <input
                type="hidden"
                name="tee_row_count"
                value={String(teeSetRows.length)}
              />
              <input
                type="hidden"
                name="delete_ids_json"
                value={JSON.stringify([])}
              />
              <input
                type="hidden"
                name="rows_json"
                value={JSON.stringify(
                  teeSetRows.map((r) => ({ id: r.id }))
                )}
              />

              <div style={backofficeTableStickyScroll}>
                <table className="min-w-[920px] w-full border-collapse text-[11px]">
                  <thead className={twStickyTheadGray50}>
                    <tr>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thOrder}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thCode}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thName}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thColor}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thGender}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thRatingMen}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thSlopeMen}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thRatingWomen}
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        {co.thSlopeWomen}
                      </th>
                    </tr>
                  </thead>

                  <tbody className="bg-white text-black">
                    {teeSetRows.map((r, i) => {
                      const row = i + 1;
                      const gender = String(r.gender_default ?? "")
                        .trim()
                        .toUpperCase();
                      return (
                        <tr key={r.id || i}>
                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            {row}
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_code_${row}`}
                              defaultValue={normalizeCode(r.code)}
                              className="h-6 w-full min-w-[52px] rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_name_${row}`}
                              defaultValue={r.name ?? ""}
                              className="h-6 w-full min-w-[88px] rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_color_${row}`}
                              defaultValue={r.color ?? ""}
                              className="h-6 w-full min-w-[64px] rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <select
                              name={`tee_gender_${row}`}
                              defaultValue={gender}
                              className="h-6 w-full min-w-[56px] rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                              disabled={!whsColumnsAvailable}
                            >
                              <option value="">{co.genderEmpty}</option>
                              <option value="M">{co.genderM}</option>
                              <option value="F">{co.genderF}</option>
                              <option value="X">{co.genderX}</option>
                            </select>
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_rating_men_${row}`}
                              type="number"
                              step="0.1"
                              min={50}
                              max={90}
                              defaultValue={numInputValue(r.course_rating_men)}
                              placeholder="73.2"
                              disabled={!whsColumnsAvailable}
                              className="h-6 w-full min-w-[56px] rounded border border-gray-300 bg-white px-1 text-[11px] tabular-nums text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_slope_men_${row}`}
                              type="number"
                              step="1"
                              min={55}
                              max={155}
                              defaultValue={numInputValue(r.slope_men)}
                              placeholder="138"
                              disabled={!whsColumnsAvailable}
                              className="h-6 w-full min-w-[52px] rounded border border-gray-300 bg-white px-1 text-[11px] tabular-nums text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_rating_women_${row}`}
                              type="number"
                              step="0.1"
                              min={50}
                              max={90}
                              defaultValue={numInputValue(
                                r.course_rating_women
                              )}
                              placeholder="71.5"
                              disabled={!whsColumnsAvailable}
                              className="h-6 w-full min-w-[56px] rounded border border-gray-300 bg-white px-1 text-[11px] tabular-nums text-black"
                            />
                          </td>

                          <td className="border border-gray-300 px-1.5 py-[3px]">
                            <input
                              name={`tee_slope_women_${row}`}
                              type="number"
                              step="1"
                              min={55}
                              max={155}
                              defaultValue={numInputValue(r.slope_women)}
                              placeholder="136"
                              disabled={!whsColumnsAvailable}
                              className="h-6 w-full min-w-[52px] rounded border border-gray-300 bg-white px-1 text-[11px] tabular-nums text-black"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={!whsColumnsAvailable}
                  className="h-7 rounded bg-gray-800 px-4 text-[11px] text-white disabled:opacity-50"
                >
                  {co.saveTeeSets}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  const existingBox = document.getElementById("existing-club-box");
  const newBox = document.getElementById("new-club-box");
  const clubId = document.getElementById("club_id");
  const newClubName = document.getElementById("new_club_name");
  const radios = Array.from(document.querySelectorAll('input[name="club_mode"]'));

  function refreshMode() {
    const checked = document.querySelector('input[name="club_mode"]:checked');
    const mode = checked ? checked.value : "existing";

    if (mode === "new") {
      if (existingBox) existingBox.classList.add("hidden");
      if (newBox) newBox.classList.remove("hidden");
      if (clubId) clubId.removeAttribute("required");
      if (newClubName) newClubName.setAttribute("required", "required");
      return;
    }

    if (existingBox) existingBox.classList.remove("hidden");
    if (newBox) newBox.classList.add("hidden");
    if (clubId) clubId.setAttribute("required", "required");
    if (newClubName) newClubName.removeAttribute("required");
  }

  radios.forEach(function (radio) {
    radio.addEventListener("change", refreshMode);
  });

  refreshMode();
})();
          `,
        }}
      />
    </div>
  );
}