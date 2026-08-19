import type { SupabaseClient } from "@supabase/supabase-js";
import { profileInitials } from "@/lib/marshal/profileInitials";

export type MarshalProfile = {
  profileId: string;
  name: string;
  initials: string;
  /** IDs de club donde tiene rol marshal a nivel club. */
  clubIds: string[];
  /** IDs de torneo donde tiene rol marshal solo en ese torneo. */
  tournamentIds: string[];
};

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return (
    [first, last]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ") || "Marshal"
  );
}

function extractRoleCode(roles: unknown): string | null {
  if (Array.isArray(roles)) {
    const first = roles[0] as { code?: string } | undefined;
    return first?.code ?? null;
  }
  if (roles && typeof roles === "object" && "code" in roles) {
    return String((roles as { code?: string }).code ?? "") || null;
  }
  return null;
}

async function profileHasMarshalRole(
  admin: SupabaseClient,
  profileId: string
): Promise<boolean> {
  const [{ data: clubRows }, { data: tournamentRows }] = await Promise.all([
    admin
      .from("user_club_roles")
      .select("roles:role_id(code)")
      .eq("user_id", profileId)
      .eq("is_active", true),
    admin
      .from("user_tournament_roles")
      .select("roles:role_id(code)")
      .eq("user_id", profileId)
      .eq("is_active", true),
  ]);

  const codes = [
    ...(clubRows ?? []).map((r) => extractRoleCode((r as { roles?: unknown }).roles)),
    ...(tournamentRows ?? []).map((r) =>
      extractRoleCode((r as { roles?: unknown }).roles)
    ),
  ].filter(Boolean);

  return codes.includes("marshal");
}

/** Resuelve marshal por telegram_chat_id (mismo valor que guarda /soy_marshal). */
export async function resolveMarshal(
  admin: SupabaseClient,
  telegramUserId: string
): Promise<MarshalProfile | null> {
  const tg = String(telegramUserId ?? "").trim();
  if (!tg) return null;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, is_active")
    .eq("telegram_chat_id", tg)
    .maybeSingle();

  if (error) {
    console.error("MARSHAL PROFILE LOOKUP:", error);
    return null;
  }
  if (!profile || (profile as { is_active?: boolean }).is_active === false) {
    return null;
  }

  const profileId = (profile as { id: string }).id;
  if (!(await profileHasMarshalRole(admin, profileId))) return null;

  const [{ data: clubRows }, { data: tournamentRows }] = await Promise.all([
    admin
      .from("user_club_roles")
      .select("club_id, roles:role_id(code)")
      .eq("user_id", profileId)
      .eq("is_active", true),
    admin
      .from("user_tournament_roles")
      .select("tournament_id, roles:role_id(code)")
      .eq("user_id", profileId)
      .eq("is_active", true),
  ]);

  const clubIds: string[] = [];
  for (const row of clubRows ?? []) {
    if (extractRoleCode((row as { roles?: unknown }).roles) === "marshal") {
      const cid = String((row as { club_id?: string }).club_id ?? "").trim();
      if (cid) clubIds.push(cid);
    }
  }

  const tournamentIds: string[] = [];
  for (const row of tournamentRows ?? []) {
    if (extractRoleCode((row as { roles?: unknown }).roles) === "marshal") {
      const tid = String(
        (row as { tournament_id?: string }).tournament_id ?? ""
      ).trim();
      if (tid) tournamentIds.push(tid);
    }
  }

  const firstName = (profile as { first_name: string | null }).first_name;
  const lastName = (profile as { last_name: string | null }).last_name;

  return {
    profileId,
    name: fullName(firstName, lastName),
    initials: profileInitials(firstName, lastName),
    clubIds: Array.from(new Set(clubIds)),
    tournamentIds: Array.from(new Set(tournamentIds)),
  };
}

/** Torneos a los que el marshal tiene acceso (club + torneo). */
export async function marshalAccessibleTournamentIds(
  admin: SupabaseClient,
  marshal: MarshalProfile
): Promise<Set<string>> {
  const ids = new Set<string>(marshal.tournamentIds);
  if (marshal.clubIds.length === 0) return ids;

  const { data: rows } = await admin
    .from("tournaments")
    .select("id")
    .in("club_id", marshal.clubIds)
    .neq("is_archived", true);

  for (const row of rows ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

export type MarshalRecipient = {
  profileId: string;
  name: string;
  chatId: string;
};

/** Marshals con Telegram vinculado para un torneo. */
export async function listMarshalsForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<MarshalRecipient[]> {
  const tid = String(tournamentId ?? "").trim();
  if (!tid) return [];

  const { data: tournament } = await admin
    .from("tournaments")
    .select("club_id")
    .eq("id", tid)
    .maybeSingle();
  const clubId = String(tournament?.club_id ?? "").trim();

  const profileIds = new Set<string>();

  if (clubId) {
    const { data: clubRoleRows } = await admin
      .from("user_club_roles")
      .select("user_id, roles:role_id(code)")
      .eq("club_id", clubId)
      .eq("is_active", true);
    for (const row of clubRoleRows ?? []) {
      if (extractRoleCode((row as { roles?: unknown }).roles) === "marshal") {
        const uid = String((row as { user_id?: string }).user_id ?? "").trim();
        if (uid) profileIds.add(uid);
      }
    }
  }

  const { data: tRoleRows } = await admin
    .from("user_tournament_roles")
    .select("user_id, roles:role_id(code)")
    .eq("tournament_id", tid)
    .eq("is_active", true);
  for (const row of tRoleRows ?? []) {
    if (extractRoleCode((row as { roles?: unknown }).roles) === "marshal") {
      const uid = String((row as { user_id?: string }).user_id ?? "").trim();
      if (uid) profileIds.add(uid);
    }
  }

  if (profileIds.size === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, telegram_chat_id, is_active")
    .in("id", Array.from(profileIds));

  const out: MarshalRecipient[] = [];
  for (const p of profiles ?? []) {
    if ((p as { is_active?: boolean }).is_active === false) continue;
    const chatId = String(
      (p as { telegram_chat_id?: string | null }).telegram_chat_id ?? ""
    ).trim();
    if (!chatId) continue;
    out.push({
      profileId: String((p as { id: string }).id),
      name: fullName(
        (p as { first_name: string | null }).first_name,
        (p as { last_name: string | null }).last_name
      ),
      chatId,
    });
  }
  return out;
}
