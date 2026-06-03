import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePace,
  loadPerHoleMinutes,
  smoothedHoleForGroup,
} from "./paceCalculator";
import { resolveRitmoContext } from "./handleLocationUpdate";

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
  const resolution = await resolveRitmoContext(supabase, telegramUserId);
  if (resolution.status === "not_linked") {
    return "No estás vinculado en List.golf como jugador ni caddie.";
  }
  if (resolution.status === "no_active") {
    return "No tienes torneo/ronda activa asignada en este momento.";
  }

  const ctx = resolution.ctx;
  if (!ctx.groupId) {
    return "No tienes grupo asignado en esta ronda todavía.";
  }

  const hoyo = await smoothedHoleForGroup(supabase, ctx.groupId);
  const perHoleMinutes = await loadPerHoleMinutes(supabase, ctx.courseId);
  const pace = computePace({
    hoyoActual: hoyo,
    teeTimeISO: ctx.groupTeeTime,
    teeStartHole: ctx.groupStartHole,
    roundDate: ctx.roundDate,
    perHoleMinutes,
  });

  const who = `${ctx.displayName}${ctx.kind === "caddie" ? " (caddie)" : ""}`;
  const lines = [
    `🏌️ ${who} · Grupo ${ctx.groupId.slice(0, 4)}`.trim(),
    `Tee: ${ctx.groupTeeTime ?? "-"} · Salida hoyo ${ctx.groupStartHole}`,
    "",
    pace.msg,
  ];
  if (hoyo == null) {
    lines.push("", "(Comparte tu Live Location en este chat para que te detecte.)");
  }
  return lines.join("\n");
}
