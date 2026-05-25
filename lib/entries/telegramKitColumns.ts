/** Supabase/Postgres cuando faltan columnas del kit en tournament_entries */
export function isMissingTelegramKitColumnsError(error: {
  message?: string;
  code?: string;
} | null) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    msg.includes("telegram_kit_sent_at") ||
    msg.includes("telegram_kit_received_at") ||
    (msg.includes("column") && msg.includes("telegram_kit"))
  );
}

export const ENTRY_SELECT_WITHOUT_KIT = `
  id,
  player_id,
  player_number,
  handicap_index,
  course_handicap,
  playing_handicap,
  playing_handicap_override,
  playing_handicap_override_reason,
  status,
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

export const ENTRY_SELECT_WITH_KIT = `
  id,
  player_id,
  player_number,
  handicap_index,
  status,
  telegram_kit_sent_at,
  telegram_kit_received_at,
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
