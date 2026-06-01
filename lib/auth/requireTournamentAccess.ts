import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type AllowedRole =
  | "super_admin"
  | "club_admin"
  | "tournament_director"
  | "score_capture"
  | "checkin"
  | "viewer"
  | "entries_operator"
  | "caddie_manager"
  | "marshal";

type Options = {
  tournamentId: string | null | undefined;
  allowedRoles?: AllowedRole[];
  redirectTo?: string;
};

export type TournamentAccessResult =
  | { ok: true }
  | { ok: false; reason: "no_tournament" | "no_user" | "no_tournament_row" | "forbidden" };

/**
 * Comprueba acceso sin redirigir (para server actions).
 */
export async function checkTournamentAccess({
  tournamentId,
  allowedRoles = [],
}: Pick<Options, "tournamentId" | "allowedRoles">): Promise<TournamentAccessResult> {
  if (!tournamentId) {
    return { ok: false, reason: "no_tournament" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, reason: "no_user" };
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, club_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return { ok: false, reason: "no_tournament_row" };
  }

  const { data: globalRows } = await supabase
    .from("user_global_roles")
    .select("roles(code)")
    .eq("user_id", user.id);

  const globalCodes =
    globalRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

  if (globalCodes.includes("super_admin")) {
    return { ok: true };
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
      return { ok: true };
    }

    // Marshal con rol asignado al club tiene acceso al torneo del club
    // si el rol está dentro de los permitidos para la ruta.
    if (
      (allowedRoles.length === 0 || allowedRoles.includes("marshal")) &&
      clubCodes.includes("marshal")
    ) {
      return { ok: true };
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
    if (tournamentCodes.length > 0) return { ok: true };
  } else {
    const hasAllowedRole = allowedRoles.some((role) =>
      tournamentCodes.includes(role)
    );

    if (hasAllowedRole) return { ok: true };
  }

  return { ok: false, reason: "forbidden" };
}

export async function requireTournamentAccess({
  tournamentId,
  allowedRoles = [],
  redirectTo = "/tournaments",
}: Options) {
  const access = await checkTournamentAccess({ tournamentId, allowedRoles });

  if (access.ok) return;

  if (access.reason === "no_user") {
    redirect("/login");
  }

  redirect(redirectTo);
}

export function tournamentAccessDeniedMessage(
  reason: "no_tournament" | "no_user" | "no_tournament_row" | "forbidden"
): string {
  switch (reason) {
    case "no_user":
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo (no se perdió el trabajo si ya guardaste).";
    case "forbidden":
      return "No tienes permiso para capturar en este torneo.";
    case "no_tournament_row":
      return "No se encontró el torneo.";
    default:
      return "Falta el torneo en la solicitud.";
  }
}
