import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreActor, ScoreActorRole } from "./saveGroupHoleScore";

function normalizeUuid(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // UUID v4 básico
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  return null;
}

/**
 * Resuelve quién hace la captura (jugador / caddie / admin) leyendo:
 *  - request body (`me_entry_id`, `caddie_id`, `actor_user_id`, `role`, `source`)
 *  - URL del referer (params `?me=` / `?caddie=`)
 *  - sesión backoffice (si hay user autenticado)
 *
 * Devuelve `null` cuando no se puede identificar — la bitácora aún se
 * registrará pero como anónima (rol=null).
 */
export async function resolveScoreActor(
  admin: SupabaseClient,
  args: {
    body: Record<string, unknown>;
    referer: string | null;
    /** Usuario autenticado en /score-entry/* — opcional. */
    sessionUserId: string | null;
  }
): Promise<ScoreActor> {
  const { body, referer, sessionUserId } = args;

  // 1. IDs explícitos en el body tienen prioridad
  let meEntryId =
    normalizeUuid(body.me_entry_id) ?? normalizeUuid(body.actor_entry_id);
  let caddieId =
    normalizeUuid(body.caddie_id) ?? normalizeUuid(body.actor_caddie_id);
  let userId = normalizeUuid(body.actor_user_id) ?? sessionUserId;

  // 2. Si no hay nada explícito, intentar leerlo del referer (URL del
  //    cliente que dispara el guardado). /captura/tarjeta?me=…&caddie=… es
  //    el flujo normal.
  if (!meEntryId && !caddieId && referer) {
    try {
      const url = new URL(referer);
      const fromMe = normalizeUuid(url.searchParams.get("me"));
      const fromCaddie = normalizeUuid(url.searchParams.get("caddie"));
      if (fromMe) meEntryId = fromMe;
      if (fromCaddie) caddieId = fromCaddie;
    } catch {
      // referer inválido: ignoramos
    }
  }

  const rawRole = String(body.role ?? "").trim().toLowerCase();
  let role: ScoreActorRole | null =
    rawRole === "player" ||
    rawRole === "caddie" ||
    rawRole === "witness" ||
    rawRole === "admin" ||
    rawRole === "system"
      ? (rawRole as ScoreActorRole)
      : null;

  // 3. Inferir rol cuando no vino explícito
  if (!role) {
    if (caddieId) role = "caddie";
    else if (meEntryId) role = "player";
    else if (userId) role = "admin";
  }

  // 4. Resolver label legible
  let label: string | null = null;
  if (meEntryId) {
    const { data } = await admin
      .from("tournament_entries")
      .select(`id, players ( first_name, last_name )`)
      .eq("id", meEntryId)
      .maybeSingle();
    const p = data?.players as
      | { first_name: string | null; last_name: string | null }
      | { first_name: string | null; last_name: string | null }[]
      | null;
    const player = Array.isArray(p) ? p[0] : p;
    if (player) {
      label =
        [player.first_name, player.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;
    }
  } else if (caddieId) {
    const { data: c } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .eq("id", caddieId)
      .maybeSingle();
    if (c) {
      label =
        [
          (c as { first_name: string | null }).first_name,
          (c as { last_name: string | null }).last_name,
        ]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;
    }
  } else if (userId) {
    label = "Admin";
  }

  // 5. Source
  let source = String(body.source ?? "").trim();
  if (!source) {
    if (referer && /\/captura\//.test(referer)) {
      source = caddieId
        ? "telegram_caddie"
        : role === "witness"
          ? "telegram_witness"
          : "telegram_player";
    } else if (referer && /\/score-entry/.test(referer)) {
      source = "backoffice";
    } else {
      source = "unknown";
    }
  }

  return {
    role,
    entryId: meEntryId,
    caddieId,
    userId,
    label,
    source,
  };
}
