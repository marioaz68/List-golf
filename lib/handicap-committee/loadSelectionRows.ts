import type { SupabaseClient } from "@supabase/supabase-js";
import {
  daysBetweenIso,
  isoDaysBefore,
  todayMexicoIso,
} from "@/lib/ghin-report/whsCaps";
import {
  formatInsufficientIndexHistoryNote,
  isIndexHistoryInsufficient,
  WHS_INDEX_HISTORY_REQUIRED_DAYS,
} from "@/lib/handicap-committee/indexHistoryNote";

export type CommitteeSelectionRow = {
  entryId: string;
  playerId: string | null;
  playerName: string;
  ghin: string | null;
  categoryCode: string | null;
  hi: number | null;
  flagged: boolean;
  flaggedReason: string | null;
  rounds12m: number | null;
  /** null si f_ghin_min_index no devolvió valor o historia < 365d. */
  minHi12m: number | null;
  /** null (celda vacía) si no hay histórico suficiente — no usar 0 ni "—". */
  deltaHi: number | null;
  suggestReasons: string[];
  /** Incluidos con normalidad; solo bandera/nota. */
  indexHistoryInsufficient: boolean;
  indexHistoryDaysAvailable: number;
  indexHistoryNote: string | null;
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
  if (v == null) return null;
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

function variance(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const ss = vals.reduce((s, x) => s + (x - mean) ** 2, 0);
  return ss / (vals.length - 1);
}

/**
 * Carga entradas del torneo + métricas GHIN para la pantalla de selección.
 */
export async function loadCommitteeSelectionRows(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<CommitteeSelectionRow[]> {
  const { data: entries, error } = await supabase
    .from("tournament_entries")
    .select(
      `
      id,
      player_id,
      handicap_index,
      flagged_for_committee,
      flagged_committee_reason,
      category:categories(code),
      player:players(id, first_name, last_name, ghin_number)
    `
    )
    .eq("tournament_id", tournamentId)
    .order("handicap_index", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (entries ?? []).map((e: any) => {
    const player = Array.isArray(e.player) ? e.player[0] : e.player;
    const cat = Array.isArray(e.category) ? e.category[0] : e.category;
    const ghin =
      player?.ghin_number != null
        ? String(player.ghin_number).trim() || null
        : null;
    return {
      entryId: String(e.id),
      playerId: player?.id ? String(player.id) : e.player_id,
      playerName: playerName(player),
      ghin,
      categoryCode: cat?.code != null ? String(cat.code) : null,
      hi: num(e.handicap_index),
      flagged: Boolean(e.flagged_for_committee),
      flaggedReason: (e.flagged_committee_reason as string | null) ?? null,
      rounds12m: null as number | null,
      minHi12m: null as number | null,
      deltaHi: null as number | null,
      suggestReasons: [] as string[],
      indexHistoryInsufficient: false,
      indexHistoryDaysAvailable: 0,
      indexHistoryNote: null as string | null,
    };
  });

  const ghins = [
    ...new Set(rows.map((r) => r.ghin).filter((g): g is string => Boolean(g))),
  ];
  if (ghins.length === 0) return rows;

  const until = todayMexicoIso();
  const since12 = isoDaysBefore(until, WHS_INDEX_HISTORY_REQUIRED_DAYS);

  // Actividad + min HI + primera revisión (para N días disponibles).
  const activityByGhin = new Map<string, number>();
  const minHiByGhin = new Map<string, number | null>();
  const firstRevByGhin = new Map<string, string | null>();

  const chunk = 80;
  for (let i = 0; i < ghins.length; i += chunk) {
    const batch = ghins.slice(i, i + chunk);
    const [{ data: acts }, minResults, firstRevs] = await Promise.all([
      supabase
        .from("v_ghin_player_activity")
        .select("ghin_number, rondas_12_meses")
        .in("ghin_number", batch),
      Promise.all(
        batch.map(async (g) => {
          const { data } = await supabase.rpc("f_ghin_min_index", {
            p_ghin: g,
            p_desde: since12,
            p_hasta: until,
          });
          return { g, min: num(data) };
        })
      ),
      Promise.all(
        batch.map(async (g) => {
          const { data } = await supabase
            .from("ghin_index_revisions")
            .select("revision_date")
            .eq("ghin_number", g)
            .order("revision_date", { ascending: true })
            .limit(1)
            .maybeSingle();
          return {
            g,
            first:
              data?.revision_date != null
                ? String(data.revision_date).slice(0, 10)
                : null,
          };
        })
      ),
    ]);
    for (const a of acts ?? []) {
      activityByGhin.set(
        String((a as { ghin_number: string }).ghin_number),
        Number((a as { rondas_12_meses?: number }).rondas_12_meses ?? 0)
      );
    }
    for (const m of minResults) {
      minHiByGhin.set(m.g, m.min);
    }
    for (const f of firstRevs) {
      firstRevByGhin.set(f.g, f.first);
    }
  }

  for (const r of rows) {
    if (!r.ghin) {
      r.indexHistoryInsufficient = true;
      r.indexHistoryDaysAvailable = 0;
      r.indexHistoryNote = formatInsufficientIndexHistoryNote(0);
      r.minHi12m = null;
      r.deltaHi = null;
      continue;
    }
    r.rounds12m = activityByGhin.get(r.ghin) ?? 0;
    const first = firstRevByGhin.get(r.ghin) ?? null;
    const days = first ? daysBetweenIso(first, until) : 0;
    r.indexHistoryDaysAvailable = days;
    const minRaw = minHiByGhin.get(r.ghin) ?? null;
    const insufficient =
      minRaw == null || isIndexHistoryInsufficient(days);

    r.indexHistoryInsufficient = insufficient;
    if (insufficient) {
      r.minHi12m = null;
      r.deltaHi = null;
      r.indexHistoryNote = formatInsufficientIndexHistoryNote(days);
    } else {
      r.minHi12m = minRaw;
      r.indexHistoryNote = null;
      if (r.hi != null && minRaw != null) {
        r.deltaHi = Math.round((r.hi - minRaw) * 10) / 10;
      }
    }
  }

  return rows;
}

/**
 * Añade razones de sugerencia según umbrales (no persiste).
 */
export async function applySuggestCandidates(
  supabase: SupabaseClient,
  rows: CommitteeSelectionRow[],
  thresholds: SuggestThresholds = DEFAULT_SUGGEST_THRESHOLDS
): Promise<CommitteeSelectionRow[]> {
  const out = rows.map((r) => ({ ...r, suggestReasons: [] as string[] }));
  const withGhin = out.filter((r) => r.ghin);

  for (const r of out) {
    if (r.deltaHi != null && r.deltaHi >= thresholds.deltaHiMin) {
      r.suggestReasons.push(
        `Δ HI +${r.deltaHi} vs mínimo 12m (umbral ${thresholds.deltaHiMin})`
      );
    }
    if (r.rounds12m != null && r.rounds12m <= thresholds.fewRoundsMax) {
      r.suggestReasons.push(
        `Pocas rondas 12m: ${r.rounds12m} (≤ ${thresholds.fewRoundsMax})`
      );
    }
  }

  // Diff drop + variance: últimas N rondas vs histórico (muestra)
  const until = todayMexicoIso();
  for (const r of withGhin) {
    if (!r.ghin) continue;
    const { data: rounds } = await supabase
      .from("ghin_rounds")
      .select("differential, date_played")
      .eq("ghin_number", r.ghin)
      .not("differential", "is", null)
      .lte("date_played", until)
      .order("date_played", { ascending: false })
      .limit(60);

    const diffs = (rounds ?? [])
      .map((x) => num((x as any).differential))
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
