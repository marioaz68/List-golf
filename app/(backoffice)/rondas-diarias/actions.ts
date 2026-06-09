"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { seedDailyRoundSchedule } from "@/lib/dailyRounds/seedSchedule";
import { markGroupStarted } from "@/lib/ritmo/groupStart";
import { assignCaddieToEntry } from "@/lib/caddies/assignCaddieToEntry";
import {
  notifyDailyRoundGroupStart,
  type DailyNotifyResult,
} from "@/lib/dailyRounds/notifyGroupStart";

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

/** Verifica sesión + rol y devuelve el cliente admin. */
async function requireDailyAccess(): Promise<
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; error: string }
> {
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
  return { ok: true, admin, userId: user.id };
}

/**
 * Agrega un jugador del módulo de jugadores a una salida de la ronda del día.
 * No requiere "inscripción" manual: si el jugador aún no tiene entry en esta
 * ronda, se crea automáticamente (categoría ABIERTA + handicap del jugador) y
 * se enlaza al grupo. Es idempotente: si ya está en el grupo, no duplica.
 */
export async function addPlayerToSalida(input: {
  tournamentId: string;
  groupId: string;
  playerId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const access = await requireDailyAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { admin } = access;

  const tournamentId = String(input.tournamentId ?? "").trim();
  const groupId = String(input.groupId ?? "").trim();
  const playerId = String(input.playerId ?? "").trim();
  if (!tournamentId || !groupId || !playerId) {
    return { ok: false, error: "Faltan datos (torneo, salida o jugador)." };
  }

  // Datos del jugador (handicap para la entry).
  const { data: player, error: pErr } = await admin
    .from("players")
    .select("id, handicap_index")
    .eq("id", playerId)
    .maybeSingle();
  if (pErr || !player) {
    return { ok: false, error: pErr?.message ?? "Jugador no encontrado." };
  }
  const handicapIndex =
    (player as { handicap_index: number | null }).handicap_index ?? null;

  // Resolver categoría del torneo (preferir ABIERTA).
  const { data: cats } = await admin
    .from("categories")
    .select("id, code")
    .eq("tournament_id", tournamentId);
  const catList = (cats ?? []) as Array<{ id: string; code: string | null }>;
  const categoryId =
    catList.find((c) => c.code === "ABIERTA")?.id ?? catList[0]?.id ?? null;
  if (!categoryId) {
    return {
      ok: false,
      error: "La ronda no tiene categoría. Vuelve a crear la ronda del día.",
    };
  }

  // Buscar (o crear) la entry del jugador en esta ronda.
  let entryId: string | null = null;
  const { data: existingEntry } = await admin
    .from("tournament_entries")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (existingEntry) {
    entryId = String((existingEntry as { id: string }).id);
  } else {
    const { data: insEntry, error: eErr } = await admin
      .from("tournament_entries")
      .insert({
        tournament_id: tournamentId,
        player_id: playerId,
        category_id: categoryId,
        handicap_index: handicapIndex,
        handicap: handicapIndex,
        status: "confirmed",
      })
      .select("id")
      .single();
    if (eErr || !insEntry) {
      return { ok: false, error: eErr?.message ?? "No pude inscribir al jugador." };
    }
    entryId = String((insEntry as { id: string }).id);
  }

  // ¿Ya está en este grupo?
  const { data: alreadyMember } = await admin
    .from("pairing_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("entry_id", entryId)
    .maybeSingle();
  if (alreadyMember) {
    revalidatePath(`/rondas-diarias/${tournamentId}`);
    return { ok: true };
  }

  // Siguiente posición dentro del grupo.
  const { data: members } = await admin
    .from("pairing_group_members")
    .select("position")
    .eq("group_id", groupId);
  const maxPos = ((members ?? []) as Array<{ position: number | null }>).reduce(
    (acc, m) => Math.max(acc, m.position ?? 0),
    0
  );

  const { error: mErr } = await admin.from("pairing_group_members").insert({
    group_id: groupId,
    entry_id: entryId,
    position: maxPos + 1,
  });
  if (mErr) {
    return { ok: false, error: mErr.message };
  }

  revalidatePath(`/rondas-diarias/${tournamentId}`);
  return { ok: true };
}

/** Quita un jugador de una salida (no borra al jugador del módulo). */
export async function removePlayerFromSalida(input: {
  tournamentId: string;
  memberId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const access = await requireDailyAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { admin } = access;

  const memberId = String(input.memberId ?? "").trim();
  if (!memberId) return { ok: false, error: "Falta el miembro." };

  const { error } = await admin
    .from("pairing_group_members")
    .delete()
    .eq("id", memberId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rondas-diarias/${input.tournamentId}`);
  return { ok: true };
}

/** Asigna un caddie a un jugador (entry) dentro de una salida. */
export async function assignCaddieToSalida(input: {
  tournamentId: string;
  roundId: string;
  groupId: string;
  entryId: string;
  caddieId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const access = await requireDailyAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { admin } = access;

  const tournamentId = String(input.tournamentId ?? "").trim();
  const roundId = String(input.roundId ?? "").trim();
  const groupId = String(input.groupId ?? "").trim();
  const entryId = String(input.entryId ?? "").trim();
  const caddieId = String(input.caddieId ?? "").trim();
  if (!tournamentId || !roundId || !entryId || !caddieId) {
    return { ok: false, error: "Faltan datos (jugador o caddie)." };
  }

  const res = await assignCaddieToEntry(admin, {
    tournamentId,
    entryId,
    caddieId,
    roundId,
    pairingGroupId: groupId || null,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath(`/rondas-diarias/${tournamentId}`);
  return { ok: true };
}

/** Quita el caddie asignado a un jugador (entry) en esta ronda. */
export async function removeCaddieFromSalida(input: {
  tournamentId: string;
  roundId: string;
  entryId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const access = await requireDailyAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { admin } = access;

  const tournamentId = String(input.tournamentId ?? "").trim();
  const roundId = String(input.roundId ?? "").trim();
  const entryId = String(input.entryId ?? "").trim();
  if (!tournamentId || !roundId || !entryId) {
    return { ok: false, error: "Faltan datos." };
  }

  const { error } = await admin
    .from("caddie_assignments")
    .update({ is_active: false })
    .eq("tournament_id", tournamentId)
    .eq("round_id", roundId)
    .eq("entry_id", entryId)
    .eq("is_active", true);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/rondas-diarias/${tournamentId}`);
  return { ok: true };
}

/**
 * Marca el arranque real de la salida y envía Telegram a jugadores y caddies
 * con el link de captura. Devuelve un resumen del envío.
 */
export async function startAndNotifySalida(input: {
  tournamentId: string;
  roundId: string;
  groupId: string;
}): Promise<
  { ok: boolean; error?: string } & Partial<DailyNotifyResult>
> {
  const access = await requireDailyAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const { admin } = access;

  const tournamentId = String(input.tournamentId ?? "").trim();
  const roundId = String(input.roundId ?? "").trim();
  const groupId = String(input.groupId ?? "").trim();
  if (!tournamentId || !roundId || !groupId) {
    return { ok: false, error: "Faltan datos de la salida." };
  }

  await markGroupStarted(admin, groupId);
  const notify = await notifyDailyRoundGroupStart(admin, {
    tournamentId,
    roundId,
    groupId,
  });

  revalidatePath(`/rondas-diarias/${tournamentId}`);
  return {
    ok: true,
    sent: notify.sent,
    failed: notify.failed,
    skipped: notify.skipped,
    skippedNames: notify.skippedNames,
  };
}
