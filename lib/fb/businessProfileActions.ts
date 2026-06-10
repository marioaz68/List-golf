"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  rowToBusinessProfile,
  type BusinessProfile,
  type BusinessProfileInput,
} from "@/lib/fb/businessProfile";

/**
 * Server actions del perfil público del negocio (datos del restaurante que
 * se muestran en /restaurante). Tabla singleton fb_business_profile.
 */

interface ActionResult {
  ok: boolean;
  error?: string;
}

function clean(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** Lee el perfil (la única fila). Devuelve null si no existe. */
export async function loadBusinessProfile(): Promise<BusinessProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fb_business_profile")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("loadBusinessProfile:", error);
    return null;
  }
  if (!data) return null;
  return rowToBusinessProfile(data as Record<string, unknown>);
}

export async function saveBusinessProfile(
  input: BusinessProfileInput
): Promise<ActionResult> {
  if (!clean(input.businessName)) {
    return { ok: false, error: "El nombre del negocio es obligatorio." };
  }
  const admin = createAdminClient();

  const row = {
    business_name: clean(input.businessName) ?? "Restaurante Hoyo 6",
    legal_name: clean(input.legalName),
    contact_email: clean(input.contactEmail),
    contact_phone: clean(input.contactPhone),
    whatsapp: clean(input.whatsapp),
    address: clean(input.address),
    intro: clean(input.intro),
    refund_policy: clean(input.refundPolicy),
    is_published: Boolean(input.isPublished),
    updated_at: new Date().toISOString(),
  };

  // Buscar fila existente (singleton)
  const { data: existing } = await admin
    .from("fb_business_profile")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("fb_business_profile")
      .update(row)
      .eq("id", (existing as { id: string }).id);
    if (error) {
      console.error("saveBusinessProfile update:", error);
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await admin.from("fb_business_profile").insert(row);
    if (error) {
      console.error("saveBusinessProfile insert:", error);
      return { ok: false, error: error.message };
    }
  }

  revalidatePath("/fb-restaurante");
  revalidatePath("/restaurante");
  return { ok: true };
}
