import type { SupabaseClient } from "@supabase/supabase-js";

export async function findPendingKitEntry(
  supabase: SupabaseClient,
  playerId: string
) {
  return supabase
    .from("tournament_entries")
    .select(
      "id, tournament_id, telegram_kit_sent_at, telegram_kit_received_at, telegram_kit_partial_received_at, telegram_kit_pending_items"
    )
    .eq("player_id", playerId)
    .not("telegram_kit_sent_at", "is", null)
    .is("telegram_kit_received_at", null)
    .order("telegram_kit_sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function confirmKitPartialForPlayer(
  supabase: SupabaseClient,
  playerId: string,
  chatId: string
) {
  const now = new Date().toISOString();
  const { data: pending, error: findErr } = await findPendingKitEntry(
    supabase,
    playerId
  );

  if (findErr) {
    console.error("TELEGRAM KIT PARTIAL LOOKUP:", findErr);
    return { ok: false as const, message: "Error registrando confirmación parcial." };
  }

  if (!pending?.id) {
    return {
      ok: false as const,
      message:
        "No hay un kit pendiente. Si el comité no te lo envió, avísales.",
    };
  }

  const { error: upErr } = await supabase
    .from("tournament_entries")
    .update({ telegram_kit_partial_received_at: now })
    .eq("id", pending.id);

  if (upErr) {
    console.error("TELEGRAM KIT PARTIAL UPDATE:", upErr);
    return { ok: false as const, message: "No se pudo guardar la confirmación parcial." };
  }

  await supabase
    .from("players")
    .update({ telegram_chat_id: chatId })
    .eq("id", playerId)
    .is("telegram_chat_id", null);

  const pendingItems = String(pending.telegram_kit_pending_items ?? "").trim();
  const extra = pendingItems
    ? `\n\nRecuerda: aún te debe el comité:\n${pendingItems}\n\nCuando lo tengas todo, escribe RECIBIDO.`
    : "\n\nCuando tengas todo el material, escribe RECIBIDO.";

  return {
    ok: true as const,
    message:
      `Gracias. Quedó registrada recepción PARCIAL del kit.${extra}\n\nYa puedes escribir GRUPO o INICIO para ver tu salida y captura.`,
  };
}

export async function confirmKitCompleteForPlayer(
  supabase: SupabaseClient,
  playerId: string,
  chatId: string
) {
  const now = new Date().toISOString();
  const { data: pending, error: findErr } = await findPendingKitEntry(
    supabase,
    playerId
  );

  if (findErr) {
    console.error("TELEGRAM KIT RECEIVED LOOKUP:", findErr);
    return { ok: false as const, message: "Error registrando confirmación." };
  }

  if (!pending?.id) {
    const { data: already } = await supabase
      .from("tournament_entries")
      .select("id, telegram_kit_received_at")
      .eq("player_id", playerId)
      .not("telegram_kit_received_at", "is", null)
      .order("telegram_kit_received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (already?.id) {
      return {
        ok: true as const,
        message:
          "Ya tenías el kit registrado como recibido. Escribe GRUPO o INICIO para tu salida.",
      };
    }

    return {
      ok: false as const,
      message:
        "No hay un kit pendiente de confirmar. Si el comité aún no te lo envió, avísales.",
    };
  }

  const { error: upErr } = await supabase
    .from("tournament_entries")
    .update({
      telegram_kit_received_at: now,
      telegram_kit_pending_items: null,
    })
    .eq("id", pending.id);

  if (upErr) {
    console.error("TELEGRAM KIT RECEIVED UPDATE:", upErr);
    return { ok: false as const, message: "No se pudo guardar la confirmación." };
  }

  await supabase
    .from("players")
    .update({ telegram_chat_id: chatId })
    .eq("id", playerId)
    .is("telegram_chat_id", null);

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", pending.tournament_id)
    .maybeSingle();

  const tournamentName = tournament?.name?.trim() || "el torneo";

  return {
    ok: true as const,
    message:
      `Gracias. Quedó registrado que recibiste el kit completo del torneo «${tournamentName}».\n\nEscribe GRUPO o INICIO para ver tu grupo, horario y enlace de captura.`,
  };
}
