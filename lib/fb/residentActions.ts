"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Server actions para gestionar a los clientes del fraccionamiento (reparto a
 * domicilio). Un cliente del fraccionamiento es un `player` marcado con
 * is_resident=true; no necesita inscripción a torneo, solo estar conectado al
 * sistema (idealmente con Telegram vinculado).
 *
 * Se usan desde la pantalla /fb-fraccionamiento del backoffice, protegida por
 * el módulo fb-manage.
 */

export interface ResidentInput {
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  telegramUserId: string | null;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function clean(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** Da de alta un nuevo cliente del fraccionamiento. */
export async function createResident(
  input: ResidentInput
): Promise<ActionResult> {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  if (!firstName) {
    return { ok: false, error: "El nombre es obligatorio." };
  }

  const admin = createAdminClient();
  const telegramUserId = clean(input.telegramUserId);

  // Si el Telegram ya está vinculado a un jugador, marcamos a ese como
  // residente en vez de crear un duplicado.
  if (telegramUserId) {
    const { data: existing } = await admin
      .from("players")
      .select("id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (existing) {
      return updateResident((existing as { id: string }).id, input);
    }
  }

  const { data, error } = await admin
    .from("players")
    .insert({
      first_name: firstName,
      last_name: lastName ?? "",
      phone: clean(input.phone),
      whatsapp_phone_e164: clean(input.whatsapp),
      address: clean(input.address),
      telegram_user_id: telegramUserId,
      is_resident: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createResident:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-fraccionamiento");
  return { ok: true, id: (data as { id: string }).id };
}

/** Actualiza los datos de un cliente del fraccionamiento. */
export async function updateResident(
  id: string,
  input: ResidentInput
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta id." };
  const firstName = clean(input.firstName);
  if (!firstName) {
    return { ok: false, error: "El nombre es obligatorio." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("players")
    .update({
      first_name: firstName,
      last_name: clean(input.lastName) ?? "",
      phone: clean(input.phone),
      whatsapp_phone_e164: clean(input.whatsapp),
      address: clean(input.address),
      telegram_user_id: clean(input.telegramUserId),
      is_resident: true,
    })
    .eq("id", id);

  if (error) {
    console.error("updateResident:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-fraccionamiento");
  return { ok: true, id };
}

/** Marca/desmarca a un cliente como residente del fraccionamiento. */
export async function setResidentActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta id." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("players")
    .update({ is_resident: active })
    .eq("id", id);
  if (error) {
    console.error("setResidentActive:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-fraccionamiento");
  return { ok: true, id };
}

export interface PersonMatch {
  id: string;
  name: string;
  phone: string | null;
  telegramLinked: boolean;
  isResident: boolean;
}

/**
 * Busca personas ya conectadas al sistema (players) para convertirlas en
 * clientes del fraccionamiento sin crear duplicados.
 */
export async function searchPeople(query: string): Promise<PersonMatch[]> {
  const q = clean(query);
  if (!q || q.length < 2) return [];
  const admin = createAdminClient();

  const like = `%${q}%`;
  const { data, error } = await admin
    .from("players")
    .select(
      "id, first_name, last_name, phone, telegram_user_id, is_resident"
    )
    .or(
      `first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like},telegram_user_id.ilike.${like}`
    )
    .order("first_name", { ascending: true })
    .limit(20);

  if (error) {
    console.error("searchPeople:", error);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name:
      [r.first_name, r.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ") || "(sin nombre)",
    phone: r.phone ? String(r.phone) : null,
    telegramLinked: Boolean(r.telegram_user_id),
    isResident: Boolean(r.is_resident),
  }));
}
