import type { SupabaseClient } from "@supabase/supabase-js";
import { computePace, smoothedHoleForGroup } from "./paceCalculator";

const RITMO_COMMANDS = new Set(["RITMO", "/RITMO", "MI RITMO"]);

export function isRitmoStatusCommand(command: string): boolean {
  return RITMO_COMMANDS.has(command.trim().toUpperCase());
}

export async function buildRitmoStatusReply(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<string> {
  const { data: player } = await supabase
    .from("players")
    .select("id, first_name")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (!player) return "No estás vinculado como jugador.";

  const { data: entry } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!entry?.id) return "No tienes inscripción activa.";

  const { data: round } = await supabase
    .from("rounds")
    .select("id, round_date")
    .eq("tournament_id", entry.tournament_id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!round?.id) return "Aún no hay ronda activa.";

  const { data: gm } = await supabase
    .from("pairing_group_members")
    .select("group_id")
    .eq("entry_id", entry.id)
    .maybeSingle();
  if (!gm?.group_id) return "No tienes grupo asignado en esta ronda.";

  const { data: g } = await supabase
    .from("pairing_groups")
    .select("id, starting_hole, tee_time")
    .eq("id", gm.group_id)
    .maybeSingle();
  if (!g) return "Grupo no encontrado.";

  const hoyo = await smoothedHoleForGroup(supabase, g.id);
  const pace = computePace({
    hoyoActual: hoyo,
    teeTimeISO: g.tee_time,
    teeStartHole: g.starting_hole ?? 1,
    roundDate: round.round_date,
  });

  const lines = [
    `🏌️ ${player.first_name ?? ""} · Grupo ${g.id.slice(0, 4)}`.trim(),
    `Tee: ${g.tee_time ?? "-"} · Salida hoyo ${g.starting_hole ?? 1}`,
    "",
    pace.msg,
  ];
  if (hoyo == null) {
    lines.push("", "(Comparte tu Live Location en este chat para que te detecte.)");
  }
  return lines.join("\n");
}
