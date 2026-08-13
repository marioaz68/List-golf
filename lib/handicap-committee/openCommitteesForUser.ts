import type { SupabaseClient } from "@supabase/supabase-js";

export type OpenCommitteeTournament = {
  tournamentId: string;
  tournamentName: string;
  committeeId: string;
};

export function committeeOnlyHomePath(
  open: OpenCommitteeTournament[]
): string {
  if (open.length === 1) {
    return `/comite-handicap?tournament_id=${encodeURIComponent(open[0]!.tournamentId)}`;
  }
  return "/comite-handicap";
}

/**
 * Torneos con comité status=open donde el usuario es miembro (rol
 * handicap_committee en torneo/club/global) Y está marcado presente.
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

  const committeeIds = openRows.map((r) => String(r.id));
  const { data: presenceRows } = await db
    .from("handicap_committee_member_presence")
    .select("committee_id, is_present")
    .eq("user_id", userId)
    .in("committee_id", committeeIds);

  const present = new Set(
    (presenceRows ?? [])
      .filter((p) => p.is_present && p.committee_id)
      .map((p) => String(p.committee_id))
  );

  const presentOpen = openRows.filter((r) => present.has(String(r.id)));
  if (!presentOpen.length) return [];

  const presentTourIds = [
    ...new Set(presentOpen.map((r) => String(r.tournament_id))),
  ];
  const { data: tours } = await db
    .from("tournaments")
    .select("id, name")
    .in("id", presentTourIds);
  const nameById = new Map(
    (tours ?? []).map((t) => [String(t.id), String(t.name ?? "")])
  );

  return presentOpen.map((r) => {
    const tournamentId = String(r.tournament_id);
    return {
      tournamentId,
      tournamentName:
        nameById.get(tournamentId)?.trim() || tournamentId.slice(0, 8),
      committeeId: String(r.id),
    };
  });
}
