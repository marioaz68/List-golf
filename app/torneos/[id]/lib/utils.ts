import type {
  ClubRef,
  EntryCategory,
  HoleDetail,
  RoundDetail,
  TournamentEntryJoinRow,
  ValidTournamentEntry,
} from "./types";

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

  return {
    id: row.id,
    player_id: row.player_id,
    category_id: row.category_id,
    status: row.status ?? null,
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

/** Día de la semana en minúsculas (es-MX, UTC), misma base que `formatDate`. */
export function formatWeekdayEsMxUtc(date: string | null) {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      timeZone: "UTC",
    })
      .format(new Date(date))
      .toLowerCase();
  } catch {
    return "";
  }
}

export function formatWaveToken(wave: string | null | undefined) {
  const w = String(wave ?? "").trim().toUpperCase();
  return w === "AM" || w === "PM" ? w : "";
}

/** Texto tipo `miércoles · AM` para encabezados de salidas públicas. */
export function formatPublicSalidasKicker(round: {
  round_date: string | null;
  wave?: string | null;
}) {
  const wd = formatWeekdayEsMxUtc(round.round_date);
  const wave = formatWaveToken(round.wave);
  if (wd && wave) return `${wd} · ${wave}`;
  if (wd) return wd;
  if (wave) return wave;
  return "";
}

/** Chip / enlace: `R1 · 15 oct 2025 · miércoles · AM`. */
export function formatPublicTeeSheetRoundPill(round: {
  round_no: number;
  round_date: string | null;
  wave?: string | null;
}) {
  const bits = [`R${round.round_no}`, formatDate(round.round_date)];
  const wd = formatWeekdayEsMxUtc(round.round_date);
  const wave = formatWaveToken(round.wave);
  if (wd) bits.push(wd);
  if (wave) bits.push(wave);
  return bits.join(" · ");
}

/** Título de bloque: `Ronda 1 · 15 oct 2025 · miércoles · AM`. */
export function formatPublicTeeSheetSectionTitle(round: {
  round_no: number;
  round_date: string | null;
  wave?: string | null;
}) {
  const bits = [`Ronda ${round.round_no}`, formatDate(round.round_date)];
  const wd = formatWeekdayEsMxUtc(round.round_date);
  const wave = formatWaveToken(round.wave);
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
}) {
  const sp = new URLSearchParams();

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
}) {
  return buildHref({
    tournamentId: params.tournamentId,
    categoryId: params.categoryId ?? null,
    roundId: params.roundId ?? null,
    view: params.view ?? null,
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

function holesCapturedInRound(
  details: RoundDetail[],
  roundId: string | null | undefined
) {
  if (!roundId) return 0;

  const round = details.find((detail) => detail.round_id === roundId);
  if (!round) return 0;
  if (round.is_dq) return 18;

  return round.holes.filter((hole) => hole.strokes != null).length;
}

export function formatThru(
  details: RoundDetail[],
  roundId: string | null | undefined
) {
  const round = details.find((detail) => detail.round_id === roundId);
  if (round?.is_dq) return "DQ";

  const count = holesCapturedInRound(details, roundId);

  if (count <= 0) return "—";
  if (count >= 18) return "F";
  return String(count);
}

export function scoreMarker(
  strokes: number | null,
  par: number | null
): {
  wrapper: string;
  outer?: string;
  inner?: string;
  textClass: string;
} {
  if (strokes == null) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
      textClass: "text-slate-500",
    };
  }

  if (par == null) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
      textClass: "text-white",
    };
  }

  const diff = Number(strokes) - Number(par);

  if (diff <= -2) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
      outer:
        "pointer-events-none absolute inset-0 block rounded-full border-[2px] border-rose-400 bg-rose-500/12 shadow-[0_0_0_1px_rgba(251,113,133,0.2)]",
      inner:
        "pointer-events-none absolute inset-[4px] block rounded-full border-[2px] border-rose-300",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff === -1) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
      outer:
        "pointer-events-none absolute inset-[3px] block rounded-full border-[2px] border-rose-400 bg-rose-500/12",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff >= 2) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-[4px]",
      outer:
        "pointer-events-none absolute inset-0 block rounded-[4px] border-[2px] border-amber-200 bg-amber-100/8",
      inner:
        "pointer-events-none absolute inset-[4px] block rounded-[2px] border-[2px] border-amber-100",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff === 1) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-[4px]",
      outer:
        "pointer-events-none absolute inset-[3px] block rounded-[2px] border-[2px] border-amber-100 bg-amber-100/8",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  return {
    wrapper:
      "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
    textClass: "text-white",
  };
}
