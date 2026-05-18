import type {
  ClubRef,
  EntryCategory,
  HoleDetail,
  LeaderboardRow,
  RoundDetail,
  RoundRow,
  TournamentEntryJoinRow,
  ValidTournamentEntry,
} from "./types";
import {
  collectRoundIdsWithScoreCapture,
  resolveDetailForSelectedRound,
  roundRowAppliesToEntry,
  type SelectedRoundMeta,
} from "@/lib/leaderboard/roundCategoryMatch";

export type { SelectedRoundMeta } from "@/lib/leaderboard/roundCategoryMatch";

const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeCategory(
  value: EntryCategory | EntryCategory[] | null | undefined
): EntryCategory | null {
  return oneOrNull(value);
}

export function normalizeClubLabel(
  value: ClubRef | ClubRef[] | null | undefined
) {
  const club = oneOrNull(value);
  const label = (club?.short_name ?? club?.name ?? "").trim();
  return label || null;
}

export function isStartingOrderConfirmed(notes: string | null | undefined) {
  return String(notes ?? "").includes(STARTING_ORDER_CONFIRMED_MARKER);
}

export function isDQScore(value: number | null | undefined) {
  return value != null && Number(value) >= 400;
}

export function isDQStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "dq";
}

export function toValidEntry(
  row: TournamentEntryJoinRow
): ValidTournamentEntry | null {
  const player = oneOrNull(row.player);
  if (!player?.id || !row.player_id) return null;

  const entryHcp = row.handicap_index;
  const hcpNum =
    entryHcp != null && Number.isFinite(Number(entryHcp))
      ? Number(entryHcp)
      : null;

  return {
    id: row.id,
    player_id: row.player_id,
    player_number:
      row.player_number != null && Number.isFinite(Number(row.player_number))
        ? Number(row.player_number)
        : null,
    category_id: row.category_id,
    status: row.status ?? null,
    handicap_index: hcpNum,
    player,
    category: normalizeCategory(row.category),
  };
}

export function formatDate(date: string | null) {
  if (!date) return "Fecha por definir";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** Fecha de ronda con día de la semana (UTC, alineado con `formatDate`). */
export function formatDateWithWeekday(date: string | null, locale: "es" | "en") {
  if (!date) {
    return locale === "en" ? "Date TBD" : "Fecha por definir";
  }

  const loc = locale === "en" ? "en-US" : "es-MX";

  return new Intl.DateTimeFormat(loc, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** Clave calendario YYYY-MM-DD en UTC (alineada con `formatDate`). */
export function roundDateUtcKey(roundDate: string | null | undefined) {
  if (!roundDate) return null;
  const d = new Date(roundDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function utcTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function sortRoundsChrono(a: RoundRow, b: RoundRow) {
  if (a.round_no !== b.round_no) return a.round_no - b.round_no;
  return String(a.id).localeCompare(String(b.id));
}

function nameTokens(full: string): string[] {
  return full.trim().split(/\s+/).filter(Boolean);
}

/** Primer nombre + primer apellido (tokens 1 y 2). */
function baseTwoPartPlayerName(full: string): string {
  const p = nameTokens(full);
  if (p.length === 0) return full.trim() || "—";
  if (p.length === 1) return p[0]!;
  return `${p[0]} ${p[1]}`;
}

/**
 * Nombre compacto para tablas públicas (vivo / favoritos).
 * Si en la misma categoría hay otro jugador con el mismo nombre corto, añade inicial del segundo apellido (3er token).
 */
export function publicLeaderboardCompactPlayerName(
  row: LeaderboardRow,
  leaderboard: LeaderboardRow[]
): string {
  const full = row.player_name?.trim() || "—";
  const base = baseTwoPartPlayerName(full);
  const cat = String(row.category_id ?? "");
  const peers = leaderboard.filter((r) => String(r.category_id ?? "") === cat);
  const dupes = peers.filter(
    (r) => baseTwoPartPlayerName(r.player_name) === base
  );
  if (dupes.length < 2) return base;
  const p = nameTokens(full);
  if (p.length >= 3) return `${base} ${p[2]!.charAt(0).toUpperCase()}.`;
  return base;
}

/** Columna de nombre: estrecha en móvil; más ancha en tablet/desktop para nombre completo. */
export const publicLeaderboardNameColumnClass =
  "w-[92px] min-w-[92px] max-w-[120px] sm:w-[112px] sm:min-w-[112px] md:w-auto md:min-w-[148px] md:max-w-[min(240px,32vw)] lg:min-w-[172px] lg:max-w-none";

/** Ancho mínimo de tabla en vistas públicas (leaderboard / vivo / favoritos). */
export const publicLeaderboardTableMinWidthClass =
  "min-w-[520px] md:min-w-[680px]";

/** Ronda sin categoría = aplica a todas; si no hay categoría seleccionada, no filtra. */
export function roundBelongsToCategory(
  round: Pick<RoundRow, "category_id">,
  selectedCategoryId: string | null | undefined
): boolean {
  if (!selectedCategoryId) return true;
  const rid = String(round.category_id ?? "").trim();
  if (!rid) return true;
  return rid === selectedCategoryId;
}

/** Hay captura o resultado en esta ronda para el jugador. */
export function detailRoundHasScoreData(detail: RoundDetail): boolean {
  return (
    detail.is_dq ||
    detail.gross_score != null ||
    detail.holes.some((h) => {
      if (h.strokes == null) return false;
      const n = Number(h.strokes);
      return !Number.isNaN(n);
    })
  );
}

function sortDetailsForMergePriority(
  arr: RoundDetail[],
  playerCategoryId: string | null
): RoundDetail[] {
  const cid = String(playerCategoryId ?? "").trim();
  const catMatch = (d: RoundDetail) =>
    cid !== "" && String(d.category_id ?? "").trim() === cid;

  const tier = (d: RoundDetail) => {
    const s = detailRoundHasScoreData(d);
    const c = catMatch(d);
    if (s && c) return 0;
    if (s) return 1;
    if (c) return 2;
    return 3;
  };

  return [...arr].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    return String(a.round_id).localeCompare(String(b.round_id));
  });
}

/** Une hoyos de todas las filas `rounds` con el mismo round_id real. */
function mergeRoundDetailGroup(
  arr: RoundDetail[],
  playerCategoryId: string | null
): RoundDetail {
  if (arr.length === 0) {
    throw new Error("mergeRoundDetailGroup: empty");
  }
  if (arr.length === 1) return arr[0]!;

  const ordered = sortDetailsForMergePriority(arr, playerCategoryId);

  const pickStrokes = (holeNumber: number): number | null => {
    for (const d of ordered) {
      const h = d.holes.find((x) => x.hole_number === holeNumber);
      if (h == null || h.strokes == null) continue;
      const n = Number(h.strokes);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  };

  const pickPar = (holeNumber: number): number | null => {
    for (const d of ordered) {
      const h = d.holes.find((x) => x.hole_number === holeNumber);
      if (h?.par != null) {
        const n = Number(h.par);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  };

  const primary = ordered[0]!;
  const isDQ = ordered.some((d) => d.is_dq);

  const holes: HoleDetail[] = Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    return {
      hole_number: holeNumber,
      par: pickPar(holeNumber),
      strokes: pickStrokes(holeNumber),
    };
  });

  const played = holes.filter((h) => h.strokes != null);
  const parPlayed =
    played.length > 0
      ? played.reduce((a, h) => a + Number(h.par ?? 0), 0)
      : null;
  const grossPlayed =
    played.length > 0
      ? played.reduce((a, h) => a + Number(h.strokes ?? 0), 0)
      : null;
  const toPar =
    isDQ || parPlayed == null || grossPlayed == null
      ? null
      : grossPlayed - parPlayed;

  const grossFromOrdered = ordered.find((d) => d.gross_score != null)
    ?.gross_score;

  return {
    ...primary,
    is_dq: isDQ,
    holes,
    out_score: subtotal(holes, 0, 9, "strokes"),
    in_score: subtotal(holes, 9, 18, "strokes"),
    total_score: subtotal(holes, 0, 18, "strokes"),
    gross_score: isDQ
      ? primary.gross_score
      : grossFromOrdered ?? grossPlayed ?? primary.gross_score,
    to_par: isDQ ? primary.to_par : toPar ?? primary.to_par,
  };
}

function detailsForPlayerCategoryScope(
  details: RoundDetail[],
  playerCategoryId: string | null
): RoundDetail[] {
  const cid = String(playerCategoryId ?? "").trim();
  if (!cid) return details;
  const scoped = details.filter((d) =>
    roundRowAppliesToEntry({ category_id: d.category_id ?? null }, cid)
  );
  return scoped.length > 0 ? scoped : details;
}

/**
 * Detalle hoyo por hoyo.
 *
 * Importante: NO agrupamos solo por round_no porque en este torneo existen varias R1
 * con la misma fecha/wave pero diferente category_id. Agrupar solo por round_no mezcla
 * R1 A con R1 B y deja detalles vacíos aunque round_scores/hole_scores sí existan.
 */
export function selectLeaderboardDetailsForPlayer(
  row: LeaderboardRow
): RoundDetail[] {
  const catId = row.category_id;
  const cid = String(catId ?? "").trim();

  const scopedDetails = detailsForPlayerCategoryScope(row.details, catId);

  const byRoundKey = new Map<string, RoundDetail[]>();
  for (const d of scopedDetails) {
    const key = [d.round_no, d.round_id, d.category_id ?? ""].join("|");

    if (!byRoundKey.has(key)) {
      byRoundKey.set(key, []);
    }

    byRoundKey.get(key)!.push(d);
  }

  const out: RoundDetail[] = [];
  for (const key of [...byRoundKey.keys()].sort((a, b) => {
    const [aRoundNo = "", aRoundId = "", aCategoryId = ""] = a.split("|");
    const [bRoundNo = "", bRoundId = "", bCategoryId = ""] = b.split("|");

    const na = Number(aRoundNo);
    const nb = Number(bRoundNo);
    if (na !== nb) return na - nb;

    const catCompare = aCategoryId.localeCompare(bCategoryId);
    if (catCompare !== 0) return catCompare;

    return aRoundId.localeCompare(bRoundId);
  })) {
    const arr = byRoundKey.get(key)!;

    const groupVisible =
      !cid ||
      arr.some((d) =>
        roundBelongsToCategory({ category_id: d.category_id ?? null }, catId)
      ) ||
      arr.some((d) => detailRoundHasScoreData(d));

    if (!groupVisible) continue;

    if (arr.length === 1) {
      out.push(arr[0]!);
    } else {
      out.push(mergeRoundDetailGroup(arr, catId));
    }
  }
  return out;
}

/** Día de la semana en minúsculas (UTC), misma base que `formatDate`. */
export function formatWeekdayForLocale(
  date: string | null,
  locale: "es" | "en"
) {
  if (!date) return "";
  const loc = locale === "en" ? "en-US" : "es-MX";
  try {
    return new Intl.DateTimeFormat(loc, {
      weekday: "long",
      timeZone: "UTC",
    })
      .format(new Date(date))
      .toLowerCase();
  } catch {
    return "";
  }
}

/** Día de la semana en minúsculas (es-MX, UTC), misma base que `formatDate`. */
export function formatWeekdayEsMxUtc(date: string | null) {
  return formatWeekdayForLocale(date, "es");
}

export function formatWaveToken(wave: string | null | undefined) {
  const w = String(wave ?? "").trim().toUpperCase();
  return w === "AM" || w === "PM" ? w : "";
}

/** Turno legible: «por la mañana» / «por la tarde» (o AM/PM en inglés). */
export function formatWaveLabel(
  wave: string | null | undefined,
  locale: "es" | "en"
) {
  const w = formatWaveToken(wave);
  if (!w) return "";
  if (locale === "en") {
    return w === "AM" ? "morning" : "afternoon";
  }
  return w === "AM" ? "por la mañana" : "por la tarde";
}

/** Chip compacto en navegación pública: `R2 · jueves · por la tarde`. */
export function formatPublicRoundNavPill(
  round: {
    round_no: number;
    round_date: string | null;
    wave?: string | null;
  },
  locale: "es" | "en"
) {
  const bits = [`R${round.round_no}`];
  const wd = formatWeekdayForLocale(round.round_date, locale);
  const waveLbl = formatWaveLabel(round.wave, locale);
  if (wd) bits.push(wd);
  if (waveLbl) bits.push(waveLbl);
  return bits.join(" · ");
}

/** Texto tipo `miércoles · AM` para encabezados de salidas públicas. */
export function formatPublicSalidasKicker(
  round: {
    round_date: string | null;
    wave?: string | null;
  },
  locale: "es" | "en" = "es"
) {
  const wd = formatWeekdayForLocale(round.round_date, locale);
  const wave = formatWaveLabel(round.wave, locale);
  if (wd && wave) return `${wd} · ${wave}`;
  if (wd) return wd;
  if (wave) return wave;
  return "";
}

/** Chip / enlace: `R1 · 15 oct 2025 · miércoles · por la mañana`. */
export function formatPublicTeeSheetRoundPill(
  round: {
    round_no: number;
    round_date: string | null;
    wave?: string | null;
  },
  locale: "es" | "en" = "es"
) {
  const bits = [`R${round.round_no}`, formatDate(round.round_date)];
  const wd = formatWeekdayForLocale(round.round_date, locale);
  const wave = formatWaveLabel(round.wave, locale);
  if (wd) bits.push(wd);
  if (wave) bits.push(wave);
  return bits.join(" · ");
}

/** Título de bloque: `Ronda 1 · 15 oct 2025 · miércoles · por la mañana`. */
export function formatPublicTeeSheetSectionTitle(
  round: {
    round_no: number;
    round_date: string | null;
    wave?: string | null;
  },
  locale: "es" | "en" = "es"
) {
  const bits = [`Ronda ${round.round_no}`, formatDate(round.round_date)];
  const wd = formatWeekdayForLocale(round.round_date, locale);
  const wave = formatWaveLabel(round.wave, locale);
  if (wd) bits.push(wd);
  if (wave) bits.push(wave);
  return bits.join(" · ");
}

export function formatTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "--:--";
  return raw.slice(0, 5);
}

export function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

export function formatScoreOrDQ(value: number | null, isDQ: boolean) {
  if (isDQ) return "DQ";
  return formatScore(value);
}

export function formatRelative(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

export function formatRelativeOrDQ(value: number | null, isDQ: boolean) {
  if (isDQ) return "DQ";
  return formatRelative(value);
}

export function nameOfPlayer(player: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined) {
  const last = String(player?.last_name ?? "").trim();
  const first = String(player?.first_name ?? "").trim();
  return `${last} ${first}`.trim() || "Jugador";
}

export function buildHref(params: {
  tournamentId: string;
  categoryId?: string | null;
  roundId?: string | null;
  view?: string | null;
  detailId?: string | null;
  /** Mantiene la vista embebida en administración (`/leaderboard`). */
  embed?: boolean;
  /** Vuelta al módulo Leaderboard del backoffice (móvil). */
  fromAdmin?: boolean;
}) {
  const sp = new URLSearchParams();

  if (params.embed) sp.set("embed", "1");
  if (params.fromAdmin) sp.set("from", "admin");
  if (params.view) sp.set("view", params.view);
  if (params.categoryId) sp.set("category_id", params.categoryId);
  if (params.roundId) sp.set("round_id", params.roundId);
  if (params.detailId) sp.set("detail_id", params.detailId);

  const qs = sp.toString();

  return qs
    ? `/torneos/${params.tournamentId}?${qs}`
    : `/torneos/${params.tournamentId}`;
}

export function buildDetailToggleHref(params: {
  tournamentId: string;
  categoryId?: string | null;
  roundId?: string | null;
  view?: string | null;
  currentDetailId?: string | null;
  nextDetailId?: string | null;
  embed?: boolean;
  fromAdmin?: boolean;
}) {
  return buildHref({
    tournamentId: params.tournamentId,
    categoryId: params.categoryId ?? null,
    roundId: params.roundId ?? null,
    view: params.view ?? null,
    embed: params.embed,
    fromAdmin: params.fromAdmin,
    detailId:
      params.currentDetailId === params.nextDetailId
        ? null
        : params.nextDetailId ?? null,
  });
}

export function buildScorecardsHref(params: {
  tournamentId: string;
  roundId?: string | null;
}) {
  const sp = new URLSearchParams();
  sp.set("tournament_id", params.tournamentId);

  if (params.roundId) {
    sp.set("round_id", params.roundId);
  }

  return `/scorecards?${sp.toString()}`;
}

export function pillClasses(active: boolean) {
  return active
    ? "inline-flex min-h-8 items-center justify-center rounded-md border border-cyan-300 bg-gradient-to-b from-cyan-300 to-cyan-500 px-3 text-[11px] font-bold leading-none text-[#08111f] shadow-[0_3px_0_#0e7490,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-cyan-200 hover:to-cyan-400"
    : "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700";
}

const publicTourNavCell =
  "flex min-h-10 w-full max-w-full items-center justify-center whitespace-normal text-balance px-2 py-2 text-center text-[10px] font-bold leading-snug sm:min-h-9 sm:px-2.5 sm:text-[11px] sm:leading-tight";

/** Live / leaderboard / tee / favorites: fills equal-width grid cells (ES + EN copy). */
export function publicTournamentViewPillClasses(active: boolean) {
  return active
    ? `${publicTourNavCell} rounded-md border border-cyan-300 bg-gradient-to-b from-cyan-300 to-cyan-500 text-[#08111f] shadow-[0_3px_0_#0e7490,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-cyan-200 hover:to-cyan-400`
    : `${publicTourNavCell} rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700`;
}

const publicTourOutboundCell =
  "flex min-h-10 w-full max-w-full items-center justify-center whitespace-normal text-balance px-2 py-2 text-center text-[10px] font-bold leading-snug text-white sm:min-h-9 sm:px-2.5 sm:text-[11px] sm:leading-tight";

/** Home + browse tournaments (+ admin): slate gradient, grid cell. */
export function publicTournamentOutboundNavClasses() {
  return `${publicTourOutboundCell} rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700`;
}

/** Admin + e-signature in hero nav grid (emerald). */
export function publicTournamentEmeraldHeroNavClasses() {
  return `${publicTourOutboundCell} rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600`;
}

/** `repeat(auto-fit, minmax(...))` so buttons stay even in ES/EN on phone + desktop. */
export const publicTournamentPrimaryNavGridClass =
  "grid w-full gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12.5rem),1fr))]";

export const publicTournamentSecondaryNavGridClass =
  "grid w-full gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10.75rem),1fr))]";

export function adminPillClasses() {
  return "inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600";
}

export function sectionPillClasses(active: boolean) {
  return active
    ? "inline-flex min-h-7 items-center justify-center rounded-md border border-cyan-300 bg-gradient-to-b from-cyan-300 to-cyan-500 px-2.5 text-[11px] font-bold leading-none text-[#08111f] shadow-[0_2px_0_#0e7490,0_3px_7px_rgba(0,0,0,0.22)] transition hover:from-cyan-200 hover:to-cyan-400"
    : "inline-flex min-h-7 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-2.5 text-[11px] font-bold leading-none text-white shadow-[0_2px_0_#0f172a,0_3px_7px_rgba(0,0,0,0.22)] transition hover:from-slate-600 hover:to-slate-700";
}

export function getPlayerCode(index: number) {
  return `J${String(index + 1).padStart(3, "0")}`;
}

export function subtotal(
  holes: HoleDetail[],
  start: number,
  end: number,
  field: "par" | "strokes"
): number | null {
  const segment = holes.slice(start, end);
  const hasAny = segment.some((hole) => hole[field] != null);
  if (!hasAny) return null;
  return segment.reduce((acc, hole) => acc + Number(hole[field] ?? 0), 0);
}

export function holesPlayedCount(details: RoundDetail[]) {
  return details.reduce(
    (acc, detail) =>
      acc + detail.holes.filter((hole) => hole.strokes != null).length,
    0
  );
}

export function holesCapturedForSelectedRound(
  details: RoundDetail[],
  selectedRound: SelectedRoundMeta | null | undefined,
  entryCategoryId?: string | null
) {
  const round = resolveDetailForSelectedRound(
    details,
    selectedRound ?? null,
    entryCategoryId,
    collectRoundIdsWithScoreCapture(details)
  );
  if (!round) return 0;
  if (round.is_dq) return 18;
  return round.holes.filter((hole) => hole.strokes != null).length;
}

export function formatThru(
  details: RoundDetail[],
  selectedRound: SelectedRoundMeta | null | undefined,
  entryCategoryId?: string | null
) {
  if (!selectedRound?.id) return "—";

  const round = resolveDetailForSelectedRound(
    details,
    selectedRound,
    entryCategoryId,
    collectRoundIdsWithScoreCapture(details)
  );
  if (round?.is_dq) return "DQ";

  const count =
    round?.holes.filter((hole) => hole.strokes != null).length ?? 0;

  if (count <= 0) return "—";
  if (count >= 18) return "F";
  return String(count);
}

export type ScoreMarkerOptions = { compact?: boolean };

export function scoreMarker(
  strokes: number | null,
  par: number | null,
  opts?: ScoreMarkerOptions
): {
  wrapper: string;
  outer?: string;
  inner?: string;
  textClass: string;
} {
  const compact = opts?.compact === true;
  const box = compact
    ? "relative inline-flex h-[18px] w-[18px] items-center justify-center"
    : "relative inline-flex h-7 w-7 items-center justify-center";
  const inSm = compact ? "inset-[2px]" : "inset-[4px]";
  const inSm2 = compact ? "inset-[3px]" : "inset-[5px]";
  const inTight = compact ? "inset-[2px]" : "inset-[4px]";

  if (strokes == null) {
    return {
      wrapper: `${box} rounded-md`,
      textClass: compact ? "text-[9px] text-slate-500" : "text-slate-500",
    };
  }

  if (par == null) {
    return {
      wrapper: `${box} rounded-md`,
      textClass: compact ? "text-[9px] text-white" : "text-white",
    };
  }

  const diff = Number(strokes) - Number(par);

  if (diff <= -2) {
    return {
      wrapper: `${box} rounded-full`,
      outer:
        "pointer-events-none absolute inset-0 block rounded-full border border-rose-400 bg-rose-500/12",
      inner: `pointer-events-none absolute ${inSm2} block rounded-full border border-rose-300/90`,
      textClass: compact
        ? "relative z-10 text-[9px] font-bold text-white"
        : "relative z-10 font-bold text-white",
    };
  }

  if (diff === -1) {
    return {
      wrapper: `${box} rounded-full`,
      outer: `pointer-events-none absolute ${inSm} block rounded-full border border-rose-400 bg-rose-500/12`,
      textClass: compact
        ? "relative z-10 text-[9px] font-bold text-white"
        : "relative z-10 font-bold text-white",
    };
  }

  if (diff >= 2) {
    return {
      wrapper: `${box} rounded-[2px]`,
      outer:
        "pointer-events-none absolute inset-0 block rounded-[2px] border border-amber-200/95 bg-amber-100/8",
      inner: `pointer-events-none absolute ${inSm2} block rounded-[1px] border border-amber-100/90`,
      textClass: compact
        ? "relative z-10 text-[9px] font-bold text-white"
        : "relative z-10 font-bold text-white",
    };
  }

  if (diff === 1) {
    return {
      wrapper: `${box} rounded-[2px]`,
      outer: `pointer-events-none absolute ${inTight} block rounded-[1px] border border-amber-100/90 bg-amber-100/8`,
      textClass: compact
        ? "relative z-10 text-[9px] font-bold text-white"
        : "relative z-10 font-bold text-white",
    };
  }

  return {
    wrapper: `${box} rounded-md`,
    textClass: compact ? "relative z-10 text-[9px] text-white" : "text-white",
  };
}
