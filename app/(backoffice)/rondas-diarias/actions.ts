"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { seedDailyRoundSchedule } from "@/lib/dailyRounds/seedSchedule";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "handicap_committee",
]);

interface CreateDailyRoundInput {
  date: string; // YYYY-MM-DD
  clubId: string;
  courseId: string;
  name?: string;
}

interface Result {
  ok: boolean;
  tournamentId?: string;
  error?: string;
}

/**
 * Nombre de una ronda diaria: día de la semana capitalizado + fecha.
 * Ej. "Martes 9 Jun 2026". Se deriva de la fecha (YYYY-MM-DD) para que
 * cambie solo según el día de la ronda.
 */
function dailyRoundName(dateIso: string): string {
  const dt = new Date(dateIso + "T12:00:00");
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "");
  const weekday = cap(dt.toLocaleDateString("es-MX", { weekday: "long" }));
  const day = dt.getDate();
  const month = cap(dt.toLocaleDateString("es-MX", { month: "short" }));
  const year = dt.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

/** Crear (o reutilizar) el "torneo perpetuo del día" para rondas diarias. */
export async function createDailyRound(
  input: CreateDailyRoundInput
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
    return { ok: false, error: "Sin permisos." };
  }

  if (!input.date || !input.clubId || !input.courseId) {
    return { ok: false, error: "Faltan datos (fecha, club, curso)." };
  }

  // Si ya existe la ronda del día en ese club, regresarla
  const { data: existing } = await admin
    .from("tournaments")
    .select("id")
    .eq("kind", "daily_round")
    .eq("start_date", input.date)
    .eq("club_id", input.clubId)
    .maybeSingle();
  if (existing) {
    return { ok: true, tournamentId: String((existing as { id: string }).id) };
  }

  // Nombre = día de la semana + fecha (ej. "Martes 9 Jun 2026"). Cambia
  // automáticamente según la fecha de la ronda.
  const name = input.name?.trim() || dailyRoundName(input.date);

  // Insertar torneo privado tipo daily_round
  const { data: inserted, error } = await admin
    .from("tournaments")
    .insert({
      name,
      start_date: input.date,
      end_date: input.date,
      club_id: input.clubId,
      course_id: input.courseId,
      kind: "daily_round",
      is_private: true,
      is_public: false,
      is_archived: false,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Error creando ronda." };
  }

  const newTournamentId = String((inserted as { id: string }).id);

  // Auto-seeding: 1 categoría ABIERTA + 1 round + salidas cada 10 min
  // (mañana 7-9 y mediodía 12-14, hoyos 1 y 10). Es idempotente y no
  // bloquea el flujo si falla — el comité puede agregar manualmente.
  try {
    const seed = await seedDailyRoundSchedule(admin, newTournamentId, input.date);
    if (!seed.ok) {
      console.error("seedDailyRoundSchedule:", seed.error);
    }
  } catch (e) {
    console.error("seedDailyRoundSchedule exception:", e);
  }

  revalidatePath("/rondas-diarias");
  return { ok: true, tournamentId: newTournamentId };
}
