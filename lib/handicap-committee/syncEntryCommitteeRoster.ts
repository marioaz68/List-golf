import type { SupabaseClient } from "@supabase/supabase-js";
import { syncEntryDisplayPlayerNumbers } from "@/lib/tournament/entryDisplayOrder";

/** Inscripción activa en el roster del torneo (visible en comité). */
export function isEntryOnCommitteeRoster(
  status: string | null | undefined
): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s || s === "cancelled" || s === "withdrawn") return false;
  return true;
}

export function committeeEnrollFlagFields(flaggedBy?: string | null) {
  return {
    flagged_for_committee: true,
    flagged_committee_at: new Date().toISOString(),
    flagged_committee_by: flaggedBy ?? null,
  };
}

export function committeeRemoveFlagFields() {
  return {
    flagged_for_committee: false,
    flagged_committee_reason: null,
    flagged_committee_at: null,
    flagged_committee_by: null,
  };
}

/** Alinea flagged_for_committee con altas/bajas del roster de inscripciones. */
export async function syncTournamentCommitteeRoster(
  admin: SupabaseClient,
  tournamentId: string,
  flaggedBy?: string | null
): Promise<void> {
  const tid = String(tournamentId ?? "").trim();
  if (!tid) return;

  const { data: rows, error } = await admin
    .from("tournament_entries")
    .select("id, status, flagged_for_committee")
    .eq("tournament_id", tid);

  if (error) {
    console.error("[committee-roster-sync]", error.message);
    return;
  }

  const onFields = committeeEnrollFlagFields(flaggedBy);
  const offFields = committeeRemoveFlagFields();

  for (const row of rows ?? []) {
    const id = String((row as { id?: string }).id ?? "");
    if (!id) continue;
    const status = (row as { status?: string | null }).status ?? null;
    const flagged = Boolean(
      (row as { flagged_for_committee?: boolean }).flagged_for_committee
    );
    const shouldFlag = isEntryOnCommitteeRoster(status);

    if (shouldFlag && !flagged) {
      await admin.from("tournament_entries").update(onFields).eq("id", id);
    } else if (!shouldFlag && flagged) {
      await admin.from("tournament_entries").update(offFields).eq("id", id);
    }
  }

  await syncEntryDisplayPlayerNumbers(admin, tid);
}
