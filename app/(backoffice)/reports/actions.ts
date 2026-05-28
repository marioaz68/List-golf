"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { recomputeTournamentHandicaps } from "@/lib/handicap/recomputeTournamentHandicaps";

/**
 * Recalcula CH/PH de todos los inscritos del torneo y los persiste en BD.
 * Se invoca desde el reporte de "Handicaps por categoría". Respeta overrides.
 */
export async function recomputeReportHandicaps(formData: FormData) {
  const tournament_id = String(formData.get("tournament_id") ?? "").trim();
  if (!tournament_id) {
    redirect("/reports");
  }

  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });

  const admin = createAdminClient();
  const result = await recomputeTournamentHandicaps(admin, tournament_id);

  revalidatePath("/reports");

  const params = new URLSearchParams({
    tournament_id,
    tab: "handicaps",
    hcap_status: "ok",
    hcap_message: `Recalculados ${result.updated} de ${result.total} inscritos${
      result.skipped_no_tee > 0
        ? ` (${result.skipped_no_tee} sin salida válida)`
        : ""
    }${result.kept_override > 0 ? `, ${result.kept_override} con override` : ""}.`,
  });
  redirect(`/reports?${params.toString()}`);
}
