import type { SupabaseClient } from "@supabase/supabase-js";

export type OpenCommitteeTournament = {
  tournamentId: string;
  tournamentName: string;
  committeeId: string;
  startDate: string | null;
};

export function committeeOnlyHomePath(
  _open?: OpenCommitteeTournament[]
): string {
  return "/comite-handicap";
}

/**
 * Torneos con comité status=open donde el usuario es miembro
 * (handicap_committee en torneo/club/global).
 * No exige presencia: eso solo habilita el voto.
 * Omite archivados y no públicos (p. ej. pruebas).
 */
export async function loadOpenCommitteeTournamentsForUser(
  db: SupabaseClient,
  userId: string
): Promise<OpenCommitteeTournament[]> {
  const { data: roleRow } = await db
    .from("roles")
    .select("id")
    .eq("code", "handicap_committee")
    .maybeSingle();
  const roleId = roleRow?.id ? String(roleRow.id) : null;
  if (!roleId) return [];

  const [{ data: tourRows }, { data: clubRows }, { data: globalRows }] =
    await Promise.all([
      db
        .from("user_tournament_roles")
        .select("tournament_id")
        .eq("user_id", userId)
        .eq("role_id", roleId)
        .eq("is_active", true),
      db
        .from("user_club_roles")
        .select("club_id")
        .eq("user_id", userId)
        .eq("role_id", roleId)
        .eq("is_active", true),
      db
        .from("user_global_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role_id", roleId)
        .eq("is_active", true),
    ]);

  const isGlobal = (globalRows ?? []).length > 0;
  const tournamentIds = new Set<string>();
  for (const row of tourRows ?? []) {
    if (row.tournament_id) tournamentIds.add(String(row.tournament_id));
  }

  const clubIds = [
    ...new Set(
      (clubRows ?? [])
        .map((r) => (r.club_id ? String(r.club_id) : ""))
        .filter(Boolean)
    ),
  ];
  if (clubIds.length) {
    const { data: clubTours } = await db
      .from("tournaments")
      .select("id")
      .in("club_id", clubIds);
    for (const t of clubTours ?? []) {
      if (t.id) tournamentIds.add(String(t.id));
    }
  }

  if (!isGlobal && tournamentIds.size === 0) return [];

  let openQuery = db
    .from("tournament_handicap_committees")
    .select("id, tournament_id")
    .eq("status", "open");
  if (!isGlobal) {
    openQuery = openQuery.in("tournament_id", [...tournamentIds]);
  }
  const { data: openRows, error: openErr } = await openQuery;
  if (openErr) {
    console.error("[comite] open committees", openErr.message);
    return [];
  }
  if (!openRows?.length) return [];

  const tourIds = [
    ...new Set(openRows.map((r) => String(r.tournament_id))),
  ];
  const { data: tours } = await db
    .from("tournaments")
    .select("id, name, start_date, is_archived, is_public")
    .in("id", tourIds);

  const visible = new Map<
    string,
    { name: string; startDate: string | null }
  >();
  for (const t of tours ?? []) {
    if (!t.id) continue;
    if (t.is_archived) continue;
    if (t.is_public === false) continue;
    visible.set(String(t.id), {
      name: String(t.name ?? "").trim() || String(t.id).slice(0, 8),
      startDate: t.start_date ? String(t.start_date) : null,
    });
  }

  const rows = openRows
    .map((r) => {
      const tournamentId = String(r.tournament_id);
      const meta = visible.get(tournamentId);
      if (!meta) return null;
      return {
        tournamentId,
        tournamentName: meta.name,
        committeeId: String(r.id),
        startDate: meta.startDate,
      };
    })
    .filter((row): row is OpenCommitteeTournament => row !== null);

  rows.sort((a, b) => {
    const da = a.startDate ?? "";
    const dbDate = b.startDate ?? "";
    if (da === dbDate) return a.tournamentName.localeCompare(b.tournamentName, "es");
    return dbDate.localeCompare(da);
  });

  return rows;
}
