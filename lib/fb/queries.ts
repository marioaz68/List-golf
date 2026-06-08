/**
 * Queries de lectura del módulo F&B.
 * Reusables desde server components y server actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FbCategory, FbMenuItem, FbVenue } from "./types";

function rowToVenue(r: Record<string, unknown>): FbVenue {
  return {
    id: String(r.id),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    type: (r.type as FbVenue["type"]) ?? "restaurant",
    holeRangeStart:
      typeof r.hole_range_start === "number" ? r.hole_range_start : null,
    holeRangeEnd:
      typeof r.hole_range_end === "number" ? r.hole_range_end : null,
    isActive: Boolean(r.is_active),
    displayOrder: Number(r.display_order ?? 0),
    notes: r.notes ? String(r.notes) : null,
  };
}

function rowToCategory(r: Record<string, unknown>): FbCategory {
  return {
    id: String(r.id),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    displayOrder: Number(r.display_order ?? 0),
    isActive: Boolean(r.is_active),
  };
}

function rowToMenuItem(r: Record<string, unknown>): FbMenuItem {
  return {
    id: String(r.id),
    categoryId: String(r.category_id),
    name: String(r.name ?? ""),
    description: r.description ? String(r.description) : null,
    priceCents: Number(r.price_cents ?? 0),
    imageUrl: r.image_url ? String(r.image_url) : null,
    availableVenueIds: Array.isArray(r.available_venue_ids)
      ? (r.available_venue_ids as string[])
      : [],
    isActive: Boolean(r.is_active),
    displayOrder: Number(r.display_order ?? 0),
    prepMinutes:
      typeof r.prep_minutes === "number" ? r.prep_minutes : null,
    allergens: Array.isArray(r.allergens) ? (r.allergens as string[]) : null,
    notes: r.notes ? String(r.notes) : null,
  };
}

export async function listVenues(
  admin: SupabaseClient,
  opts: { onlyActive?: boolean } = {}
): Promise<FbVenue[]> {
  let q = admin
    .from("fb_venues")
    .select("*")
    .order("display_order", { ascending: true });
  if (opts.onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.error("FB listVenues:", error);
    return [];
  }
  return (data ?? []).map((r) => rowToVenue(r as Record<string, unknown>));
}

export async function listCategories(
  admin: SupabaseClient,
  opts: { onlyActive?: boolean } = {}
): Promise<FbCategory[]> {
  let q = admin
    .from("fb_categories")
    .select("*")
    .order("display_order", { ascending: true });
  if (opts.onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.error("FB listCategories:", error);
    return [];
  }
  return (data ?? []).map((r) => rowToCategory(r as Record<string, unknown>));
}

export async function listMenuItems(
  admin: SupabaseClient,
  opts: { onlyActive?: boolean; venueId?: string | null } = {}
): Promise<FbMenuItem[]> {
  let q = admin
    .from("fb_menu_items")
    .select("*")
    .order("display_order", { ascending: true });
  if (opts.onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.error("FB listMenuItems:", error);
    return [];
  }
  let items = (data ?? []).map((r) =>
    rowToMenuItem(r as Record<string, unknown>)
  );
  if (opts.venueId) {
    items = items.filter((it) => it.availableVenueIds.includes(opts.venueId!));
  }
  return items;
}

/** Pequeño helper para mostrar el menú agrupado por categoría a la UI. */
export interface MenuByCategory {
  category: FbCategory;
  items: FbMenuItem[];
}

export function groupMenuByCategory(
  categories: FbCategory[],
  items: FbMenuItem[]
): MenuByCategory[] {
  const byCat = new Map<string, FbMenuItem[]>();
  for (const it of items) {
    const arr = byCat.get(it.categoryId) ?? [];
    arr.push(it);
    byCat.set(it.categoryId, arr);
  }
  return categories
    .map((c) => ({ category: c, items: byCat.get(c.id) ?? [] }))
    .filter((g) => g.items.length > 0);
}
