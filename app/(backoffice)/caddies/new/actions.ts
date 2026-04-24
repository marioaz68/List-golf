"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

export async function createCaddieAction(formData: FormData) {
  const supabase = createAdminClient();

  const first_name = clean(formData.get("first_name"));
  const last_name = clean(formData.get("last_name"));
  const nickname = clean(formData.get("nickname"));
  const phone = clean(formData.get("phone"));
  const telegram = clean(formData.get("telegram"));
  const whatsapp_phone = clean(formData.get("whatsapp_phone"));
  const whatsapp_phone_e164 = clean(formData.get("whatsapp_phone_e164"));
  const email = clean(formData.get("email"));
  const club_id = clean(formData.get("club_id"));
  const level = clean(formData.get("level"));
  const notes = clean(formData.get("notes"));

  if (!first_name) {
    throw new Error("El nombre es obligatorio");
  }

  if (!last_name) {
    throw new Error("El apellido es obligatorio");
  }

  const allowedLevels = ["advanced", "intermediate", "beginner", ""];
  if (!allowedLevels.includes(level)) {
    throw new Error("Nivel inválido");
  }

  const { error } = await supabase.from("caddies").insert({
    first_name,
    last_name,
    nickname: nullable(nickname),
    phone: nullable(phone),
    telegram: nullable(telegram),
    whatsapp_phone: nullable(whatsapp_phone),
    whatsapp_phone_e164: nullable(whatsapp_phone_e164),
    email: nullable(email),
    club_id: nullable(club_id),
    level: nullable(level),
    notes: nullable(notes),
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/caddies");
  revalidatePath("/caddies/new");
  redirect("/caddies");
}