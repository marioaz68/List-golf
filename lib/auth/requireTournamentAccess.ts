import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type AllowedRole =
  | "super_admin"
  | "club_admin"
  | "tournament_director"
  | "score_capture"
  | "checkin"
  | "viewer";

type Options = {
  tournamentId: string | null | undefined;
  allowedRoles?: AllowedRole[];
  redirectTo?: string;
};

export async function requireTournamentAccess({
  tournamentId,
  allowedRoles = [],
  redirectTo = "/tournaments",
}: Options) {
  if (!tournamentId) {
    redirect(redirectTo);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, club_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    redirect(redirectTo);
  }

  const { data: globalRows } = await supabase
    .from("user_global_roles")
    .select("roles(code)")
    .eq("user_id", user.id);

  const globalCodes =
    globalRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

  if (globalCodes.includes("super_admin")) {
    return;
  }

  if (tournament.club_id) {
    const { data: clubRows } = await supabase
      .from("user_club_roles")
      .select("roles(code)")
      .eq("user_id", user.id)
      .eq("club_id", tournament.club_id);

    const clubCodes =
      clubRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

    if (clubCodes.includes("club_admin")) {
      return;
    }
  }

  const { data: tournamentRows } = await supabase
    .from("user_tournament_roles")
    .select("roles(code)")
    .eq("user_id", user.id)
    .eq("tournament_id", tournamentId);

  const tournamentCodes =
    tournamentRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

  if (allowedRoles.length === 0) {
    if (tournamentCodes.length > 0) return;
  } else {
    const hasAllowedRole = allowedRoles.some((role) =>
      tournamentCodes.includes(role)
    );

    if (hasAllowedRole) return;
  }

  redirect(redirectTo);
}