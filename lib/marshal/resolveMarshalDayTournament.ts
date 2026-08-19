import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRoundIdsWithCaptureActivityToday,
  loadTodayRoundsAcrossTournaments,
} from "@/lib/ritmo/loadCaptureLagGroups";
import { todayMexicoDate } from "@/lib/ritmo/opsDay";
import {
  marshalAccessibleTournamentIds,
  type MarshalProfile,
} from "@/lib/marshal/resolveMarshal";

/** Torneo del día para el panel marshal (URL explícita o ronda de hoy). */
export async function resolveMarshalDayTournamentId(
  admin: SupabaseClient,
  marshal: MarshalProfile,
  selectedTournamentId?: string | null
): Promise<string | null> {
  const accessible = await marshalAccessibleTournamentIds(admin, marshal);
  const explicit = String(selectedTournamentId ?? "").trim();
  if (explicit && accessible.has(explicit)) return explicit;

  const today = todayMexicoDate();
  const slots = (await loadTodayRoundsAcrossTournaments(admin, today)).filter((s) =>
    accessible.has(s.tournament.id)
  );
  if (slots.length === 0) return null;

  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(
    admin,
    today
  );
  const activeSlot =
    slots.find((s) => activityRoundIds.has(s.roundId)) ?? slots[0];
  return activeSlot.tournament.id;
}
