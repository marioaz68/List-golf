"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Server actions del módulo F&B para que el restaurante (o el club) edite
 * venues, categorías e items del menú desde el backoffice.
 *
 * Convenciones:
 *  - Precios SIEMPRE en centavos (integer). La UI captura "$150.00" y la
 *    convierte a 15000 antes de llamar a estas actions.
 *  - Borrado real: solo se permite si no hay referencias. Si las hay, se
 *    desactiva con is_active=false (las órdenes históricas quedan intactas).
 */

// =========================================================
// VENUES
// =========================================================

export async function upsertVenue(input: {
  id?: string;
  code: string;
  name: string;
  type: "restaurant" | "cart";
  holeRangeStart?: number | null;
  holeRangeEnd?: number | null;
  isActive: boolean;
  displayOrder: number;
  notes?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  const payload = {
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    type: input.type,
    hole_range_start: input.holeRangeStart ?? null,
    hole_range_end: input.holeRangeEnd ?? null,
    is_active: input.isActive,
    display_order: input.displayOrder,
    notes: input.notes ?? null,
  };
  if (!payload.code || !payload.name) {
    return { ok: false, error: "Código y nombre son obligatorios." };
  }
  if (input.id) {
    const { error } = await admin
      .from("fb_venues")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fb-admin");
    return { ok: true, id: input.id };
  }
  const { data, error } = await admin
    .from("fb_venues")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true, id: (data as { id: string }).id };
}

export async function deactivateVenue(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("fb_venues")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true };
}

// =========================================================
// CATEGORIES
// =========================================================

export async function upsertCategory(input: {
  id?: string;
  code: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  const payload = {
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    display_order: input.displayOrder,
    is_active: input.isActive,
  };
  if (!payload.code || !payload.name) {
    return { ok: false, error: "Código y nombre son obligatorios." };
  }
  if (input.id) {
    const { error } = await admin
      .from("fb_categories")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fb-admin");
    return { ok: true, id: input.id };
  }
  const { data, error } = await admin
    .from("fb_categories")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true, id: (data as { id: string }).id };
}

export async function deactivateCategory(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("fb_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true };
}

// =========================================================
// MENU ITEMS
// =========================================================

export async function upsertMenuItem(input: {
  id?: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  imageUrl?: string | null;
  availableVenueIds: string[];
  isActive: boolean;
  displayOrder: number;
  prepMinutes?: number | null;
  allergens?: string[] | null;
  notes?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  if (!input.categoryId) return { ok: false, error: "Falta categoría." };
  if (!input.name?.trim()) return { ok: false, error: "Falta nombre." };
  if (
    !Number.isFinite(input.priceCents) ||
    input.priceCents < 0 ||
    !Number.isInteger(input.priceCents)
  ) {
    return { ok: false, error: "Precio inválido (debe ser entero ≥ 0 en centavos)." };
  }

  const payload = {
    category_id: input.categoryId,
    name: input.name.trim(),
    description: input.description ?? null,
    price_cents: input.priceCents,
    image_url: input.imageUrl ?? null,
    available_venue_ids: input.availableVenueIds,
    is_active: input.isActive,
    display_order: input.displayOrder,
    prep_minutes: input.prepMinutes ?? null,
    allergens: input.allergens ?? null,
    notes: input.notes ?? null,
  };

  if (input.id) {
    const { error } = await admin
      .from("fb_menu_items")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/fb-admin");
    return { ok: true, id: input.id };
  }
  const { data, error } = await admin
    .from("fb_menu_items")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true, id: (data as { id: string }).id };
}

export async function deactivateMenuItem(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("fb_menu_items")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true };
}

/** Override del emoji manual de un item. Pasa null/'' para regresar al
 *  emoji automático del helper iconForMenuItem(). */
export async function setMenuItemEmoji(
  id: string,
  emoji: string | null
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const clean = (emoji ?? "").trim();
  const value = clean === "" ? null : clean.slice(0, 8); // máx 2 emojis (~8 chars)
  const { error } = await admin
    .from("fb_menu_items")
    .update({ display_emoji: value })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  revalidatePath("/fb-admin/emojis");
  return { ok: true };
}

export async function deleteMenuItem(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  // Solo permitir borrado real si no hay líneas de orden que lo referencian.
  const { count } = await admin
    .from("fb_order_items")
    .select("id", { count: "exact", head: true })
    .eq("menu_item_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Este item ya está en pedidos históricos. Mejor desactívalo para conservar el historial.",
    };
  }
  const { error } = await admin.from("fb_menu_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-admin");
  return { ok: true };
}
