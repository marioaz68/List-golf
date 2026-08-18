import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import {
  formatOfficialHcp80Detail,
  resolveOfficialHcp80,
  type OfficialHcp80,
} from "@/lib/handicap/resolveTournamentEntryHandicap";
import {
  daysBetweenIso,
  isoDaysAfter,
  isoDaysBefore,
  todayMexicoIso,
} from "@/lib/ghin-report/whsCaps";
import {
  formatClubIndexHistoryBanner,
  formatNoIndexRevisionsNote,
  formatShortIndexHistoryNote,
  isIndexHistoryNotablyShort,
  WHS_INDEX_HISTORY_REQUIRED_DAYS,
} from "@/lib/handicap-committee/indexHistoryNote";
import {
  attachGhinToPlayerIfMissing,
  lookupGhinByPlayerName,
} from "@/lib/ghin-report/lookupGhinByPlayerName";

export type CommitteeSelectionRow = {
  entryId: string;
  playerId: string;
  playerName: string;
  ghin: string | null;
  /** HI congelado en la inscripción. */
  entryHi: number | null;
  /** HI vigente en players. */
  currentHi: number | null;
  categoryCode: string | null;
  rounds12m: number | null;
  /** min(handicap_index) en ghin_index_revisions (365 d); fallback min(hi_at_play). */
  minHi: number | null;
  /** currentHi − minHi. */
  deltaHi: number | null;
  /** true solo si este jugador está peor que el resto del club (0 revs o << días). */
  indexHistoryInsufficient: boolean;
  indexHistoryDaysAvailable: number;
  indexHistoryNote: string | null;
  flagged: boolean;
  flaggedReason: string | null;
  suggestReasons: string[];
  /** H del torneo con el % de la regla (80, 100, …). */
  tournamentHcp: OfficialHcp80 | null;
  tournamentHcpDetail: string | null;
};

export type ClubIndexHistory = {
  firstRevisionIso: string;
  daysAvailable: number;
  requiredDays: number;
  availableFromIso: string;
  message: string;
};

export type SuggestThresholds = {
  deltaHiMin: number;
  fewRoundsMax: number;
  lastNRounds: number;
  diffDropMin: number;
  varianceMin: number;
};

export const DEFAULT_SUGGEST_THRESHOLDS: SuggestThresholds = {
  deltaHiMin: 1.0,
  fewRoundsMax: 10,
  lastNRounds: 8,
  diffDropMin: 2.0,
  varianceMin: 9.0,
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function playerName(p: {
  first_name?: string | null;
  last_name?: string | null;
} | null): string {
  if (!p) return "Jugador";
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Jugador";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Fuerza un DTO plano: cada clave existe y es JSON-safe (nada de numeric/undefined). */
function wireRow(r: CommitteeSelectionRow): CommitteeSelectionRow {
  return {
    entryId: String(r.entryId ?? ""),
    playerId: String(r.playerId ?? ""),
    playerName: String(r.playerName ?? ""),
    ghin: r.ghin != null && String(r.ghin).trim() ? String(r.ghin).trim() : null,
    entryHi: num(r.entryHi),
    currentHi: num(r.currentHi),
    categoryCode:
      r.categoryCode != null && String(r.categoryCode).trim()
        ? String(r.categoryCode).trim()
        : null,
    rounds12m: num(r.rounds12m),
    minHi: num(r.minHi),
    deltaHi: num(r.deltaHi),
    indexHistoryInsufficient: Boolean(r.indexHistoryInsufficient),
    indexHistoryDaysAvailable: num(r.indexHistoryDaysAvailable) ?? 0,
    indexHistoryNote: r.indexHistoryNote ?? null,
    flagged: Boolean(r.flagged),
    flaggedReason: r.flaggedReason ?? null,
    suggestReasons: Array.isArray(r.suggestReasons)
      ? r.suggestReasons.map(String)
      : [],
    tournamentHcp: wireTournamentHcp(r.tournamentHcp),
    tournamentHcpDetail: r.tournamentHcpDetail ?? null,
  };
}

function wireTournamentHcp(d: OfficialHcp80 | null | undefined): OfficialHcp80 | null {
  if (!d) return null;
  const hp = num(d.hp);
  const ch = num(d.ch);
  const chExact = num(d.chExact);
  const hi = num(d.hi);
  const slope = num(d.slope);
  const cr = num(d.course_rating);
  const par = num(d.par);
  const pct = num(d.allowancePct);
  if (
    hp == null ||
    ch == null ||
    chExact == null ||
    hi == null ||
    slope == null ||
    cr == null ||
    par == null
  ) {
    return null;
  }
  return {
    hp,
    ch,
    chExact,
    hi,
    slope,
    course_rating: cr,
    par,
    teeCode:
      d.teeCode != null && String(d.teeCode).trim()
        ? String(d.teeCode).trim()
        : null,
    teeName:
      d.teeName != null && String(d.teeName).trim()
        ? String(d.teeName).trim()
        : null,
    teeColor:
      d.teeColor != null && String(d.teeColor).trim()
        ? String(d.teeColor).trim()
        : null,
    allowancePct: pct != null && pct > 0 ? pct : 80,
  };
}

function plainRows(rows: CommitteeSelectionRow[]): CommitteeSelectionRow[] {
  return rows.map(wireRow);
}

/** PostgREST recorta a 1000 filas; sin paginar, 62 jugadores × rondas se truncan. */
async function fetchAllRows<T>(
  make: () => any,
  label: string
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) {
      console.error(`[comite-seleccion] ${label}`, error.message);
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
    if (from > 50_000) break;
  }
  return out;
}

/**
 * Candidatos a revisión del comité.
 * HI inscripción ≠ HI actual. Δ = HI vigente − min(hi_at_play) 365d.
 */
export async function loadCommitteeSelectionRows(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<{
  rows: CommitteeSelectionRow[];
  clubIndexHistory: ClubIndexHistory | null;
}> {
  const admin = tryCreateAdminClient();
  const db = admin ?? supabase;

  const { data: entries, error: entriesErr } = await db
    .from("tournament_entries")
    .select(
      "id, player_id, category_id, handicap_index, status, flagged_for_committee, flagged_committee_reason, tee_set_id_override"
    )
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled")
    .order("handicap_index", { ascending: true });

  if (entriesErr) {
    console.error("[comite-seleccion] tournament_entries", entriesErr.message);
    return { rows: [], clubIndexHistory: null };
  }
  if (!entries?.length) return { rows: [], clubIndexHistory: null };

  const playerIds = [
    ...new Set(
      entries
        .map((e) => (e.player_id ? String(e.player_id) : ""))
        .filter(Boolean)
    ),
  ];
  const categoryIds = [
    ...new Set(
      entries
        .map((e) => (e.category_id ? String(e.category_id) : ""))
        .filter(Boolean)
    ),
  ];

  const [{ data: playerRows, error: playerErr }, { data: categoryRows, error: catErr }] =
    await Promise.all([
      playerIds.length
        ? db
            .from("players")
            .select(
              "id, first_name, last_name, ghin_number, handicap_index, gender, birth_year, handicap_torneo"
            )
            .in("id", playerIds)
        : Promise.resolve({
            data: [] as Array<Record<string, unknown>>,
            error: null,
          }),
      categoryIds.length
        ? db.from("categories").select("id, code, name").in("id", categoryIds)
        : Promise.resolve({
            data: [] as Array<Record<string, unknown>>,
            error: null,
          }),
    ]);

  if (playerErr) {
    console.error("[comite-seleccion] players", playerErr.message);
  }
  if (catErr) {
    console.error("[comite-seleccion] categories", catErr.message);
  }

  const playerById = new Map(
    (playerRows ?? []).map((p) => [String((p as { id: string }).id), p])
  );
  const categoryById = new Map(
    (categoryRows ?? []).map((c) => [String((c as { id: string }).id), c])
  );

  for (const p of playerRows ?? []) {
    const raw = (p as { ghin_number?: string | null }).ghin_number;
    if (raw != null && String(raw).trim()) continue;
    const found = await lookupGhinByPlayerName(
      db,
      (p as { first_name?: string | null }).first_name,
      (p as { last_name?: string | null }).last_name
    );
    if (!found) continue;
    (p as { ghin_number?: string | null }).ghin_number = found;
    const pid = String((p as { id: string }).id);
    playerById.set(pid, p);
    await attachGhinToPlayerIfMissing(db, pid, found);
  }

  const until = todayMexicoIso();
  const since12 = isoDaysBefore(until, WHS_INDEX_HISTORY_REQUIRED_DAYS);

  const { data: clubFirstRow, error: clubFirstErr } = await db
    .from("ghin_index_revisions")
    .select("revision_date")
    .order("revision_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubFirstErr) {
    console.error(
      "[comite-seleccion] min(revision_date)",
      clubFirstErr.message
    );
  }

  const clubFirstIso =
    clubFirstRow?.revision_date != null
      ? String(clubFirstRow.revision_date).slice(0, 10)
      : null;
  const clubDays = clubFirstIso ? daysBetweenIso(clubFirstIso, until) : 0;
  const clubIndexHistory: ClubIndexHistory | null =
    clubFirstIso && clubDays < WHS_INDEX_HISTORY_REQUIRED_DAYS
      ? (() => {
          const availableFromIso = isoDaysAfter(
            clubFirstIso,
            WHS_INDEX_HISTORY_REQUIRED_DAYS
          );
          const payload = {
            firstRevisionIso: clubFirstIso,
            daysAvailable: clubDays,
            requiredDays: WHS_INDEX_HISTORY_REQUIRED_DAYS,
            availableFromIso,
          };
          return {
            ...payload,
            message: formatClubIndexHistoryBanner(payload),
          };
        })()
      : null;

  const ghins = [
    ...new Set(
      (playerRows ?? [])
        .map((p) => {
          const g = (p as { ghin_number?: string | null }).ghin_number;
          return g != null && String(g).trim() ? String(g).trim() : "";
        })
        .filter(Boolean)
    ),
  ];

  const firstByGhin = new Map<string, string | null>();
  const revCountByGhin = new Map<string, number>();
  const minRevHiByGhin = new Map<string, number | null>();
  const rounds12ByGhin = new Map<string, number>();
  const minHiByGhin = new Map<string, number | null>();

  const chunk = 60;
  for (let i = 0; i < ghins.length; i += chunk) {
    const batch = ghins.slice(i, i + chunk);
    const [revs, roundRows] = await Promise.all([
      fetchAllRows<{
        ghin_number: string;
        revision_date: string | null;
        handicap_index: unknown;
      }>(
        () =>
          db
            .from("ghin_index_revisions")
            .select("ghin_number, revision_date, handicap_index")
            .in("ghin_number", batch),
        "ghin_index_revisions"
      ),
      fetchAllRows<{
        ghin_number: string;
        hi_at_play: unknown;
        date_played: string;
      }>(
        () =>
          db
            .from("ghin_rounds")
            .select("ghin_number, hi_at_play, date_played")
            .in("ghin_number", batch)
            .gte("date_played", since12)
            .lte("date_played", until),
        "ghin_rounds"
      ),
    ]);

    type RevAgg = { first: string | null; count: number; minHi: number | null };
    const revAgg = new Map<string, RevAgg>();
    for (const row of revs ?? []) {
      const g = String((row as { ghin_number?: string }).ghin_number ?? "");
      if (!g) continue;
      const d =
        (row as { revision_date?: string | null }).revision_date != null
          ? String((row as { revision_date: string }).revision_date).slice(0, 10)
          : null;
      const cur = revAgg.get(g) ?? { first: null, count: 0, minHi: null };
      cur.count += 1;
      if (d && (!cur.first || d < cur.first)) cur.first = d;
      const hiRev = num((row as { handicap_index?: unknown }).handicap_index);
      const inWindow = !d || (d >= since12 && d <= until);
      if (inWindow && hiRev != null && (cur.minHi == null || hiRev < cur.minHi)) {
        cur.minHi = hiRev;
      }
      revAgg.set(g, cur);
    }
    for (const g of batch) {
      const a = revAgg.get(g);
      firstByGhin.set(g, a?.first ?? null);
      revCountByGhin.set(g, a?.count ?? 0);
      minRevHiByGhin.set(g, a?.minHi ?? null);
    }

    type RoundAgg = { n: number; minHi: number | null };
    const roundAgg = new Map<string, RoundAgg>();
    for (const row of roundRows ?? []) {
      const g = String((row as { ghin_number?: string }).ghin_number ?? "");
      if (!g) continue;
      const cur = roundAgg.get(g) ?? { n: 0, minHi: null };
      cur.n += 1;
      const hiPlay = num((row as { hi_at_play?: unknown }).hi_at_play);
      if (hiPlay != null && (cur.minHi == null || hiPlay < cur.minHi)) {
        cur.minHi = hiPlay;
      }
      roundAgg.set(g, cur);
    }
    for (const g of batch) {
      const a = roundAgg.get(g);
      rounds12ByGhin.set(g, a?.n ?? 0);
      minHiByGhin.set(g, a?.minHi ?? null);
    }
  }

  const rows: CommitteeSelectionRow[] = entries.map((e) => {
    const pl = e.player_id ? playerById.get(String(e.player_id)) : null;
    const cat = e.category_id
      ? categoryById.get(String(e.category_id))
      : null;
    const ghinRaw = (pl as { ghin_number?: string | null } | undefined)
      ?.ghin_number;
    const ghin =
      ghinRaw != null && String(ghinRaw).trim() ? String(ghinRaw).trim() : null;
    const entryHi = num(e.handicap_index);
    const currentHi = num(
      (pl as { handicap_index?: unknown } | undefined)?.handicap_index
    );
    const catRec = cat as
      | { code?: string | null; name?: string | null }
      | undefined;

    return {
      entryId: String(e.id),
      playerId: e.player_id ? String(e.player_id) : "",
      playerName: playerName(
        pl as { first_name?: string | null; last_name?: string | null } | null
      ),
      ghin,
      entryHi,
      currentHi,
      categoryCode: catRec?.code ?? catRec?.name ?? null,
      rounds12m: ghin ? (rounds12ByGhin.get(ghin) ?? 0) : null,
      minHi: ghin
        ? (minRevHiByGhin.get(ghin) ?? minHiByGhin.get(ghin) ?? null)
        : null,
      deltaHi: null,
      indexHistoryInsufficient: false,
      indexHistoryDaysAvailable: 0,
      indexHistoryNote: null,
      flagged: Boolean(e.flagged_for_committee),
      flaggedReason: (e.flagged_committee_reason as string | null) ?? null,
      suggestReasons: [],
      tournamentHcp: null,
      tournamentHcpDetail: null,
    };
  });

  try {
    const handicapCtx = await loadTournamentHandicapContext(db, tournamentId);
    for (let i = 0; i < rows.length; i += 1) {
      const e = entries[i];
      if (!e) continue;
      const pl = e.player_id ? playerById.get(String(e.player_id)) : null;
      const hcp = resolveOfficialHcp80(
        {
          id: String(e.id),
          player_id: e.player_id ? String(e.player_id) : "",
          category_id: e.category_id ? String(e.category_id) : null,
          handicap_index: num(e.handicap_index),
          tee_set_id_override: e.tee_set_id_override
            ? String(e.tee_set_id_override)
            : null,
          player: pl
            ? {
                gender: (pl as { gender?: string | null }).gender ?? null,
                birth_year: num((pl as { birth_year?: unknown }).birth_year),
                handicap_index: num(
                  (pl as { handicap_index?: unknown }).handicap_index
                ),
                handicap_torneo: num(
                  (pl as { handicap_torneo?: unknown }).handicap_torneo
                ),
              }
            : null,
        },
        handicapCtx
      );
      rows[i].tournamentHcp = hcp;
      rows[i].tournamentHcpDetail = hcp ? formatOfficialHcp80Detail(hcp) : null;
    }
  } catch (err) {
    console.error(
      "[comite-seleccion] H torneo",
      err instanceof Error ? err.message : err
    );
  }

  for (const r of rows) {
    if (r.currentHi != null && r.minHi != null) {
      r.deltaHi = round1(r.currentHi - r.minHi);
    }
    if (!r.ghin) {
      r.indexHistoryInsufficient = true;
      r.indexHistoryDaysAvailable = 0;
      r.indexHistoryNote = formatNoIndexRevisionsNote();
      continue;
    }
    const revCount = revCountByGhin.get(r.ghin) ?? 0;
    const first = firstByGhin.get(r.ghin) ?? null;
    const days = first ? daysBetweenIso(first, until) : 0;
    r.indexHistoryDaysAvailable = days;
    if (revCount === 0 || !first) {
      r.indexHistoryInsufficient = true;
      r.indexHistoryNote = formatNoIndexRevisionsNote();
      continue;
    }
    if (isIndexHistoryNotablyShort(days, clubDays)) {
      r.indexHistoryInsufficient = true;
      r.indexHistoryNote = formatShortIndexHistoryNote(days);
    }
  }

  const out = plainRows(rows);
  const sample =
    out.find((r) => r.ghin === "10677068") ??
    out.find((r) => r.ghin === "584513") ??
    out[0] ??
    null;
  console.log(
    "[comite-seleccion] loader sample",
    JSON.stringify({
      db: admin ? "service_role" : "user-session",
      n: out.length,
      keys: sample ? Object.keys(sample) : [],
      sample,
    })
  );
  return { rows: out, clubIndexHistory };
}

/**
 * Añade razones de sugerencia según umbrales (no persiste).
 */
export async function applySuggestCandidates(
  supabase: SupabaseClient,
  rows: CommitteeSelectionRow[],
  thresholds: SuggestThresholds = DEFAULT_SUGGEST_THRESHOLDS
): Promise<CommitteeSelectionRow[]> {
  const admin = tryCreateAdminClient();
  const db = admin ?? supabase;
  const out = rows.map((r) => ({ ...r, suggestReasons: [] as string[] }));
  const withGhin = out.filter((r) => r.ghin);

  for (const r of out) {
    if (r.deltaHi != null && r.deltaHi >= thresholds.deltaHiMin) {
      r.suggestReasons.push(
        `Δ HI +${r.deltaHi} vs mínimo de rondas (umbral ${thresholds.deltaHiMin})`
      );
    }
    if (r.rounds12m != null && r.rounds12m <= thresholds.fewRoundsMax) {
      r.suggestReasons.push(
        `Pocas rondas 12m: ${r.rounds12m} (≤ ${thresholds.fewRoundsMax})`
      );
    }
  }

  const until = todayMexicoIso();
  for (const r of withGhin) {
    if (!r.ghin) continue;
    const { data: rounds, error } = await db
      .from("ghin_rounds")
      .select("differential, date_played")
      .eq("ghin_number", r.ghin)
      .not("differential", "is", null)
      .lte("date_played", until)
      .order("date_played", { ascending: false })
      .limit(60);
    if (error) {
      console.error("[comite-seleccion] ghin_rounds", r.ghin, error.message);
      continue;
    }

    const diffs = (rounds ?? [])
      .map((x) => num((x as { differential?: unknown }).differential))
      .filter((x): x is number => x != null);
    if (diffs.length < thresholds.lastNRounds + 5) continue;

    const recent = diffs.slice(0, thresholds.lastNRounds);
    const older = diffs.slice(thresholds.lastNRounds);
    const recentAvg =
      recent.reduce((s, x) => s + x, 0) / Math.max(1, recent.length);
    const olderAvg =
      older.reduce((s, x) => s + x, 0) / Math.max(1, older.length);
    const drop = olderAvg - recentAvg;
    if (drop >= thresholds.diffDropMin) {
      r.suggestReasons.push(
        `Caída diff últimas ${thresholds.lastNRounds}: −${drop.toFixed(1)} vs histórico`
      );
    }
    const v = variance(diffs.slice(0, 40));
    if (v >= thresholds.varianceMin) {
      r.suggestReasons.push(`Alta varianza de differential: ${v.toFixed(1)}`);
    }
  }

  return plainRows(out);
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
