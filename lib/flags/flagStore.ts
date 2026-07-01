import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Almacén de posiciones de la bandera (pin) por hoyo.
 *
 * - course_hole_flag_positions: histórico (la vigente = la más reciente).
 * - telegram_flag_sessions: hoyo activo de captura por encargado en Telegram.
 *
 * Reutilizable desde el webhook de Telegram y desde la mini app / API.
 */

export type FlagSource = "gps" | "map" | "yards";

/** Fecha de hoy en horario de México (YYYY-MM-DD). Igual que en ritmo. */
export function todayMexicoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface SaveFlagArgs {
  courseId: string;
  hole: number;
  lat: number;
  lon: number;
  source: FlagSource;
  effectiveDate?: string | null;
  /** Último día vigente. NULL = hasta la próxima captura. */
  validUntil?: string | null;
  chatId?: string | null;
  profileId?: string | null;
  accuracyM?: number | null;
  note?: string | null;
  // Datos del pin sheet (captura por yardas), para referencia del jugador.
  color?: string | null;
  side?: string | null;
  depthYards?: number | null;
  edgeYards?: number | null;
}

/** Inserta una posición de bandera (siempre append: deja histórico). */
export async function saveFlagPosition(
  admin: SupabaseClient,
  args: SaveFlagArgs
): Promise<void> {
  const { error } = await admin.from("course_hole_flag_positions").insert({
    course_id: args.courseId,
    hole_number: args.hole,
    lat: args.lat,
    lon: args.lon,
    source: args.source,
    effective_date: args.effectiveDate || todayMexicoDate(),
    valid_until: args.validUntil ?? null,
    captured_by_chat_id: args.chatId ?? null,
    captured_by_profile_id: args.profileId ?? null,
    accuracy_m: args.accuracyM ?? null,
    note: args.note ?? null,
    color: args.color ?? null,
    side: args.side ?? null,
    depth_yards: args.depthYards ?? null,
    edge_yards: args.edgeYards ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface FlagPositionRow {
  hole_number: number;
  lat: number;
  lon: number;
  source: FlagSource;
  effective_date: string;
  valid_until: string | null;
  created_at: string;
  color: string | null;
  side: string | null;
  depth_yards: number | null;
  edge_yards: number | null;
}

/** Filtro de vigencia: ya empezó (effective_date <= hoy) y no ha vencido
 *  (valid_until nulo o >= hoy). Se aplica a las consultas de bandera vigente. */
function applyValidityFilter<T>(query: T, today: string): T {
  // Supabase query builder: encadenamos lte + or.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any)
    .lte("effective_date", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`);
}

const FLAG_COLUMNS =
  "hole_number, lat, lon, source, effective_date, valid_until, created_at, color, side, depth_yards, edge_yards";

/** Posición VIGENTE de cada hoyo (respeta la ventana de vigencia). Si la
 *  bandera de un hoyo ya venció, ese hoyo no aparece → Yardas usa el centro. */
export async function loadLatestFlags(
  admin: SupabaseClient,
  courseId: string
): Promise<Map<number, FlagPositionRow>> {
  const today = todayMexicoDate();
  const base = admin
    .from("course_hole_flag_positions")
    .select(FLAG_COLUMNS)
    .eq("course_id", courseId);
  const { data, error } = await applyValidityFilter(base, today)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const latest = new Map<number, FlagPositionRow>();
  for (const r of (data ?? []) as FlagPositionRow[]) {
    // Como vienen ordenados desc, el primero por hoyo es el vigente.
    if (!latest.has(r.hole_number)) latest.set(r.hole_number, r);
  }
  return latest;
}

/** Posición VIGENTE de un solo hoyo (o null si no hay vigente → centro). */
export async function loadLatestFlagForHole(
  admin: SupabaseClient,
  courseId: string,
  hole: number
): Promise<FlagPositionRow | null> {
  const today = todayMexicoDate();
  const base = admin
    .from("course_hole_flag_positions")
    .select(FLAG_COLUMNS)
    .eq("course_id", courseId)
    .eq("hole_number", hole);
  const { data, error } = await applyValidityFilter(base, today)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FlagPositionRow | null) ?? null;
}

// ── Sesión activa de captura (Telegram) ──────────────────────────────────────

export interface FlagSession {
  telegram_user_id: string;
  course_id: string;
  hole_number: number;
  effective_date: string;
  valid_until: string | null;
}

export async function setFlagSession(
  admin: SupabaseClient,
  args: {
    telegramUserId: string;
    courseId: string;
    hole: number;
    effectiveDate?: string | null;
    validUntil?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from("telegram_flag_sessions").upsert(
    {
      telegram_user_id: args.telegramUserId,
      course_id: args.courseId,
      hole_number: args.hole,
      effective_date: args.effectiveDate || todayMexicoDate(),
      valid_until: args.validUntil ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
  if (error) throw new Error(error.message);
}

export async function getFlagSession(
  admin: SupabaseClient,
  telegramUserId: string
): Promise<FlagSession | null> {
  const { data, error } = await admin
    .from("telegram_flag_sessions")
    .select("telegram_user_id, course_id, hole_number, effective_date, valid_until")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) {
    console.error("FLAG SESSION GET:", error);
    return null;
  }
  return (data as FlagSession | null) ?? null;
}

export async function clearFlagSession(
  admin: SupabaseClient,
  telegramUserId: string
): Promise<void> {
  await admin
    .from("telegram_flag_sessions")
    .delete()
    .eq("telegram_user_id", telegramUserId);
}

// ── Autorización del encargado de banderas ───────────────────────────────────

export interface FlagKeeper {
  profileId: string;
  name: string;
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "encargado";
}

/**
 * Resuelve un telegram_user_id a un perfil con rol flag_keeper activo.
 *
 * Política: solo capturan banderas los usuarios a quienes el admin les asignó
 * el rol "Encargado de banderas". El rol se puede dar a CUALQUIER usuario que
 * el admin elija (varios profesores, sin límite), pero es él quien lo habilita.
 * El bot guarda el chat_id en profiles.telegram_chat_id al vincular
 * (/soy_banderas email). En chat privado, chat_id === telegram_user_id.
 */
export async function resolveFlagKeeper(
  admin: SupabaseClient,
  telegramUserId: string
): Promise<FlagKeeper | null> {
  const tg = String(telegramUserId ?? "").trim();
  if (!tg) return null;

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, is_active")
    .eq("telegram_chat_id", tg)
    .maybeSingle();
  if (error) {
    console.error("FLAG KEEPER PROFILE LOOKUP:", error);
    return null;
  }
  if (!profile || (profile as { is_active?: boolean }).is_active === false) {
    return null;
  }

  const profileId = (profile as { id: string }).id;
  if (!(await profileHasFlagKeeperRole(admin, profileId))) return null;

  return {
    profileId,
    name: fullName(
      (profile as { first_name: string | null }).first_name,
      (profile as { last_name: string | null }).last_name
    ),
  };
}

/**
 * Auto-vincula al encargado por su @usuario de Telegram: si un perfil con rol
 * flag_keeper tiene ese telegram_username, le guarda el chat_id (su número) y
 * lo devuelve. Así basta escribir /BANDERAS sin teclear correos ni números.
 */
export async function autoLinkFlagKeeperByUsername(
  admin: SupabaseClient,
  telegramUserId: string,
  username: string | null | undefined
): Promise<FlagKeeper | null> {
  const uname = String(username ?? "").trim().replace(/^@/, "");
  const tg = String(telegramUserId ?? "").trim();
  if (!uname || !tg) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, is_active, telegram_username")
    .ilike("telegram_username", uname);
  if (error) {
    console.error("FLAG AUTOLINK LOOKUP:", error);
    return null;
  }

  for (const p of (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
  }>) {
    if (p.is_active === false) continue;
    if (!(await profileHasFlagKeeperRole(admin, p.id))) continue;
    const { error: upErr } = await admin
      .from("profiles")
      .update({ telegram_chat_id: tg })
      .eq("id", p.id);
    if (upErr) {
      console.error("FLAG AUTOLINK UPDATE:", upErr);
      continue;
    }
    return { profileId: p.id, name: fullName(p.first_name, p.last_name) };
  }
  return null;
}

/** True si el profile tiene el rol flag_keeper activo (global o de club). */
export async function profileHasFlagKeeperRole(
  admin: SupabaseClient,
  profileId: string
): Promise<boolean> {
  // Rol a nivel club (lo más común, igual que marshal).
  const clubRoles = await admin
    .from("user_club_roles")
    .select("roles:role_id(code), is_active")
    .eq("user_id", profileId)
    .eq("is_active", true);
  if (hasFlagRole(clubRoles.data)) return true;

  // Respaldo: rol global.
  const globalRoles = await admin
    .from("user_global_roles")
    .select("roles:role_id(code), is_active")
    .eq("user_id", profileId)
    .eq("is_active", true);
  return hasFlagRole(globalRoles.data);
}

function hasFlagRole(rows: unknown): boolean {
  return ((rows as Array<{ roles: unknown }> | null) ?? []).some((r) => {
    const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
    return (role as { code?: string } | null)?.code === "flag_keeper";
  });
}
