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

const PHOTO_BUCKET = "fb-menu-photos";
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB

/** Sube una foto al bucket de Storage y guarda la URL pública en
 *  fb_menu_items.image_url. Recibe FormData con campos 'item_id' (uuid)
 *  y 'file' (binary). Sobreescribe la foto anterior si existe. */
export async function uploadMenuItemPhoto(
  formData: FormData
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const admin = createAdminClient();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const file = formData.get("file");

  if (!itemId) return { ok: false, error: "Falta item_id." };
  if (!(file instanceof File)) return { ok: false, error: "Sin archivo." };
  if (file.size === 0) return { ok: false, error: "Archivo vacío." };
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      error: `Archivo muy grande (máx ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB).`,
    };
  }

  // Validar tipo MIME básico
  const mime = file.type || "image/jpeg";
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mime)) {
    return { ok: false, error: "Solo se aceptan imágenes (JPG, PNG, WebP)." };
  }

  // Determinar extensión desde el MIME (o fallback al nombre del archivo)
  let ext = "jpg";
  if (/png/i.test(mime)) ext = "png";
  else if (/webp/i.test(mime)) ext = "webp";
  else if (/heic|heif/i.test(mime)) ext = "heic";

  // Path determinista: '{itemId}.{ext}' — siempre sobreescribe la anterior
  // del mismo item (sin acumular versiones obsoletas).
  const path = `${itemId}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, buf, {
      contentType: mime,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) {
    console.error("FB PHOTO upload:", uploadErr);
    return { ok: false, error: uploadErr.message };
  }

  // URL pública con cache-bust por timestamp para que el navegador no muestre
  // la foto cacheada anterior cuando reemplazamos.
  const { data: pub } = admin.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  // Guardar URL en el item
  const { error: updErr } = await admin
    .from("fb_menu_items")
    .update({ image_url: url })
    .eq("id", itemId);
  if (updErr) {
    console.error("FB PHOTO update item:", updErr);
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/fb-admin");
  revalidatePath("/fb-admin/emojis");
  return { ok: true, url };
}

/** Quita la foto del item (borra del Storage + image_url=null en BD).
 *  Tras esto, la Mini App vuelve a mostrar el emoji. */
export async function removeMenuItemPhoto(
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!itemId) return { ok: false, error: "Falta item_id." };

  // Intentar borrar las posibles extensiones del path
  const paths = ["jpg", "png", "webp", "heic", "jpeg"].map((e) => `${itemId}.${e}`);
  await admin.storage.from(PHOTO_BUCKET).remove(paths).catch(() => {
    // best-effort: si no existían, no es error
  });

  const { error } = await admin
    .from("fb_menu_items")
    .update({ image_url: null })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/fb-admin");
  revalidatePath("/fb-admin/emojis");
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
