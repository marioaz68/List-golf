import type { SupabaseClient } from "@supabase/supabase-js";

// Fallback cuando un campo no tiene minutos por hoyo configurados en la tabla
// course_holes.pace_minutes. 16 min × 18 = 288 min = 4:48 (ritmo de torneo).
const MIN_POR_HOYO = 16;
const UMBRAL_ATRASO_MIN = 8;        // > 8 min atrasado = ⚠️
const UMBRAL_ADELANTO_MIN = 5;      // < -5 min adelantado = 🟢

/** Minutos objetivo por número de hoyo (1..18). Viene de course_holes. */
export type PerHoleMinutes = Record<number, number>;

/** Suma de minutos esperados para `hoyosJugados` hoyos empezando en `teeStartHole`,
 *  usando los tiempos por hoyo del campo (con wrap 1..18). Si falta el dato de
 *  algún hoyo, usa `fallback`. */
export function expectedMinutesForHolesPlayed(
  hoyosJugados: number,
  teeStartHole: number,
  perHole: PerHoleMinutes | null | undefined,
  fallback = MIN_POR_HOYO
): number {
  let total = 0;
  for (let i = 0; i < hoyosJugados; i++) {
    const hole = ((teeStartHole - 1 + i) % 18) + 1;
    const m = perHole?.[hole];
    total += typeof m === "number" && Number.isFinite(m) ? m : fallback;
  }
  return total;
}

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
  /** Minutos objetivo por hoyo (course_holes.pace_minutes). Si falta, usa el
   *  fallback plano de 16 min/hoyo. */
  perHoleMinutes?: PerHoleMinutes | null;
}

export function computePace(args: ComputePaceArgs): PaceStatus {
  const { hoyoActual, teeTimeISO, teeStartHole, roundDate, perHoleMinutes } = args;
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

  const minutosEsperados = expectedMinutesForHolesPlayed(
    hoyosJugados,
    teeStartHole,
    perHoleMinutes
  );
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

/** Carga los minutos objetivo por hoyo de un campo (course_holes.pace_minutes).
 *  Devuelve un mapa { hole_number: minutos } solo con los hoyos que tengan
 *  valor configurado. Si el campo no tiene datos, devuelve {}. */
export async function loadPerHoleMinutes(
  supabase: SupabaseClient,
  courseId: string | null | undefined
): Promise<PerHoleMinutes> {
  const out: PerHoleMinutes = {};
  if (!courseId) return out;
  const { data, error } = await supabase
    .from("course_holes")
    .select("hole_number, pace_minutes")
    .eq("course_id", courseId);
  if (error || !data) return out;
  for (const r of data as { hole_number: number; pace_minutes: number | null }[]) {
    if (r.pace_minutes == null) continue;
    const m = Number(r.pace_minutes);
    if (Number.isFinite(m) && m > 0) out[Number(r.hole_number)] = m;
  }
  return out;
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
