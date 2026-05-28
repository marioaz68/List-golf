import type { SupabaseClient } from "@supabase/supabase-js";

export type AccessibleTournament = {
  id: string;
  name: string | null;
  start_date: string | null;
  created_at: string | null;
};

export type TournamentAccessScope =
  | { scope: "global"; tournamentIds: null }
  | { scope: "limited"; tournamentIds: Set<string> };

/**
 * Devuelve los `tournament_id` que el usuario puede ver:
 * - `super_admin` global → todos.
 * - `club_admin` global → todos los del/los club(es) donde es admin
 *   (también `user_club_roles` con `club_admin`).
 * - Roles a nivel torneo (`user_tournament_roles`) → solo ese torneo.
 * - Roles a nivel club (`user_club_roles`) → todos los torneos del club.
 */
export async function getTournamentAccessScope(
  supabase: SupabaseClient,
  userId: string
): Promise<TournamentAccessScope> {
  const [globalRes, clubRes, tournamentRes] = await Promise.all([
    supabase
      .from("user_global_roles")
      .select("roles:role_id(code)")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("user_club_roles")
      .select("club_id, roles:role_id(code)")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("user_tournament_roles")
      .select("tournament_id")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);

  const globalCodes: string[] = [];
  for (const row of (globalRes.data ?? []) as Array<{
    roles: { code: string | null } | Array<{ code: string | null }> | null;
  }>) {
    const r = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    if (r?.code) globalCodes.push(r.code);
  }
  if (globalCodes.includes("super_admin")) {
    return { scope: "global", tournamentIds: null };
  }

  const clubIds = new Set<string>();
  for (const row of (clubRes.data ?? []) as Array<{
    club_id: string | null;
    roles: { code: string | null } | Array<{ code: string | null }> | null;
  }>) {
    const code = (Array.isArray(row.roles) ? row.roles[0] : row.roles)?.code;
    if (!code || !row.club_id) continue;
    clubIds.add(String(row.club_id));
  }

  const tournamentIds = new Set<string>();
  for (const row of (tournamentRes.data ?? []) as Array<{
    tournament_id: string | null;
  }>) {
    if (row.tournament_id) tournamentIds.add(String(row.tournament_id));
  }

  if (clubIds.size > 0) {
    const { data: clubTournaments } = await supabase
      .from("tournaments")
      .select("id")
      .in("club_id", Array.from(clubIds));
    for (const t of (clubTournaments ?? []) as Array<{ id: string | null }>) {
      if (t.id) tournamentIds.add(String(t.id));
    }
  }

  return { scope: "limited", tournamentIds };
}

/** Lista los torneos accesibles del usuario (filtrados por su scope). */
export async function listAccessibleTournaments(
  supabase: SupabaseClient,
  userId: string
): Promise<AccessibleTournament[]> {
  const scope = await getTournamentAccessScope(supabase, userId);

  let query = supabase
    .from("tournaments")
    .select("id, name, start_date, created_at")
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (scope.scope === "limited") {
    if (scope.tournamentIds.size === 0) {
      return [];
    }
    query = query.in("id", Array.from(scope.tournamentIds));
  }

  const { data } = await query;
  return (data ?? []) as AccessibleTournament[];
}
