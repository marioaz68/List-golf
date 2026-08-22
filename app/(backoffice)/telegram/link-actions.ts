"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { createTelegramLinkToken } from "@/lib/telegram/linkToken";

export type GenerateDeepLinkResult =
  | { ok: true; deepLink: string; expiresAt: string }
  | { ok: false; error: string };

async function requireStaff(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  return { ok: true };
}

export async function generatePlayerTelegramDeepLink(
  playerId: string
): Promise<GenerateDeepLinkResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const id = String(playerId ?? "").trim();
  if (!id) return { ok: false, error: "Falta player_id." };

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!player) return { ok: false, error: "Jugador no encontrado." };

  return createTelegramLinkToken(admin, { kind: "player", playerId: id });
}

export async function generateCaddieTelegramDeepLink(
  caddieId: string
): Promise<GenerateDeepLinkResult> {
  const auth = await requireStaff();
  if (!auth.ok) return auth;

  const id = String(caddieId ?? "").trim();
  if (!id) return { ok: false, error: "Falta caddie_id." };

  const admin = createAdminClient();
  const { data: caddie } = await admin
    .from("caddies")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!caddie) return { ok: false, error: "Caddie no encontrado." };

  return createTelegramLinkToken(admin, { kind: "caddie", caddieId: id });
}

export async function generateTelegramDeepLink(params: {
  kind: "player" | "caddie";
  id: string;
}): Promise<GenerateDeepLinkResult> {
  if (params.kind === "caddie") {
    return generateCaddieTelegramDeepLink(params.id);
  }
  return generatePlayerTelegramDeepLink(params.id);
}
