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

/** Fecha de hoy en horario de México (YYYY-MM-DD). */
function todayMx(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Extrae la ventana de vigencia del texto:
 *   "hasta 2026-07-03"  → esa fecha
 *   "por 3" / "por 3 dias" → hoy + 2 (3 días contando hoy)
 * Si no trae nada → null (vigente hasta la próxima captura).
 */
export function parseValidUntil(text: string | null | undefined): string | null {
  const t = (text || "").trim();

  const hasta = t.match(/hasta\s+(\d{4}-\d{2}-\d{2})/i);
  if (hasta) return hasta[1];

  const por = t.match(/por\s+(\d{1,2})\s*(?:d[ií]as?)?/i);
  if (por) {
    const days = Number(por[1]);
    if (Number.isInteger(days) && days >= 1 && days <= 60) {
      const base = new Date(`${todayMx()}T12:00:00`);
      base.setDate(base.getDate() + (days - 1));
      return base.toISOString().slice(0, 10);
    }
  }
  return null;
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
    const validUntil = parseValidUntil(text);
    await setFlagSession(admin, { telegramUserId: tg, courseId, hole, validUntil });
    const vigencia = validUntil
      ? `Vigencia: hasta el ${validUntil} (después vuelve al centro).`
      : "Vigencia: hasta la próxima captura.";
    return {
      text: [
        `🚩 Hoyo ${hole} listo, ${keeper.name}.`,
        "",
        "Párate JUNTO a la bandera y comparte tu ubicación:",
        "📎 (clip) → Ubicación → Enviar mi ubicación actual.",
        "",
        "La guardo como el pin del hoyo " + hole + " y avanzo sola al siguiente.",
        vigencia,
        "",
        "Para fijar vigencia: /BANDERA " + hole + " hasta 2026-07-03  ·  o  /BANDERA " + hole + " por 3",
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
