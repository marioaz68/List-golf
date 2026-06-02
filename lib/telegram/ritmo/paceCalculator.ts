import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_POR_HOYO = 13.5;          // ajustable: 4h3m total para 18 hoyos
const UMBRAL_ATRASO_MIN = 8;        // > 8 min atrasado = ⚠️
const UMBRAL_ADELANTO_MIN = 5;      // < -5 min adelantado = 🟢

export type PaceStatus =
  | { kind: "sin_datos"; msg: string }
  | { kind: "ok"; msg: string; hoyo: number | null }
  | { kind: "en_ritmo" | "adelantado" | "atrasado";
      msg: string;
      hoyo: number;
      deltaMinutes: number;
      hoyosJugados: number;
      minutosTranscurridos: number };

interface ComputePaceArgs {
  hoyoActual: number | null;
  teeTimeISO: string | null;     // HH:MM:SS o ISO
  teeStartHole: number;          // 1 o 10 (shotgun)
  roundDate: string | null;      // YYYY-MM-DD
  timezone?: string;
  now?: Date;
}

export function computePace(args: ComputePaceArgs): PaceStatus {
  const { hoyoActual, teeTimeISO, teeStartHole, roundDate } = args;
  const now = args.now ?? new Date();

  if (hoyoActual == null) {
    return { kind: "sin_datos", msg: "Sin detectar hoyo todavía." };
  }
  if (!teeTimeISO || !roundDate) {
    return { kind: "ok", hoyo: hoyoActual, msg: `📍 Hoyo ${hoyoActual}` };
  }

  const teeDate = parseTeeDateTime(roundDate, teeTimeISO);
  if (!teeDate) {
    return { kind: "ok", hoyo: hoyoActual, msg: `📍 Hoyo ${hoyoActual}` };
  }

  const minutosTranscurridos = (now.getTime() - teeDate.getTime()) / 60000;
  if (minutosTranscurridos < 0) {
    return {
      kind: "ok",
      hoyo: hoyoActual,
      msg: `📍 Hoyo ${hoyoActual} · faltan ${Math.abs(Math.round(minutosTranscurridos))} min para tu salida`,
    };
  }

  // Hoyos jugados desde el tee de inicio (1 o 10), wrap a 18
  let hoyosJugados = (hoyoActual - teeStartHole + 18) % 18;
  if (hoyosJugados === 0 && hoyoActual !== teeStartHole) hoyosJugados = 18;

  const minutosEsperados = hoyosJugados * MIN_POR_HOYO;
  const delta = minutosTranscurridos - minutosEsperados; // positivo = atrasado

  if (delta > UMBRAL_ATRASO_MIN) {
    return {
      kind: "atrasado", hoyo: hoyoActual, deltaMinutes: delta,
      hoyosJugados, minutosTranscurridos,
      msg: `⚠️ Atrasado ~${Math.round(delta)} min vs ritmo esperado (hoyo ${hoyoActual})`,
    };
  }
  if (delta < -UMBRAL_ADELANTO_MIN) {
    return {
      kind: "adelantado", hoyo: hoyoActual, deltaMinutes: delta,
      hoyosJugados, minutosTranscurridos,
      msg: `🟢 Adelantado ~${Math.round(-delta)} min (hoyo ${hoyoActual})`,
    };
  }
  return {
    kind: "en_ritmo", hoyo: hoyoActual, deltaMinutes: delta,
    hoyosJugados, minutosTranscurridos,
    msg: `✅ En ritmo (±${Math.abs(Math.round(delta))} min · hoyo ${hoyoActual})`,
  };
}

function parseTeeDateTime(roundDate: string, teeTime: string): Date | null {
  const time = teeTime.includes("T") ? teeTime.split("T")[1]?.slice(0, 8) : teeTime;
  if (!time) return null;
  const iso = `${roundDate}T${time.length === 5 ? `${time}:00` : time}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Hoyo "oficial" del grupo: la moda de los últimos N puntos detectados.
 *  Filtra falsos positivos de zonas con traslape entre hoyos paralelos. */
export async function smoothedHoleForGroup(
  supabase: SupabaseClient,
  groupId: string,
  lookback = 10
): Promise<number | null> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ritmo_positions")
    .select("hoyo_detectado")
    .eq("group_id", groupId)
    .gte("ts", cutoff)
    .order("ts", { ascending: false })
    .limit(lookback);
  if (error || !data) return null;
  const counts = new Map<number, number>();
  for (const r of data) {
    const h = r.hoyo_detectado;
    if (h == null) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: number | null = null, bestN = 0;
  for (const [h, n] of counts) if (n > bestN) { best = h; bestN = n; }
  return best;
}
