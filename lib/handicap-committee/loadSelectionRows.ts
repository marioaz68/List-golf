import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import {
  daysBetweenIso,
  isoDaysAfter,
  todayMexicoIso,
} from "@/lib/ghin-report/whsCaps";
import {
  formatClubIndexHistoryBanner,
  formatNoIndexRevisionsNote,
  formatShortIndexHistoryNote,
  isIndexHistoryNotablyShort,
  WHS_INDEX_HISTORY_REQUIRED_DAYS,
} from "@/lib/handicap-committee/indexHistoryNote";

export type CommitteeSelectionRow = {
  entryId: string;
  playerId: string;
  playerName: string;
  ghin: string | null;
  hi: number | null;
  categoryCode: string | null;
  rounds12m: number | null;
  /** Mínimo de índice en la historia disponible (no exige 365d). */
  minHi12m: number | null;
  deltaHi: number | null;
  /** true solo si este jugador está peor que el resto del club (0 revs o << días). */
  indexHistoryInsufficient: boolean;
  indexHistoryDaysAvailable: number;
  indexHistoryNote: string | null;
  flagged: boolean;
  flaggedReason: string | null;
  suggestReasons: string[];
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
  const n = Number(v);
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

/**
 * Candidatos a revisión del comité.
 * HI/Cat/rondas/mín/Δ se llenan con lo que hay hoy (historia < 365d no anula
 * esas celdas). Soft/hard cap no se evalúan aquí: van en un banner de club.
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
      "id, player_id, category_id, handicap_index, status, flagged_for_committee, flagged_committee_reason"
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
            .select("id, first_name, last_name, ghin_number, handicap_index")
            .in("id", playerIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      categoryIds.length
        ? db.from("categories").select("id, code, name").in("id", categoryIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
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

  const until = todayMexicoIso();

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

  const activityByGhin = new Map<string, number>();
  const firstByGhin = new Map<string, string | null>();
  const revCountByGhin = new Map<string, number>();
  const minByGhin = new Map<string, number | null>();
  const latestHiByGhin = new Map<string, number | null>();

  const chunk = 60;
  for (let i = 0; i < ghins.length; i += chunk) {
    const batch = ghins.slice(i, i + chunk);
    const [{ data: acts, error: actErr }, { data: revs, error: revErr }] =
      await Promise.all([
        db
          .from("v_ghin_player_activity")
          .select("ghin_number, rondas_12_meses")
          .in("ghin_number", batch),
        db
          .from("ghin_index_revisions")
          .select("ghin_number, revision_date, handicap_index")
          .in("ghin_number", batch),
      ]);
    if (actErr) {
      console.error("[comite-seleccion] v_ghin_player_activity", actErr.message);
    }
    if (revErr) {
      console.error("[comite-seleccion] ghin_index_revisions", revErr.message);
    }
    for (const a of acts ?? []) {
      const g = String((a as { ghin_number?: string }).ghin_number ?? "");
      if (g) {
        activityByGhin.set(
          g,
          num((a as { rondas_12_meses?: unknown }).rondas_12_meses) ?? 0
        );
      }
    }
    type Agg = {
      first: string | null;
      last: string | null;
      lastHi: number | null;
      minHi: number | null;
      count: number;
    };
    const agg = new Map<string, Agg>();
    for (const row of revs ?? []) {
      const g = String((row as { ghin_number?: string }).ghin_number ?? "");
      if (!g) continue;
      const d =
        (row as { revision_date?: string | null }).revision_date != null
          ? String((row as { revision_date: string }).revision_date).slice(0, 10)
          : null;
      const hi = num((row as { handicap_index?: unknown }).handicap_index);
      const cur = agg.get(g) ?? {
        first: null,
        last: null,
        lastHi: null,
        minHi: null,
        count: 0,
      };
      cur.count += 1;
      if (d && (!cur.first || d < cur.first)) cur.first = d;
      if (d && (!cur.last || d > cur.last)) {
        cur.last = d;
        cur.lastHi = hi;
      }
      if (hi != null && (cur.minHi == null || hi < cur.minHi)) cur.minHi = hi;
      agg.set(g, cur);
    }
    for (const g of batch) {
      const a = agg.get(g);
      firstByGhin.set(g, a?.first ?? null);
      revCountByGhin.set(g, a?.count ?? 0);
      latestHiByGhin.set(g, a?.lastHi ?? null);
      minByGhin.set(g, a?.minHi ?? null);
    }
  }

  const rows: CommitteeSelectionRow[] = entries.map((e) => {
    const pl = e.player_id
      ? playerById.get(String(e.player_id))
      : null;
    const cat = e.category_id
      ? categoryById.get(String(e.category_id))
      : null;
    const ghinRaw = (pl as { ghin_number?: string | null } | undefined)
      ?.ghin_number;
    const ghin =
      ghinRaw != null && String(ghinRaw).trim() ? String(ghinRaw).trim() : null;
    const entryHi = num(e.handicap_index);
    const playerHi = num(
      (pl as { handicap_index?: unknown } | undefined)?.handicap_index
    );
    const latestHi = ghin ? (latestHiByGhin.get(ghin) ?? null) : null;
    const hi = entryHi ?? playerHi ?? latestHi;
    const catRec = cat as { code?: string | null; name?: string | null } | undefined;

    return {
      entryId: e.id as string,
      playerId: e.player_id ? String(e.player_id) : "",
      playerName: playerName(
        pl as { first_name?: string | null; last_name?: string | null } | null
      ),
      ghin,
      hi,
      categoryCode: catRec?.code ?? catRec?.name ?? null,
      rounds12m: ghin ? (activityByGhin.get(ghin) ?? 0) : null,
      minHi12m: null,
      deltaHi: null,
      indexHistoryInsufficient: false,
      indexHistoryDaysAvailable: 0,
      indexHistoryNote: null,
      flagged: Boolean(e.flagged_for_committee),
      flaggedReason: (e.flagged_committee_reason as string | null) ?? null,
      suggestReasons: [],
    };
  });

  for (const r of rows) {
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
    r.minHi12m = minByGhin.get(r.ghin) ?? null;
    if (r.hi != null && r.minHi12m != null) {
      r.deltaHi = round1(r.hi - r.minHi12m);
    }
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

  return { rows, clubIndexHistory };
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
        `Δ HI +${r.deltaHi} vs mínimo disponible (umbral ${thresholds.deltaHiMin})`
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

  return out;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}
