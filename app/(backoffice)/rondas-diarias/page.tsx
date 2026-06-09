/**
 * /rondas-diarias — panel del comité para administrar las rondas del día
 * del club (kind='daily_round'). Cada "día" es un torneo privado que NO
 * aparece en la página pública.
 *
 * Lista los últimos N días con su resumen (#jugadores, status, etc.).
 * Botón rápido para crear el día de hoy si aún no existe.
 *
 * Acceso: super_admin, club_admin, tournament_director, handicap_committee.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import RondasDiariasClient from "./RondasDiariasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "handicap_committee",
]);

export interface DailyRoundRow {
  id: string;
  name: string;
  startDate: string | null;
  status: string;
  clubId: string | null;
  courseId: string | null;
  entriesCount: number;
  groupsCount: number;
  isArchived: boolean;
}

export default async function RondasDiariasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rondas-diarias");

  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  const ok = roles.some((r) => ALLOWED_ROLES.has(r));
  if (!ok) redirect("/inicio");

  // Últimas 60 rondas diarias (≈ 2 meses)
  const { data: tournamentsRaw, error } = await admin
    .from("tournaments")
    .select("id, name, start_date, status, club_id, course_id, is_archived")
    .eq("kind", "daily_round")
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(60);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow ring-1 ring-slate-200">
          <h1 className="text-lg font-bold text-slate-900">Rondas diarias</h1>
          <p className="mt-2 text-sm text-red-600">
            Error cargando rondas: {error.message}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            ¿Aplicaste la migración 20260608300000_tournaments_private_kind?
          </p>
        </div>
      </div>
    );
  }

  const tournaments = (tournamentsRaw ?? []) as Array<{
    id: string;
    name: string;
    start_date: string | null;
    status: string;
    club_id: string | null;
    course_id: string | null;
    is_archived: boolean;
  }>;

  // Contar entries y grupos por torneo
  const ids = tournaments.map((t) => t.id);
  const entriesByTournament = new Map<string, number>();
  const groupsByTournament = new Map<string, number>();
  if (ids.length > 0) {
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("tournament_id")
      .in("tournament_id", ids);
    for (const e of (entries ?? []) as Array<{ tournament_id: string }>) {
      entriesByTournament.set(
        e.tournament_id,
        (entriesByTournament.get(e.tournament_id) ?? 0) + 1
      );
    }
    const { data: groups } = await admin
      .from("pairing_groups")
      .select("tournament_id")
      .in("tournament_id", ids);
    for (const g of (groups ?? []) as Array<{ tournament_id: string }>) {
      groupsByTournament.set(
        g.tournament_id,
        (groupsByTournament.get(g.tournament_id) ?? 0) + 1
      );
    }
  }

  const rows: DailyRoundRow[] = tournaments.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.start_date,
    status: t.status,
    clubId: t.club_id,
    courseId: t.course_id,
    entriesCount: entriesByTournament.get(t.id) ?? 0,
    groupsCount: groupsByTournament.get(t.id) ?? 0,
    isArchived: t.is_archived,
  }));

  // Hoy (México) — para mostrar si ya existe la ronda del día
  const todayMexico = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayRound = rows.find((r) => r.startDate === todayMexico);

  // Catálogo: clubs y courses para crear ronda nueva
  const { data: clubsRaw } = await admin
    .from("clubs")
    .select("id, name")
    .order("name");
  const { data: coursesRaw } = await admin
    .from("courses")
    .select("id, name, club_id")
    .order("name");

  // Si el usuario NO es super_admin, restringir los clubs visibles a los que
  // tiene un rol activo asignado (user_club_roles). Si super_admin, ve todos.
  const isSuperAdmin = roles.includes("super_admin");
  let allowedClubIds: Set<string> | null = null;
  if (!isSuperAdmin) {
    try {
      const { data: ucr, error: ucrErr } = await admin
        .from("user_club_roles")
        .select("club_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (ucrErr) {
        console.error("rondas-diarias user_club_roles:", ucrErr.message);
      } else {
        allowedClubIds = new Set(
          ((ucr ?? []) as Array<{ club_id: string | null }>)
            .map((r) => (r.club_id ? String(r.club_id) : null))
            .filter((id): id is string => Boolean(id))
        );
      }
    } catch (e) {
      console.error("rondas-diarias user_club_roles exception:", e);
      // No filtramos — comportamiento legacy (ve todo)
    }
  }

  const allClubs = ((clubsRaw ?? []) as Array<Record<string, unknown>>).map(
    (c) => ({
      id: String(c.id),
      name: String(c.name),
    })
  );
  const clubs = allowedClubIds
    ? allClubs.filter((c) => allowedClubIds!.has(c.id))
    : allClubs;

  const allCourses = ((coursesRaw ?? []) as Array<Record<string, unknown>>).map(
    (c) => ({
      id: String(c.id),
      name: String(c.name),
      clubId: c.club_id ? String(c.club_id) : null,
    })
  );
  const courses = allowedClubIds
    ? allCourses.filter((c) => !c.clubId || allowedClubIds!.has(c.clubId))
    : allCourses;

  return (
    <RondasDiariasClient
      rows={rows}
      todayMexico={todayMexico}
      todayRound={todayRound ?? null}
      clubs={clubs}
      courses={courses}
    />
  );
}
