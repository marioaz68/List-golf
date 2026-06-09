"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDailyRound } from "./actions";
import type { DailyRoundRow } from "./page";

interface ClubOpt {
  id: string;
  name: string;
}
interface CourseOpt {
  id: string;
  name: string;
  clubId: string | null;
}

interface Props {
  rows: DailyRoundRow[];
  todayMexico: string;
  todayRound: DailyRoundRow | null;
  clubs: ClubOpt[];
  courses: CourseOpt[];
}

function formatHumanDate(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso + "T12:00:00");
  return dt.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function RondasDiariasClient({
  rows,
  todayMexico,
  todayRound,
  clubs,
  courses,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [date, setDate] = useState(todayMexico);
  const [clubId, setClubId] = useState<string>(clubs[0]?.id ?? "");
  const [courseId, setCourseId] = useState<string>(() => {
    const firstCourse =
      courses.find((c) => c.clubId === clubs[0]?.id) ?? courses[0];
    return firstCourse?.id ?? "";
  });

  // Buscamos cursos del club seleccionado; si no hay match (porque algún
  // curso quedó sin club_id en BD), caemos a mostrar TODOS para no bloquear
  // al usuario.
  const filteredCourses = useMemo(() => {
    if (!clubId) return courses;
    const matched = courses.filter((c) => c.clubId === clubId);
    return matched.length > 0 ? matched : courses;
  }, [courses, clubId]);

  // Map id → club name para mostrar contexto en cada opción
  const clubNameById = useMemo(
    () => new Map(clubs.map((c) => [c.id, c.name])),
    [clubs]
  );

  // Si el filtro cayó al "mostrar todos", lo señalamos arriba del select
  const filterFellBack = useMemo(() => {
    if (!clubId) return false;
    return (
      courses.filter((c) => c.clubId === clubId).length === 0 &&
      courses.length > 0
    );
  }, [courses, clubId]);

  function changeClub(newClubId: string) {
    setClubId(newClubId);
    const firstCourse =
      courses.find((c) => c.clubId === newClubId) ?? courses[0];
    if (firstCourse) setCourseId(firstCourse.id);
  }

  function submit() {
    if (!date || !clubId || !courseId) {
      alert("Falta fecha, club o curso.");
      return;
    }
    startTransition(async () => {
      const res = await createDailyRound({ date, clubId, courseId });
      if (!res.ok || !res.tournamentId) {
        alert(`Error: ${res.error}`);
        return;
      }
      setShowNew(false);
      // Llevar al usuario a la pantalla simple de salidas de la ronda del día.
      router.push(`/rondas-diarias/${res.tournamentId}`);
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">
            🗓️ Rondas diarias del club
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cada día de juego se registra como una ronda privada que NO aparece
            en la página pública. Sirve para llevar handicap WHS del club y
            exportar a GHIN.
          </p>
        </header>

        {/* Tarjeta "Hoy" */}
        <section
          className={[
            "mb-4 rounded-lg p-4 ring-1",
            todayRound
              ? "bg-emerald-50 ring-emerald-200"
              : "bg-amber-50 ring-amber-200",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-600">
                Hoy · {formatHumanDate(todayMexico)}
              </div>
              {todayRound ? (
                <>
                  <div className="text-lg font-bold text-emerald-900">
                    {todayRound.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-emerald-700">
                    {todayRound.entriesCount} jugadores ·{" "}
                    {todayRound.groupsCount} grupos · estatus {todayRound.status}
                  </div>
                </>
              ) : (
                <div className="text-base font-bold text-amber-900">
                  Aún no hay ronda creada para hoy
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {todayRound ? (
                <>
                  <Link
                    href={`/rondas-diarias/${todayRound.id}`}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Abrir salidas →
                  </Link>
                  <Link
                    href={`/tee-sheet?tournament_id=${todayRound.id}`}
                    className="rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    Tee Sheet
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNew(true)}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-700"
                >
                  ➕ Crear ronda de hoy
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Tabla histórico */}
        <section className="rounded-lg bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Histórico</h2>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              ➕ Nueva ronda
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Aún no hay rondas registradas. Crea la primera con el botón de
              arriba.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-500">
                    <th className="py-1.5 pr-2">Fecha</th>
                    <th className="py-1.5 pr-2">Ronda</th>
                    <th className="py-1.5 pr-2 text-center">Jugadores</th>
                    <th className="py-1.5 pr-2 text-center">Grupos</th>
                    <th className="py-1.5 pr-2 text-center">Estatus</th>
                    <th className="py-1.5 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={[
                        "border-b border-slate-100 last:border-b-0",
                        r.isArchived ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <td className="py-1.5 pr-2 text-slate-700">
                        {formatHumanDate(r.startDate)}
                      </td>
                      <td className="py-1.5 pr-2 font-semibold text-slate-900">
                        {r.name}
                      </td>
                      <td className="py-1.5 pr-2 text-center text-slate-700">
                        {r.entriesCount}
                      </td>
                      <td className="py-1.5 pr-2 text-center text-slate-700">
                        {r.groupsCount}
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <span
                          className={[
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            r.isArchived
                              ? "bg-slate-100 text-slate-600"
                              : r.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700",
                          ].join(" ")}
                        >
                          {r.isArchived ? "archivada" : r.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <Link
                          href={`/rondas-diarias/${r.id}`}
                          className="text-indigo-600 underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal nueva ronda */}
        {showNew ? (
          <div
            className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setShowNew(false)}
          >
            <div
              className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-slate-900">
                Nueva ronda diaria
              </h2>
              <p className="text-[11px] text-slate-500">
                Privada — no aparece en la página pública.
              </p>

              <label className="mt-3 block text-[11px] font-bold text-slate-700">
                Fecha
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>

              <label className="mt-3 block text-[11px] font-bold text-slate-700">
                Club
                {clubs.length === 1 ? (
                  <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                    {clubs[0].name}
                  </div>
                ) : (
                  <select
                    value={clubId}
                    onChange={(e) => changeClub(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="mt-3 block text-[11px] font-bold text-slate-700">
                Curso (campo)
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {filteredCourses.length === 0 ? (
                    <option value="">⚠ No hay cursos dados de alta</option>
                  ) : null}
                  {filteredCourses.map((c) => {
                    const clubLabel = c.clubId
                      ? clubNameById.get(c.clubId) ?? "—"
                      : "sin club";
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} · {clubLabel}
                      </option>
                    );
                  })}
                </select>
                {filterFellBack ? (
                  <p className="mt-1 text-[10px] text-amber-700">
                    ⚠ Ningún curso tiene asignado este club. Te muestro todos
                    los cursos del sistema. Si el correcto está aquí, elígelo y
                    avísame para asignarle el club permanentemente.
                  </p>
                ) : null}
                {filteredCourses.length === 0 ? (
                  <p className="mt-1 text-[10px] text-red-700">
                    No hay cursos en el sistema. Crea uno desde el menú Cursos
                    antes de iniciar una ronda.
                  </p>
                ) : null}
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowNew(false)}
                  className="rounded bg-slate-100 py-2 text-sm font-bold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={submit}
                  className="rounded bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  ✓ Crear ronda
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
