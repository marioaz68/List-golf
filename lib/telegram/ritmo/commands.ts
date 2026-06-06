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

function ritmoMapAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

/** URL del mapa en vivo en backoffice (requiere sesión del comité). */
export function buildRitmoMapUrl(tournamentId?: string | null): string {
  const base = `${ritmoMapAppUrl()}/ritmo`;
  if (tournamentId?.trim()) {
    return `${base}?tournament_id=${encodeURIComponent(tournamentId.trim())}`;
  }
  return base;
}

/** Mensaje + botón inline con el link al dashboard de ritmo. */
export function buildRitmoMapReply(tournamentId?: string | null): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const mapUrl = buildRitmoMapUrl(tournamentId);
  const lines = [
    "🗺️ Mapa de ritmo del campo (en vivo)",
    "",
    "Toca el botón para abrir el mapa. Cada grupo aparece con su número y color según ritmo:",
    "🟢 En ritmo · 🔵 Adelantado · 🔴 Lento (bloquea) · 🟡 Pegado al de adelante",
    "",
    "Se actualiza cuando caddies o jugadores comparten Live Location (hasta 8 h).",
  ];
  if (tournamentId) {
    lines.push("", "Abre con tu cuenta de comité en List.golf.");
  } else {
    lines.push(
      "",
      "Abre con tu cuenta de comité en List.golf y elige el torneo si hace falta."
    );
  }
  return {
    text: lines.join("\n"),
    buttons: [[{ text: "🗺️ Abrir mapa en vivo", url: mapUrl }]],
  };
}

/** MAPA con torneo del jugador/caddie vinculado, si hay ronda activa. */
export async function buildRitmoMapReplyForUser(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<{ text: string; buttons: { text: string; url: string }[][] }> {
  const resolution = await resolveRitmoContext(supabase, telegramUserId);
  const tournamentId =
    resolution.status === "ok" ? resolution.ctx.tournamentId : null;
  return buildRitmoMapReply(tournamentId);
}

/** Minutos sin pings para considerar que la Live Location del usuario expiró
 *  o se cerró el navegador / Telegram. Solo se le menciona si él escribe RITMO
 *  (acción iniciada por el usuario), nunca proactivamente. */
const STALE_USER_MINUTES = 15;

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
    actualStartISO: ctx.groupActualStart,
    teeStartHole: ctx.groupStartHole,
    roundDate: ctx.roundDate,
    perHoleMinutes,
  });

  // Buscar el último ping DEL USUARIO mismo (no del grupo) para detectar si
  // su Live Location se acabó / se cerró Telegram. Si lleva >15 min sin ping
  // propio mientras la ronda sigue activa, agregamos una línea sugiriendo
  // reactivar. Es respuesta a SU comando, no mensaje proactivo.
  let lastUserPingAgoMin: number | null = null;
  try {
    const { data: last } = await supabase
      .from("ritmo_positions")
      .select("ts")
      .eq("telegram_user_id", telegramUserId)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ts = (last as { ts?: string } | null)?.ts;
    if (ts) {
      const ms = Date.now() - new Date(ts).getTime();
      lastUserPingAgoMin = ms / 60000;
    }
  } catch {
    lastUserPingAgoMin = null;
  }

  const who = `${ctx.displayName}${ctx.kind === "caddie" ? " (caddie)" : ""}`;
  const lines = [
    `🏌️ ${who} · Grupo ${ctx.groupId.slice(0, 4)}`.trim(),
    `Tee: ${ctx.groupTeeTime ?? "-"} · Salida hoyo ${ctx.groupStartHole}`,
    "",
    pace.msg,
  ];

  if (lastUserPingAgoMin == null) {
    // Nunca ha mandado ubicación.
    lines.push(
      "",
      "(Comparte tu Live Location en este chat para que te detecte.)"
    );
  } else if (lastUserPingAgoMin > STALE_USER_MINUTES) {
    // Mandó alguna vez, pero ya no está llegando — Live Location expiró,
    // se cerró Telegram, o el celular perdió señal.
    const mins = Math.round(lastUserPingAgoMin);
    lines.push(
      "",
      `(Tu última ubicación fue hace ${mins} min. Si sigues en el campo, reactiva tu Live Location 8 h para que el ritmo se vea en vivo.)`
    );
  }

  return lines.join("\n");
}
