/**
 * Módulo Telegram "Banderas": el encargado registra dónde quedó la bandera
 * (pin) en cada green.
 *
 * Flujo principal (GPS en vivo):
 *   1. El encargado escribe  /BANDERA 7   (o toca el botón del menú).
 *      → se abre una "sesión" en el hoyo 7.
 *   2. Comparte su ubicación (Live Location o ubicación puntual) parado junto
 *      a la bandera → se guarda como pin del hoyo 7 y la sesión avanza al 8.
 *
 * Respaldo (ajuste en mapa): botón que abre la mini app satélite para
 * arrastrar el pin al punto exacto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramAppUrl } from "@/lib/telegram/appUrl";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import {
  loadLatestFlags,
  resolveFlagKeeper,
  setFlagSession,
} from "@/lib/flags/flagStore";

const BANDERA_COMMANDS = new Set([
  "BANDERA", "/BANDERA", "BANDERAS", "/BANDERAS",
  "PIN", "/PIN", "PINS", "/PINS",
  "FLAG", "/FLAG", "FLAGS", "/FLAGS",
]);

export function isBanderaCommand(command: string): boolean {
  return BANDERA_COMMANDS.has(command.trim().toUpperCase());
}

export function isSoyBanderasCommand(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  return /^\/?soy_?banderas(\s|$)/i.test(t) || /^\/?soy_?flag(\s|$)/i.test(t);
}

/** Extrae el número de hoyo (1-18) del texto del comando, si lo trae. */
export function parseHoleArg(text: string | null | undefined): number | null {
  const m = (text || "").trim().match(/(?:^|\s)(\d{1,2})(?:\s|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
}

function mapButtonUrl(tg: string, hole: number | null): string {
  const base = `${telegramAppUrl()}/captura/banderas?tg=${encodeURIComponent(tg)}`;
  return hole ? `${base}&hole=${hole}` : base;
}

export interface BanderaReply {
  text: string;
  buttons?: { text: string; url: string }[][];
}

/**
 * Construye la respuesta al comando BANDERA(S). Si trae hoyo, abre sesión en
 * ese hoyo y pide compartir ubicación. Si no, muestra el menú con estado y
 * el botón para abrir el mapa.
 */
export async function buildBanderaReply(
  admin: SupabaseClient,
  telegramUserId: string,
  text: string | null | undefined,
  courseId: string = CCQ_COURSE_ID
): Promise<BanderaReply> {
  const tg = String(telegramUserId ?? "").trim();

  const keeper = await resolveFlagKeeper(admin, tg);
  if (!keeper) {
    return {
      text: [
        "🚩 Banderas — acceso restringido",
        "",
        "Este módulo es solo para el encargado de banderas.",
        "Si te toca cargar las banderas, vincúlate primero:",
        "",
        "/soy_banderas tu_email@dominio.com",
        "",
        "Usa el mismo email con el que el comité te dio de alta.",
      ].join("\n"),
    };
  }

  const hole = parseHoleArg(text);

  if (hole) {
    await setFlagSession(admin, { telegramUserId: tg, courseId, hole });
    return {
      text: [
        `🚩 Hoyo ${hole} listo, ${keeper.name}.`,
        "",
        "Párate JUNTO a la bandera y comparte tu ubicación:",
        "📎 (clip) → Ubicación → Enviar mi ubicación actual.",
        "",
        "La guardo como el pin del hoyo " + hole + " y avanzo sola al siguiente.",
        "¿No te gusta cómo quedó? Toca el botón para ajustarla en el mapa.",
      ].join("\n"),
      buttons: [[{ text: `🗺️ Ajustar hoyo ${hole} en el mapa`, url: mapButtonUrl(tg, hole) }]],
    };
  }

  // Menú con estado: cuántos hoyos ya tienen bandera vigente.
  let savedCount = 0;
  try {
    const latest = await loadLatestFlags(admin, courseId);
    savedCount = latest.size;
  } catch (e) {
    console.error("BANDERAS LOAD STATUS:", e);
  }

  return {
    text: [
      `🚩 Banderas — hola ${keeper.name}.`,
      "",
      `Hoyos con bandera registrada: ${savedCount}/18.`,
      "",
      "Para registrar un green por GPS:",
      "1) Escribe el hoyo, p. ej.  /BANDERA 1",
      "2) Párate junto a la bandera y comparte tu ubicación.",
      "",
      "O abre el mapa satélite y arrastra el pin de cada hoyo.",
    ].join("\n"),
    buttons: [[{ text: "🗺️ Abrir mapa de banderas", url: mapButtonUrl(tg, null) }]],
  };
}
