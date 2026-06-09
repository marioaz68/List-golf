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

  // Nombre default amigable: "Ronda del día — 8 jun 2026"
  const dt = new Date(input.date + "T12:00:00");
  const labelFecha = dt.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const name = input.name?.trim() || `Ronda del día — ${labelFecha}`;

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
