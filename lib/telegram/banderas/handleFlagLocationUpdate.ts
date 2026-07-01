import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramAppUrl } from "@/lib/telegram/appUrl";
import {
  getFlagSession,
  resolveFlagKeeper,
  saveFlagPosition,
  setFlagSession,
} from "@/lib/flags/flagStore";

export interface FlagLocationInput {
  telegramUserId: string;
  lat: number;
  lon: number;
  accuracy?: number | null;
  isLiveUpdate: boolean;
}

export interface FlagLocationResult {
  /** false = no era una captura de bandera; el webhook sigue con ritmo. */
  handled: boolean;
  reply?: string;
  buttons?: { text: string; url: string }[][];
  silent?: boolean;
}

/**
 * Si el remitente tiene una sesión de bandera abierta (escribió /BANDERA N),
 * su ubicación se guarda como el pin de ese hoyo y la sesión avanza al
 * siguiente. Si no hay sesión, devuelve handled:false para que el webhook lo
 * trate como ritmo de juego.
 */
export async function handleFlagLocationUpdate(
  admin: SupabaseClient,
  input: FlagLocationInput
): Promise<FlagLocationResult> {
  const { telegramUserId, lat, lon, isLiveUpdate } = input;

  const session = await getFlagSession(admin, telegramUserId);
  if (!session) return { handled: false };

  // Verificar que sigue siendo encargado de banderas.
  const keeper = await resolveFlagKeeper(admin, telegramUserId);
  if (!keeper) return { handled: false };

  try {
    await saveFlagPosition(admin, {
      courseId: session.course_id,
      hole: session.hole_number,
      lat,
      lon,
      source: "gps",
      effectiveDate: session.effective_date,
      validUntil: session.valid_until,
      chatId: telegramUserId,
      profileId: keeper.profileId,
      accuracyM: input.accuracy ?? null,
    });
  } catch (e) {
    console.error("FLAG SAVE POSITION:", e);
    return {
      handled: true,
      reply: "No pude guardar la posición de la bandera. Intenta de nuevo.",
    };
  }

  // Updates de Live Location (edited_message): solo refrescan la posición,
  // sin responder ni avanzar de hoyo.
  if (isLiveUpdate) return { handled: true, silent: true };

  const savedHole = session.hole_number;
  const nextHole = (savedHole % 18) + 1;
  await setFlagSession(admin, {
    telegramUserId,
    courseId: session.course_id,
    hole: nextHole,
    effectiveDate: session.effective_date,
    validUntil: session.valid_until,
  });

  const mapUrl = `${telegramAppUrl()}/captura/banderas?tg=${encodeURIComponent(
    telegramUserId
  )}&hole=${savedHole}`;

  return {
    handled: true,
    reply: [
      `✅ Bandera del hoyo ${savedHole} guardada.`,
      "",
      `Siguiente: hoyo ${nextHole}. Cuando llegues, párate junto a la bandera y comparte tu ubicación.`,
      "",
      `(Si quieres otro hoyo distinto, escribe /BANDERA y el número.)`,
    ].join("\n"),
    buttons: [[{ text: `🗺️ Ajustar hoyo ${savedHole} en el mapa`, url: mapUrl }]],
  };
}
