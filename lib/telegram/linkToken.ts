import type { SupabaseClient } from "@supabase/supabase-js";
import { getTelegramBotUrl } from "@/lib/telegram/sendMessage";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 días
const TOKEN_BYTES = 16; // 32 hex chars

export type TelegramLinkSubject =
  | { kind: "player"; playerId: string }
  | { kind: "caddie"; caddieId: string };

export type TelegramLinkStatus = "linked" | "unlinked" | "invalid";

export type CreateLinkTokenResult =
  | { ok: true; token: string; deepLink: string; expiresAt: string }
  | { ok: false; error: string };

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL t.me/<bot>?start=<token>. Null si falta NEXT_PUBLIC_TELEGRAM_BOT_USERNAME. */
export function buildTelegramDeepLink(token: string): string | null {
  const base = getTelegramBotUrl();
  if (!base) return null;
  const t = String(token ?? "").trim();
  if (!t) return null;
  return `${base}?start=${encodeURIComponent(t)}`;
}

/**
 * Crea (o regenera) un token one-time para vincular jugador o caddie.
 * Invalida tokens activos previos del mismo sujeto.
 */
export async function createTelegramLinkToken(
  admin: SupabaseClient,
  subject: TelegramLinkSubject,
  opts?: { createdBy?: string | null; ttlMs?: number }
): Promise<CreateLinkTokenResult> {
  const botUrl = getTelegramBotUrl();
  if (!botUrl) {
    return {
      ok: false,
      error: "Falta NEXT_PUBLIC_TELEGRAM_BOT_USERNAME en el servidor.",
    };
  }

  const playerId =
    subject.kind === "player" ? String(subject.playerId).trim() : null;
  const caddieId =
    subject.kind === "caddie" ? String(subject.caddieId).trim() : null;
  if (!playerId && !caddieId) {
    return { ok: false, error: "Falta player_id o caddie_id." };
  }

  const now = Date.now();
  const expiresAt = new Date(now + (opts?.ttlMs ?? TOKEN_TTL_MS)).toISOString();

  // Invalidar tokens activos previos del mismo sujeto.
  try {
    let q = admin
      .from("telegram_link_tokens")
      .update({ consumed_at: new Date(now).toISOString() })
      .is("consumed_at", null);
    if (playerId) q = q.eq("player_id", playerId);
    if (caddieId) q = q.eq("caddie_id", caddieId);
    await q;
  } catch {
    /* best-effort */
  }

  let token = randomToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await admin.from("telegram_link_tokens").insert({
      token,
      player_id: playerId,
      caddie_id: caddieId,
      expires_at: expiresAt,
      created_by: opts?.createdBy ?? null,
    });
    if (!error) {
      const deepLink = buildTelegramDeepLink(token);
      if (!deepLink) {
        return { ok: false, error: "No se pudo armar el deep link." };
      }
      return { ok: true, token, deepLink, expiresAt };
    }
    // Colisión improbable de token único activo.
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
      token = randomToken();
      continue;
    }
    return { ok: false, error: error.message };
  }

  return { ok: false, error: "No se pudo generar un token único." };
}

export type RedeemLinkTokenResult =
  | {
      ok: true;
      kind: "player" | "caddie";
      id: string;
      displayName: string;
    }
  | { ok: false; error: string };

/**
 * Consume el token de /start, guarda chat_id real (sobrescribe) y limpia flags de inválido.
 */
export async function redeemTelegramLinkToken(
  admin: SupabaseClient,
  params: {
    token: string;
    telegramUserId: string;
    telegramChatId: string;
    username?: string | null;
  }
): Promise<RedeemLinkTokenResult> {
  const token = String(params.token ?? "").trim();
  const userId = String(params.telegramUserId ?? "").trim();
  const chatId = String(params.telegramChatId ?? "").trim() || userId;

  if (!token || !userId) {
    return { ok: false, error: "Token o user_id vacío." };
  }

  const { data: row, error } = await admin
    .from("telegram_link_tokens")
    .select("id, player_id, caddie_id, expires_at, consumed_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!row) {
    return { ok: false, error: "Este enlace no es válido o ya expiró." };
  }
  if (row.consumed_at) {
    return { ok: false, error: "Este enlace ya se usó. Pide uno nuevo al comité." };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await admin
      .from("telegram_link_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: false, error: "Este enlace expiró. Pide uno nuevo al comité." };
  }

  const playerId = row.player_id ? String(row.player_id) : null;
  const caddieId = row.caddie_id ? String(row.caddie_id) : null;

  if (playerId) {
    const patch: Record<string, unknown> = {
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      telegram_chat_invalid_at: null,
      telegram_chat_invalid_reason: null,
    };
    if (params.username?.trim()) {
      patch.telegram_username = params.username.trim().replace(/^@/, "");
    }

    const { data: player, error: upErr } = await admin
      .from("players")
      .update(patch)
      .eq("id", playerId)
      .select("id, first_name, last_name")
      .maybeSingle();

    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    await admin
      .from("telegram_link_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    await admin
      .from("telegram_pending_links")
      .delete()
      .eq("telegram_user_id", userId);

    const name =
      [player?.first_name, player?.last_name]
        .map((p) => String(p ?? "").trim())
        .filter(Boolean)
        .join(" ") || "jugador";

    return { ok: true, kind: "player", id: playerId, displayName: name };
  }

  if (caddieId) {
    const patch: Record<string, unknown> = {
      telegram_user_id: userId,
      telegram_chat_id: chatId,
      // Legacy: notify diario / ritmo aún leen `telegram` en algunos paths.
      telegram: userId,
      telegram_chat_invalid_at: null,
      telegram_chat_invalid_reason: null,
    };
    if (params.username?.trim()) {
      patch.telegram_username = params.username.trim().replace(/^@/, "");
    }

    const { data: caddie, error: upErr } = await admin
      .from("caddies")
      .update(patch)
      .eq("id", caddieId)
      .select("id, first_name, last_name")
      .maybeSingle();

    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    await admin
      .from("telegram_link_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    await admin
      .from("telegram_pending_links")
      .delete()
      .eq("telegram_user_id", userId);

    const name =
      [caddie?.first_name, caddie?.last_name]
        .map((p) => String(p ?? "").trim())
        .filter(Boolean)
        .join(" ") || "caddie";

    return { ok: true, kind: "caddie", id: caddieId, displayName: name };
  }

  return { ok: false, error: "Token sin sujeto (jugador/caddie)." };
}

/** Clasifica estado de Telegram para tableros de salidas. */
export function classifyTelegramLinkStatus(row: {
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
  /** Legacy caddie column. */
  telegram?: string | null;
  telegram_chat_invalid_at?: string | null;
}): TelegramLinkStatus {
  if (row.telegram_chat_invalid_at) return "invalid";
  const chat = String(row.telegram_chat_id ?? "").trim();
  const uid = String(
    row.telegram_user_id ?? row.telegram ?? ""
  ).trim();
  if (/^\d+$/.test(chat) || /^\d+$/.test(uid)) return "linked";
  return "unlinked";
}

export function telegramStatusLabel(status: TelegramLinkStatus): string {
  switch (status) {
    case "linked":
      return "Vinculado";
    case "invalid":
      return "Chat inválido";
    default:
      return "Sin vincular";
  }
}
