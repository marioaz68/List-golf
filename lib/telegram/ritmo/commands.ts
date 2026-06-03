import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePace,
  loadPerHoleMinutes,
  smoothedHoleForGroup,
} from "./paceCalculator";

const RITMO_COMMANDS = new Set(["RITMO", "/RITMO", "MI RITMO"]);
const RITMO_MAP_COMMANDS = new Set([
  "MAPA", "/MAPA", "RITMO_MAPA", "/RITMO_MAPA",
  "DASHBOARD", "/DASHBOARD", "MAP",
]);

export function isRitmoStatusCommand(command: string): boolean {
  return RITMO_COMMANDS.has(command.trim().toUpperCase());
}

export function isRitmoMapCommand(command: string): boolean {
  return RITMO_MAP_COMMANDS.has(command.trim().toUpperCase());
}

/** Mensaje + botón inline con el link al dashboard de ritmo. */
export function buildRitmoMapReply(): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
  const mapUrl = `${appUrl}/ritmo/demo`;
  return {
    text: [
      "🗺️ Mapa de Ritmo de Juego del CCQ",
      "",
      "Toca el botón para abrir el mapa en vivo. Vas a ver cada grupo marcado con su número y un color según su ritmo:",
      "🟢 En ritmo · 🔵 Adelantado · 🔴 Lento (bloquea) · 🟡 Pegado al de adelante",
      "",
      "El mapa se actualiza conforme los grupos comparten su Live Location.",
      "",
      "Funciona durante las 8 horas que cada jugador comparte su ubicación.",
    ].join("\n"),
    buttons: [[{ text: "🗺️ Abrir mapa en vivo", url: mapUrl }]],
  };
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
    .select("id, tournament_id, tournaments ( course_id )")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!entry?.id) return "No tienes inscripción activa.";

  const tRow = Array.isArray(entry.tournaments)
    ? entry.tournaments[0]
    : entry.tournaments;
  const courseId =
    (tRow as { course_id?: string | null } | null)?.course_id ?? null;

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
  const perHoleMinutes = await loadPerHoleMinutes(supabase, courseId);
  const pace = computePace({
    hoyoActual: hoyo,
    teeTimeISO: g.tee_time,
    teeStartHole: g.starting_hole ?? 1,
    roundDate: round.round_date,
    perHoleMinutes,
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
