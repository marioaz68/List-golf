import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resuelve qué venues puede ver el usuario actual en el módulo F&B.
 *
 * Reglas:
 *  - super_admin / club_admin / tournament_director → ven TODOS los venues
 *    (sin filtro, retorna null = "todos")
 *  - 'restaurante' (MANAGER del restaurante) → ven TODOS los venues F&B
 *    (sin filtro), porque son el dueño / encargado general.
 *  - 'mesero' / 'cocinero' / 'operador_carrito' (staff de piso) →
 *    SOLO los venues que les asignen en fb_user_venues.
 *  - Cualquier rol staff con is_owner=true en fb_user_venues → también
 *    ve todos (override por venue específico).
 *
 * Sin asignaciones para staff = no ve ningún pedido (array vacío).
 */

export interface FbScope {
  /** null = puede ver TODOS los venues (admin/owner). [] = no ve ninguno. */
  allowedVenueIds: string[] | null;
  /** True si tiene flag de dueño (ve reportes globales). */
  isOwner: boolean;
}

const FULL_ACCESS_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "restaurante", // manager del restaurante = ve todo
]);

export async function resolveFbScope(
  admin: SupabaseClient,
  userId: string,
  userRoles: string[]
): Promise<FbScope> {
  // Manager / admin → acceso total + dueño implícito
  if (userRoles.some((r) => FULL_ACCESS_ROLES.has(r))) {
    return { allowedVenueIds: null, isOwner: true };
  }

  // Staff (mesero, cocinero, operador_carrito) → filtrado por fb_user_venues
  const { data, error } = await admin
    .from("fb_user_venues")
    .select("venue_id, is_owner")
    .eq("user_id", userId);

  if (error) {
    console.error("resolveFbScope:", error);
    return { allowedVenueIds: [], isOwner: false };
  }

  const rows = (data ?? []) as Array<{ venue_id: string; is_owner: boolean }>;
  const isOwner = rows.some((r) => r.is_owner === true);
  if (isOwner) {
    return { allowedVenueIds: null, isOwner: true };
  }
  return {
    allowedVenueIds: rows.map((r) => r.venue_id),
    isOwner: false,
  };
}
