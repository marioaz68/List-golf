"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { createRoundFromForm } from "@/lib/rounds/createRoundFromForm";

type RoundFormState = { ok: true } | { ok: false; message: string };

function isNextRedirectError(error: unknown): boolean {
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string"
      ? (error as { digest: string }).digest
      : "";
  return digest.startsWith("NEXT_REDIRECT");
}

/** Wrapper para useActionState: errores visibles; redirect sigue funcionando. */
export async function createRoundFormAction(
  _prev: RoundFormState,
  formData: FormData
): Promise<RoundFormState> {
  try {
    const tournament_id = String(formData.get("tournament_id") ?? "").trim();
    if (!tournament_id) {
      return { ok: false, message: "Falta el torneo." };
    }
    await requireTournamentAccess({
      tournamentId: tournament_id,
      allowedRoles: ["super_admin", "club_admin", "tournament_director"],
    });
    const supabase = createAdminClient();
    await createRoundFromForm(supabase, formData);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message =
      error instanceof Error ? error.message : "No se pudo crear la ronda.";
    return { ok: false, message };
  }
  return { ok: true };
}
