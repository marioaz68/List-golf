import type { SupabaseClient } from "@supabase/supabase-js";

export type TournamentRegistrationStatus = "open" | "closed" | string | null;

export async function fetchTournamentRegistrationStatus(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<TournamentRegistrationStatus> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("registration_status")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo leer el estado de inscripciones: ${error.message}`
    );
  }

  return (data?.registration_status as TournamentRegistrationStatus) ?? null;
}

export function isRegistrationClosed(
  status: TournamentRegistrationStatus
): boolean {
  return String(status ?? "").trim().toLowerCase() === "closed";
}

/** Salidas, captura y live scoring operativo solo con inscripciones cerradas. */
export function assertRegistrationClosedForTeeSheet(
  status: TournamentRegistrationStatus
): void {
  if (isRegistrationClosed(status)) return;
  throw new Error(
    "Las inscripciones siguen abiertas. Cierra inscripciones en Inscritos antes de generar salidas, capturar tarjetas o avanzar de ronda."
  );
}
