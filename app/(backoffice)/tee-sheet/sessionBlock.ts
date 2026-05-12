/** Agrupa filas `rounds` por día/turno de juego (no por categoría). */

export type SessionRoundFields = {
  id: string;
  tournament_id: string;
  category_id?: string | null;
  round_no: number;
  round_date: string | null;
  start_type: string | null;
  start_time: string | null;
  interval_minutes?: number | null;
  wave?: string | null;
};

function normalizeTime(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return s;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/** Alinea variantes de tipo salida entre módulos (tee_time vs tee_times). */
export function normalizeStartTypeForSession(st: string | null | undefined) {
  const s = String(st ?? "").trim().toLowerCase();
  if (s === "tee_time" || s === "tee_times") return "tee_times";
  if (s === "shotgun") return "shotgun";
  return s;
}

export function sessionBlockKey(r: SessionRoundFields) {
  return [
    r.tournament_id,
    String(r.round_no),
    r.round_date ?? "",
    normalizeStartTypeForSession(r.start_type),
    normalizeTime(r.start_time),
    String(r.wave ?? "").trim().toUpperCase(),
  ].join("|");
}

export function compareRoundsInSession(a: SessionRoundFields, b: SessionRoundFields) {
  const w = String(a.wave ?? "").localeCompare(String(b.wave ?? ""));
  if (w !== 0) return w;
  const t = normalizeTime(a.start_time).localeCompare(normalizeTime(b.start_time));
  if (t !== 0) return t;
  return String(a.category_id ?? "").localeCompare(String(b.category_id ?? ""));
}

export function compareSessionBlocks<T extends SessionRoundFields>(a: T[], b: T[]) {
  const ar = a[0];
  const br = b[0];
  if (!ar || !br) return 0;
  if (ar.round_no !== br.round_no) return ar.round_no - br.round_no;
  const dc = String(ar.round_date ?? "").localeCompare(String(br.round_date ?? ""));
  if (dc !== 0) return dc;
  const wc = String(ar.wave ?? "").localeCompare(String(br.wave ?? ""));
  if (wc !== 0) return wc;
  return normalizeTime(ar.start_time).localeCompare(normalizeTime(br.start_time));
}

export function buildSessionBlocks<T extends SessionRoundFields>(rounds: T[]) {
  const map = new Map<string, T[]>();
  for (const r of rounds) {
    const k = sessionBlockKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return [...map.values()]
    .map((list) => [...list].sort(compareRoundsInSession))
    .sort(compareSessionBlocks);
}

export function representativeRoundId<T extends SessionRoundFields>(
  rounds: T[],
  roundId: string
) {
  const r = rounds.find((x) => x.id === roundId);
  if (!r) return roundId;
  const k = sessionBlockKey(r);
  const block = rounds.filter((x) => sessionBlockKey(x) === k);
  const sorted = [...block].sort(compareRoundsInSession);
  return sorted[0]?.id ?? roundId;
}

export function roundsInSameSession<T extends SessionRoundFields>(
  rounds: T[],
  roundId: string
) {
  const r = rounds.find((x) => x.id === roundId);
  if (!r) return [];
  const k = sessionBlockKey(r);
  return rounds.filter((x) => sessionBlockKey(x) === k).sort(compareRoundsInSession);
}

function formatDateDdMmYyyy(value: string | null | undefined) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return String(value);
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

export function formatSessionOptionLabel(rep: SessionRoundFields) {
  const dateStr = formatDateDdMmYyyy(rep.round_date);
  const wave = String(rep.wave ?? "").trim().toUpperCase();
  const waveLabel =
    wave === "AM" ? "Mañana (AM)" : wave === "PM" ? "Tarde (PM)" : "";

  const st = normalizeStartTypeForSession(rep.start_type);
  const typeLabel = st === "shotgun" ? "Shotgun" : st === "tee_times" ? "Tee times" : "—";

  const time = rep.start_time ? normalizeTime(rep.start_time) : "";

  const parts: string[] = [`R${rep.round_no}`];
  if (dateStr) parts.push(`· ${dateStr}`);
  if (waveLabel) parts.push(`· ${waveLabel}`);
  parts.push(`· ${typeLabel}`);
  if (time) parts.push(time);
  if (
    rep.interval_minutes != null &&
    Number.isFinite(Number(rep.interval_minutes))
  ) {
    parts.push(`· ${rep.interval_minutes} min`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
