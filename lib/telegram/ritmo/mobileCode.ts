/**
 * Generación del código one-time que el caddie/jugador usa para autenticar
 * la app nativa de List.Golf en su Android.
 *
 * Flujo:
 *  1. Caddie/jugador escribe `/codigo` al bot @ListGolfBot
 *  2. Bot identifica quién es (caddies.telegram o players.telegram_user_id)
 *  3. Bot genera código random de 6 dígitos válido 10 min
 *  4. Bot guarda fila en mobile_auth_codes y manda el código al chat
 *  5. Caddie mete el código en la app → /api/mobile/auth/redeem lo valida
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CODE_LIFETIME_MIN = 10;
const COMMANDS = new Set([
  "CODIGO",
  "/CODIGO",
  "CODE",
  "/CODE",
  "APP",
  "/APP",
]);

export function isMobileCodeCommand(command: string): boolean {
  return COMMANDS.has(command.trim().toUpperCase());
}

function generateCode(): string {
  // 6 dígitos, sin ceros a la izquierda problemáticos (siempre 6 chars).
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

interface SubjectInfo {
  caddieId: string | null;
  playerId: string | null;
  entryId: string | null;
  displayName: string | null;
}

async function findSubject(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<SubjectInfo | null> {
  // 1) ¿Jugador?
  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (player) {
    // Buscar entry activo más reciente para usar como entry_id si existe
    const { data: entry } = await supabase
      .from("tournament_entries")
      .select("id")
      .eq("player_id", (player as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = player as { id: string; first_name: string | null; last_name: string | null };
    return {
      caddieId: null,
      playerId: p.id,
      entryId: (entry as { id?: string } | null)?.id ?? null,
      displayName:
        [p.first_name, p.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null,
    };
  }

  // 2) ¿Caddie?
  const { data: caddie } = await supabase
    .from("caddies")
    .select("id, first_name, last_name")
    .eq("telegram", telegramUserId)
    .maybeSingle();

  if (caddie) {
    const c = caddie as { id: string; first_name: string | null; last_name: string | null };
    return {
      caddieId: c.id,
      playerId: null,
      entryId: null,
      displayName:
        [c.first_name, c.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null,
    };
  }

  return null;
}

/** Genera (o reusa) un código vigente para el usuario y devuelve el texto
 *  que el bot debe mandarle por Telegram. */
export async function buildMobileCodeReply(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<string> {
  const subject = await findSubject(supabase, telegramUserId);
  if (!subject) {
    return [
      "No estás vinculado en List.golf como jugador ni caddie.",
      "Pide al comité del club que te dé de alta antes de usar la app.",
    ].join("\n");
  }

  // Si hay código vigente sin consumir, reusarlo para no spammear.
  const { data: existing } = await supabase
    .from("mobile_auth_codes")
    .select("code, expires_at")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .or(
      [
        subject.caddieId ? `caddie_id.eq.${subject.caddieId}` : null,
        subject.playerId ? `player_id.eq.${subject.playerId}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let code: string;
  let expiresAt: string;
  if (existing) {
    code = (existing as { code: string }).code;
    expiresAt = (existing as { expires_at: string }).expires_at;
  } else {
    code = generateCode();
    expiresAt = new Date(Date.now() + CODE_LIFETIME_MIN * 60 * 1000).toISOString();
    const { error } = await supabase.from("mobile_auth_codes").insert({
      code,
      caddie_id: subject.caddieId,
      player_id: subject.playerId,
      entry_id: subject.entryId,
      display_name: subject.displayName,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("MOBILE CODE insert:", error);
      return "No pude generar el código. Intenta de nuevo en un momento.";
    }
  }

  const minsLeft = Math.max(
    1,
    Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)
  );

  return [
    "📱 Código para la app List.Golf:",
    "",
    `      ${code.split("").join(" ")}`,
    "",
    `Válido por ${minsLeft} min. Mételo en la pantalla de inicio de la app.`,
    "Si no tienes la app, descárgala desde Play Store: List.Golf",
  ].join("\n");
}
