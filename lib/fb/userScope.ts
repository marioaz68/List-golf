import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resuelve qué venues puede ver el usuario actual en el módulo F&B.
 *
 * Reglas:
 *  - super_admin / club_admin / tournament_director → ven TODOS los venues
 *    (sin filtro, retorna null = "todos")
 *  - rol 'restaurante' con asignaciones en fb_user_venues → ven solo esos
 *    (a menos que tengan is_owner=true que también ve todos)
 *  - rol 'restaurante' sin asignaciones → no ve ningún pedido (array vacío)
 *
 * Esto es defensa por defecto: si te dan rol restaurante pero nadie te
 * asigna un venue, no puedes ver datos de otros restaurantes.
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
]);

export async function resolveFbScope(
  admin: SupabaseClient,
  userId: string,
  userRoles: string[]
): Promise<FbScope> {
  // Admin del club / director del torneo → acceso total + dueño implícito
  if (userRoles.some((r) => FULL_ACCESS_ROLES.has(r))) {
    return { allowedVenueIds: null, isOwner: true };
  }

  // Buscar asignaciones del usuario en fb_user_venues
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
