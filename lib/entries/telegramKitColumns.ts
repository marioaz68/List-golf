/** Supabase/Postgres cuando faltan columnas del kit en tournament_entries */
export function isMissingTelegramKitColumnsError(error: {
  message?: string;
  code?: string;
} | null) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("telegram_kit_sent_at") ||
    msg.includes("telegram_kit_received_at") ||
    (msg.includes("column") && msg.includes("telegram_kit"))
  );
}

/** Supabase/Postgres cuando faltan las columnas flagged_* del comité */
export function isMissingCommitteeFlagColumnsError(error: {
  message?: string;
  code?: string;
} | null) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("flagged_for_committee") ||
    msg.includes("flagged_committee_reason") ||
    msg.includes("flagged_committee_at") ||
    msg.includes("flagged_committee_by") ||
    (msg.includes("column") && msg.includes("flagged_"))
  );
}

/** Cualquier error de columna inexistente en Postgres (42703) */
export function isMissingColumnError(error: {
  message?: string;
  code?: string;
} | null) {
  if (!error) return false;
  return error.code === "42703";
}

const PLAYERS_FRAGMENT = `
  players:players (
    id,
    first_name,
    last_name,
    gender,
    handicap_index,
    handicap_torneo,
    phone,
    email,
    club,
    club_id,
    initials,
    ghin_number,
    shirt_size,
    shoe_size,
    birth_year,
    telegram_user_id,
    telegram_chat_id,
    clubs:clubs (
      name,
      short_name
    )
  ),
  categories:categories (
    id,
    code,
    name,
    max_players
  )
`;

const BASE_NO_KIT_NO_FLAG = `
  id,
  player_id,
  player_number,
  handicap_index,
  course_handicap,
  playing_handicap,
  playing_handicap_override,
  playing_handicap_override_reason,
  status,
`;

const BASE_NO_KIT_WITH_FLAG = `
  id,
  player_id,
  player_number,
  handicap_index,
  course_handicap,
  playing_handicap,
  playing_handicap_override,
  playing_handicap_override_reason,
  flagged_for_committee,
  flagged_committee_reason,
  status,
`;

const BASE_WITH_KIT_NO_FLAG = `
  id,
  player_id,
  player_number,
  handicap_index,
  status,
  telegram_kit_sent_at,
  telegram_kit_received_at,
`;

const BASE_WITH_KIT_WITH_FLAG = `
  id,
  player_id,
  player_number,
  handicap_index,
  flagged_for_committee,
  flagged_committee_reason,
  status,
  telegram_kit_sent_at,
  telegram_kit_received_at,
`;

/** Versión más completa: kit + flag (requiere ambas migraciones) */
export const ENTRY_SELECT_WITH_KIT = BASE_WITH_KIT_WITH_FLAG + PLAYERS_FRAGMENT;

/** Sin telegram_kit_*, pero con flagged_* */
export const ENTRY_SELECT_WITHOUT_KIT = BASE_NO_KIT_WITH_FLAG + PLAYERS_FRAGMENT;

/** Con kit, sin flagged_* (migración player_files pendiente) */
export const ENTRY_SELECT_WITH_KIT_NO_FLAG =
  BASE_WITH_KIT_NO_FLAG + PLAYERS_FRAGMENT;

/** Más conservadora: sin kit y sin flag */
export const ENTRY_SELECT_MINIMAL = BASE_NO_KIT_NO_FLAG + PLAYERS_FRAGMENT;
