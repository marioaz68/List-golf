import { createClient } from "@/utils/supabase/server";
import {
  createCourse,
  updateCourse,
  saveCourseHoles,
  saveCourseTeeSets,
} from "./actions";

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
};

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

  let course: Course | null = null;
  let holes: Hole[] = [];
  let teeSets: CourseTeeSet[] = [];

  if (effectiveCourseId) {
    course =
      (courseRows.find((c) => c.id === effectiveCourseId) as Course) ?? null;

    const { data: holesData } = await supabase
      .from("course_holes")
      .select("hole_number,par,handicap_index")
      .eq("course_id", effectiveCourseId)
      .order("hole_number");

    holes = (holesData ?? []) as Hole[];

    const { data: teeSetsData } = await supabase
      .from("course_tee_sets")
      .select("id,code,name,color,sort_order")
      .eq("course_id", effectiveCourseId)
      .order("sort_order", { ascending: true });

    teeSets = (teeSetsData ?? []) as CourseTeeSet[];
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
        <h1 className="text-lg font-semibold text-gray-900">Campos de golf</h1>

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
                Short campo
              </label>
              <input
                name="short_name"
                placeholder="Abrev. ej. CCQ"
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
                Short club nuevo
              </label>
              <input
                id="new_club_short_name"
                name="new_club_short_name"
                placeholder="Abrev. del club"
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
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
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
                    Abrev.
                  </label>
                  <input
                    name="short_name"
                    defaultValue={course.short_name ?? ""}
                    placeholder="Abrev. ej. CCQ"
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

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="bg-gray-100 text-gray-900">
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
                Salidas base del campo — {course.name}
              </div>

              <div className="text-[11px] text-gray-500">
                Si aquí capturas bien las salidas, luego el setup del torneo ya no
                debería pedir recapturarlas.
              </div>
            </div>

            <form action={saveCourseTeeSets} className="space-y-3">
              <input type="hidden" name="course_id" value={course.id} />
              <input
                type="hidden"
                name="delete_ids_json"
                value={JSON.stringify([])}
              />
              <input
                type="hidden"
                name="rows_json"
                value={JSON.stringify(
                  teeSetRows.map((r, i) => ({
                    id: r.id,
                    code: normalizeCode(r.code),
                    name: String(r.name ?? "").trim(),
                    color: String(r.color ?? "").trim(),
                    sort_order: i + 1,
                  }))
                )}
              />

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="bg-gray-100 text-gray-900">
                    <tr>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        ORDEN
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        CODE
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        NOMBRE
                      </th>
                      <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold">
                        COLOR
                      </th>
                    </tr>
                  </thead>

                  <tbody className="bg-white text-black">
                    {teeSetRows.map((r, i) => (
                      <tr key={r.id || i}>
                        <td className="border border-gray-300 px-1.5 py-[3px]">
                          {i + 1}
                        </td>

                        <td className="border border-gray-300 px-1.5 py-[3px]">
                          <input
                            name={`tee_code_${i + 1}`}
                            defaultValue={normalizeCode(r.code)}
                            className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                          />
                        </td>

                        <td className="border border-gray-300 px-1.5 py-[3px]">
                          <input
                            name={`tee_name_${i + 1}`}
                            defaultValue={r.name ?? ""}
                            className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                          />
                        </td>

                        <td className="border border-gray-300 px-1.5 py-[3px]">
                          <input
                            name={`tee_color_${i + 1}`}
                            defaultValue={r.color ?? ""}
                            className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] text-black"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                Esta versión deja unas salidas base estándar para capturar el campo
                completo. Si luego quieres agregar slope, rating y yardajes por salida,
                el siguiente paso sería ampliar esta tabla.
              </div>

              <div>
                <button className="h-7 rounded bg-gray-800 px-4 text-[11px] text-white">
                  Guardar salidas base
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