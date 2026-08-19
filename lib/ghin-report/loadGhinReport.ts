import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALCUTA_2026_HI_WINDOW,
  CCQ_STROKE_INDEX,
  CCQ_TEES_MEN,
  TEE_HI_CUTOFF,
  ccqTeeFromLabel,
  type CcqTeeCode,
} from "./ccqCourse";
import {
  hiToChHp,
  strokesReceivedByHole,
  truncateOneDecimal,
} from "./handicapMath";
import {
  formatInsufficientIndexHistoryNote,
} from "@/lib/handicap-committee/indexHistoryNote";
import {
  assessWhsCaps,
  isoDaysBefore,
  todayMexicoIso,
  WHS_LOW_HI_LOOKBACK_DAYS,
  type WhsCapAssessment,
} from "./whsCaps";
import {
  attachGhinToPlayerIfMissing,
  lookupGhinByPlayerName,
} from "@/lib/ghin-report/lookupGhinByPlayerName";
import { formatDateTickEs } from "./formatDateEs";
import type {
  GhinEscenarioRow,
  GhinHoleAvgRow,
  GhinLiveReportData,
  MonthlyHiPoint,
  ScenarioBar,
  ScenarioKey,
  ScenarioTableRow,
  VerdictStatus,
} from "./types";

function emptyCaps(): WhsCapAssessment {
  return {
    evaluability: "not_evaluable",
    historyDaysAvailable: 0,
    lowHi: null,
    lowHiDisplay: null,
    lowHiProvisional: true,
    softCap: null,
    hardCap: null,
    note: formatInsufficientIndexHistoryNote(0),
  };
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asEscenario(row: Record<string, unknown> | null): GhinEscenarioRow | null {
  if (!row) return null;
  return {
    n_solicitado: Number(row.n_solicitado ?? 0),
    n_usado: Number(row.n_usado ?? 0),
    indice: num(row.indice),
    desde: row.desde != null ? String(row.desde) : null,
    hasta: row.hasta != null ? String(row.hasta) : null,
    es_historico: Boolean(row.es_historico),
    universo: Number(row.universo ?? 0),
  };
}

async function rpcEscenario(
  supabase: SupabaseClient,
  ghin: string,
  n: number,
  ventana: "anio" | "hist3" = "anio"
): Promise<GhinEscenarioRow | null> {
  const { data, error } = await supabase.rpc("f_ghin_escenario", {
    p_ghin: ghin,
    p_n: n,
    p_ventana: ventana,
  });
  if (error) {
    console.error("[ghin-report] f_ghin_escenario", n, error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return asEscenario((row ?? null) as Record<string, unknown> | null);
}

/**
 * HI oficial WHS: promedio (truncado a 1 decimal) de los 8 mejores
 * differentials de las últimas 20 rondas en ghin_rounds.
 */
async function loadWhsOfficial(
  supabase: SupabaseClient,
  ghin: string
): Promise<{ hi: number | null; nLast20: number; nUsed: number }> {
  const { data, error } = await supabase
    .from("ghin_rounds")
    .select("differential, date_played")
    .eq("ghin_number", ghin)
    .not("differential", "is", null)
    .order("date_played", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[ghin-report] whs official", error.message);
    return { hi: null, nLast20: 0, nUsed: 0 };
  }
  const diffs = (data ?? [])
    .map((r) => num((r as { differential: unknown }).differential))
    .filter((x): x is number => x != null);
  if (diffs.length === 0) return { hi: null, nLast20: 0, nUsed: 0 };
  const take = Math.min(8, diffs.length);
  const best = [...diffs].sort((a, b) => a - b).slice(0, take);
  const avg = best.reduce((s, x) => s + x, 0) / best.length;
  return {
    hi: truncateOneDecimal(avg),
    nLast20: diffs.length,
    nUsed: take,
  };
}

/**
 * HI solo competencia: f_ghin_hi_competencia — mejores 8 de CH/CA/ECH/EA
 * en 5 años. Nunca rellenar con el índice oficial si falta muestra.
 * Sin filas → n/d. suficiente=false si n < 8.
 */
async function loadCompetitionHi(
  supabase: SupabaseClient,
  ghin: string
): Promise<{
  hi: number | null;
  n: number;
  nUsed: number;
  suficiente: boolean;
  nd: boolean;
  desde: string | null;
  hasta: string | null;
}> {
  const empty = {
    hi: null as number | null,
    n: 0,
    nUsed: 0,
    suficiente: false,
    nd: true,
    desde: null as string | null,
    hasta: null as string | null,
  };
  const { data, error } = await supabase.rpc("f_ghin_hi_competencia", {
    p_ghin: ghin,
    p_n: 8,
    p_anios: 5,
  });
  if (error) {
    console.error("[ghin-report] f_ghin_hi_competencia", error.message);
    return empty;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!row) return empty;
  const n = Number(row.n_disponible ?? 0);
  const nUsed = Number(row.n_usado ?? 0);
  const hi = num(row.indice);
  if ((n <= 0 && hi == null) || Number.isNaN(n)) return empty;
  return {
    hi,
    n,
    nUsed,
    suficiente: Boolean(row.suficiente),
    nd: hi == null,
    desde: row.desde != null ? String(row.desde) : null,
    hasta: row.hasta != null ? String(row.hasta) : null,
  };
}

async function loadDataCutoffs(
  supabase: SupabaseClient,
  ghin: string
): Promise<{ revisions: string | null; rounds: string | null }> {
  // Revisiones: tope del dataset completo (todas las filas), no del jugador.
  // Rondas: última tarjeta DE ESTE jugador (no el max del club / género).
  const [revRes, roundRes] = await Promise.all([
    supabase
      .from("ghin_index_revisions")
      .select("revision_date")
      .order("revision_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ghin_rounds")
      .select("date_played")
      .eq("ghin_number", ghin)
      .order("date_played", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const revisions =
    revRes.data?.revision_date != null
      ? String(revRes.data.revision_date).slice(0, 10)
      : null;
  const rounds =
    roundRes.data?.date_played != null
      ? String(roundRes.data.date_played).slice(0, 10)
      : null;

  return { revisions, rounds };
}

/**
 * Si hay demasiados puntos, conserva primero/último y mínimos/máximos
 * locales. No promedia ni muestrea a intervalos fijos.
 */
function keepLocalExtrema(pts: MonthlyHiPoint[], maxKeep = 160): MonthlyHiPoint[] {
  if (pts.length <= maxKeep) return pts;
  const idx = new Set<number>([0, pts.length - 1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!.hi;
    const b = pts[i]!.hi;
    const c = pts[i + 1]!.hi;
    if ((b >= a && b > c) || (b > a && b >= c) || (b <= a && b < c) || (b < a && b <= c)) {
      idx.add(i);
    }
  }
  let kept = [...idx].sort((x, y) => x - y).map((i) => pts[i]!);
  if (kept.length <= maxKeep) return kept;
  const scored = kept.map((p, i) => {
    if (i === 0 || i === kept.length - 1) return { p, score: Number.POSITIVE_INFINITY };
    const prev = kept[i - 1]!.hi;
    const next = kept[i + 1]!.hi;
    return { p, score: Math.abs(p.hi - prev) + Math.abs(p.hi - next) };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = new Set(scored.slice(0, maxKeep).map((s) => s.p));
  return kept.filter((p) => top.has(p));
}

async function loadMonthlyHi(
  supabase: SupabaseClient,
  ghin: string,
  /** Tope del dataset; no recorta a 12 meses. */
  revisionsCutoff: string | null
): Promise<MonthlyHiPoint[]> {
  const page = 1000;
  const raw: Array<{ revision_date: string; handicap_index: unknown }> = [];
  for (let from = 0; ; from += page) {
    let q = supabase
      .from("ghin_index_revisions")
      .select("revision_date, handicap_index")
      .eq("ghin_number", ghin)
      .order("revision_date", { ascending: true })
      .range(from, from + page - 1);
    if (revisionsCutoff) q = q.lte("revision_date", revisionsCutoff);
    const { data, error } = await q;
    if (error) {
      console.error("[ghin-report] ghin_index_revisions history", error.message);
      break;
    }
    const rows = data ?? [];
    raw.push(...rows);
    if (rows.length < page) break;
    if (from > 20_000) break;
  }

  const pts: MonthlyHiPoint[] = [];
  for (const row of raw) {
    const d = String(row.revision_date ?? "").slice(0, 10);
    const hi = num(row.handicap_index);
    if (!d || hi == null) continue;
    pts.push({ date: d, label: formatDateTickEs(d), hi });
  }
  return keepLocalExtrema(pts);
}

function pickTeeCode(hi: number | null): CcqTeeCode {
  if (hi != null && hi <= TEE_HI_CUTOFF) return "Azules";
  return "Blancas";
}

function scenarioLabel(
  base: string,
  esc: GhinEscenarioRow | null
): { label: string; period: string | null } {
  if (!esc) return { label: base, period: null };
  if (esc.es_historico) {
    const period =
      esc.desde && esc.hasta ? `${esc.desde} → ${esc.hasta}` : null;
    return {
      label: base.replace("del año", `últimas ${esc.n_usado} rondas`),
      period,
    };
  }
  return { label: base, period: null };
}

function buildScenario(
  key: ScenarioKey,
  labelBase: string,
  color: string,
  index: number | null,
  tee: { slope: number; cr: number; par: number },
  esc: GhinEscenarioRow | null,
  extra?: { sampleShort?: boolean }
): ScenarioBar {
  const { label, period } = scenarioLabel(labelBase, esc);
  const hpParts =
    index != null ? hiToChHp(index, tee.slope, tee.cr, tee.par) : null;
  return {
    key,
    label,
    color,
    index,
    ch: hpParts?.ch ?? null,
    hp: hpParts?.hp ?? null,
    nUsed: esc?.n_usado ?? null,
    nUniverse: esc?.universo ?? null,
    esHistorico: Boolean(esc?.es_historico),
    periodLabel: period,
    sampleShort: extra?.sampleShort,
  };
}

export async function loadGhinLiveReport(
  supabase: SupabaseClient,
  params: { playerId: string; tournamentId?: string | null }
): Promise<GhinLiveReportData | { error: string }> {
  const playerId = params.playerId;
  const tournamentId = params.tournamentId?.trim() || null;

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, ghin_number, gender, handicap_index")
    .eq("id", playerId)
    .maybeSingle();

  if (playerErr || !player) {
    return { error: "Jugador no encontrado" };
  }

  const fullName =
    [player.first_name, player.last_name].filter(Boolean).join(" ").trim() ||
    "Jugador";
  const ghinRaw =
    player.ghin_number != null ? String(player.ghin_number).trim() : "";
  let ghin = ghinRaw || null;
  if (!ghin) {
    const found = await lookupGhinByPlayerName(
      supabase,
      player.first_name,
      player.last_name
    );
    if (found) {
      ghin = found;
      await attachGhinToPlayerIfMissing(supabase, playerId, found);
    }
  }
  const gender = (player.gender ?? "X").toString().toUpperCase() as
    | "M"
    | "F"
    | "X";
  const playerHi = num(player.handicap_index);

  let tournamentName: string | null = null;
  let enrolled = false;
  let entryHi: number | null = null;
  let entryCh: number | null = null;
  let entryHp: number | null = null;
  let teeOverrideReason: string | null = null;
  let teeCode: CcqTeeCode = "Blancas";

  if (tournamentId) {
    const [{ data: tournament }, { data: entry }] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name")
        .eq("id", tournamentId)
        .maybeSingle(),
      supabase
        .from("tournament_entries")
        .select(
          "handicap_index, course_handicap, playing_handicap, tee_set_id_override, tee_set_override_reason"
        )
        .eq("tournament_id", tournamentId)
        .eq("player_id", playerId)
        .maybeSingle(),
    ]);
    tournamentName = (tournament as { name?: string } | null)?.name ?? null;
    if (entry) {
      enrolled = true;
      entryHi = num(entry.handicap_index);
      entryCh = num(entry.course_handicap);
      entryHp = num(entry.playing_handicap);
      teeOverrideReason =
        entry.tee_set_override_reason != null
          ? String(entry.tee_set_override_reason)
          : null;
      const overrideId = entry.tee_set_id_override
        ? String(entry.tee_set_id_override).trim()
        : "";
      let fromOverride: CcqTeeCode | null = null;
      if (overrideId) {
        const { data: ts } = await supabase
          .from("tee_sets")
          .select("code, name")
          .eq("id", overrideId)
          .maybeSingle();
        const row = ts as { code?: string | null; name?: string | null } | null;
        fromOverride =
          ccqTeeFromLabel(row?.name) ?? ccqTeeFromLabel(row?.code);
      }
      teeCode =
        fromOverride ??
        ccqTeeFromLabel(teeOverrideReason) ??
        pickTeeCode(entryHi ?? playerHi);
    }
  }

  const provisional = !enrolled;
  let minIndexFallbackUsed = false;

  // HI del torneo: inscripción; si no, f_ghin_min_index; si null → players.handicap_index
  // LIMITACIÓN: ghin_index_revisions arranca 2026-05-01; sin carry-in el mínimo
  // puede salir 0.3–0.8 más alto o null. Fallback a players.handicap_index.
  let hiTorneo = entryHi;
  if (hiTorneo == null && ghin) {
    const { data: minIdx, error: minErr } = await supabase.rpc(
      "f_ghin_min_index",
      {
        p_ghin: ghin,
        p_desde: CALCUTA_2026_HI_WINDOW.desde,
        p_hasta: CALCUTA_2026_HI_WINDOW.hasta,
      }
    );
    if (minErr) {
      console.error("[ghin-report] f_ghin_min_index", minErr.message);
    }
    hiTorneo = num(minIdx);
    if (hiTorneo == null) {
      hiTorneo = playerHi;
      minIndexFallbackUsed = true;
    }
  } else if (hiTorneo == null) {
    hiTorneo = playerHi;
    minIndexFallbackUsed = true;
  }

  if (provisional) {
    teeCode = pickTeeCode(hiTorneo);
  }

  const tee = CCQ_TEES_MEN[teeCode];
  const computed =
    hiTorneo != null ? hiToChHp(hiTorneo, tee.slope, tee.cr, tee.par) : null;
  // Inscritos: CH/HP guardados son la fuente de verdad (el 80 % se aplicó
  // al CH decimal). Recalcular desde el CH entero cambia un golpe.
  const ch100 =
    enrolled && entryCh != null ? entryCh : (computed?.ch ?? null);
  const hp80 =
    enrolled && entryHp != null ? entryHp : (computed?.hp ?? null);

  if (!ghin) {
    return {
      playerId,
      fullName,
      ghin: null,
      gender,
      tournamentId,
      tournamentName,
      enrolled,
      provisional,
      teeCode,
      teeCr: tee.cr,
      teeSlope: tee.slope,
      teePar: tee.par,
      hiTorneo,
      hiWhsOfficial: null,
      hiBest10Year: null,
      hiBest10Historico: false,
      hiSoloTorneos: null,
      hiSoloTorneosN: 0,
      hiSoloTorneosNUsed: 0,
      hiSoloTorneosNd: true,
      hiSoloTorneosSuficiente: false,
      ch100,
      hp80,
      activity: null,
      scenarios: [],
      scenarioTable: [],
      monthlyHi: [],
      holes: [],
      holesHistorico: false,
      holesPeriod: null,
      strokesByHole: strokesReceivedByHole(hp80 ?? 0, CCQ_STROKE_INDEX),
      netAvgs: [],
      netBest10: [],
      verdict: "sin_datos",
      verdictNote: "El jugador no tiene número GHIN ligado.",
      anyHistorico: false,
      minIndexFallbackUsed,
      caps: emptyCaps(),
      dataCutoffs: { revisions: null, rounds: null },
    };
  }

  const dataCutoffs = await loadDataCutoffs(supabase, ghin);

  // Low HI / caps: ventana 365 días anclada al corte de revisiones (no a
  // new Date() del servidor si el dataset aún no llega ahí).
  const capAsOf = dataCutoffs.revisions ?? todayMexicoIso();
  const lowHiDesde = isoDaysBefore(capAsOf, WHS_LOW_HI_LOOKBACK_DAYS - 1);

  const [playerFirstRevRes, lowHiRpc] = await Promise.all([
    supabase
      .from("ghin_index_revisions")
      .select("revision_date")
      .eq("ghin_number", ghin)
      .order("revision_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("f_ghin_min_index", {
      p_ghin: ghin,
      p_desde: lowHiDesde,
      p_hasta: capAsOf,
    }),
  ]);

  const playerFirstRevision =
    playerFirstRevRes.data?.revision_date != null
      ? String(playerFirstRevRes.data.revision_date).slice(0, 10)
      : null;
  const capsRaw = assessWhsCaps({
    lowHiFromFn: num(lowHiRpc.data),
    playerHiFallback: playerHi,
    playerFirstRevision,
    asOfIso: todayMexicoIso(),
  });
  // Misma redacción en selección / voto / reporte.
  const caps: WhsCapAssessment =
    capsRaw.evaluability === "not_evaluable"
      ? {
          ...capsRaw,
          note: formatInsufficientIndexHistoryNote(
            capsRaw.historyDaysAvailable
          ),
        }
      : capsRaw;

  const [
    activityRes,
    esc8,
    esc10,
    esc15,
    esc20,
    whsOfficial,
    compHi,
    monthlyHi,
    holesRes,
  ] = await Promise.all([
    supabase
      .from("v_ghin_player_activity")
      .select("*")
      .eq("ghin_number", ghin)
      .maybeSingle(),
    rpcEscenario(supabase, ghin, 8, "anio"),
    rpcEscenario(supabase, ghin, 10, "anio"),
    rpcEscenario(supabase, ghin, 15, "anio"),
    rpcEscenario(supabase, ghin, 20, "anio"),
    loadWhsOfficial(supabase, ghin),
    loadCompetitionHi(supabase, ghin),
    loadMonthlyHi(supabase, ghin, dataCutoffs.revisions),
    supabase.rpc("f_ghin_holes_avg", { p_ghin: ghin, p_min_rondas: 10 }),
  ]);

  const activityRow = activityRes.data as Record<string, unknown> | null;
  const activity = activityRow
    ? {
        rondasTotal: Number(activityRow.rondas_total ?? 0),
        rondasAnio: Number(activityRow.rondas_anio_actual ?? 0),
        rondas3Anios: Number(activityRow.rondas_3_anios ?? 0),
        difPromAnio: num(activityRow.dif_prom_anio),
        primera:
          activityRow.primera_ronda != null
            ? String(activityRow.primera_ronda)
            : null,
        ultima:
          activityRow.ultima_ronda != null
            ? String(activityRow.ultima_ronda)
            : null,
      }
    : null;

  const holesRaw = Array.isArray(holesRes.data) ? holesRes.data : [];
  const holes: GhinHoleAvgRow[] = holesRaw
    .map((r: Record<string, unknown>) => ({
      hoyo: Number(r.hoyo),
      promedio: num(r.promedio),
      promedio_mejores10: num(r.promedio_mejores10),
      n_rondas: Number(r.n_rondas ?? 0),
      desde: r.desde != null ? String(r.desde) : null,
      hasta: r.hasta != null ? String(r.hasta) : null,
      es_historico: Boolean(r.es_historico),
    }))
    .filter((h) => Number.isFinite(h.hoyo))
    .sort((a, b) => a.hoyo - b.hoyo);

  const holesHistorico = holes.some((h) => h.es_historico);
  const holesPeriod =
    holes[0]?.desde && holes[0]?.hasta
      ? `${holes[0].desde} → ${holes[0].hasta}`
      : null;

  const teeParams = { slope: tee.slope, cr: tee.cr, par: tee.par };

  const scenarios: ScenarioBar[] = [
    buildScenario(
      "hi_torneo",
      "HI del torneo",
      "#f0932b",
      hiTorneo,
      teeParams,
      hiTorneo != null
        ? {
            n_solicitado: 0,
            n_usado: 0,
            indice: hiTorneo,
            desde: null,
            hasta: null,
            es_historico: false,
            universo: 0,
          }
        : null
    ),
    buildScenario(
      "whs_8_20",
      "Mejores 8 de últimas 20",
      "#2ecc71",
      whsOfficial.hi,
      teeParams,
      null
    ),
    ...(compHi.nd
      ? []
      : [
          buildScenario(
            "solo_comp",
            "Solo competencia",
            "#a29bfe",
            compHi.hi,
            teeParams,
            {
              n_solicitado: 8,
              n_usado: compHi.nUsed,
              indice: compHi.hi,
              desde: compHi.desde,
              hasta: compHi.hasta,
              es_historico: false,
              universo: compHi.n,
            },
            { sampleShort: !compHi.suficiente }
          ),
        ]),
    buildScenario(
      "best_8_year",
      "Mejores 8 del año",
      "#e74c3c",
      esc8?.indice ?? null,
      teeParams,
      esc8
    ),
    buildScenario(
      "best_10_year",
      "Mejores 10 del año",
      "#e74c3c",
      esc10?.indice ?? null,
      teeParams,
      esc10
    ),
    buildScenario(
      "best_15_year",
      "Mejores 15 del año",
      "#e74c3c",
      esc15?.indice ?? null,
      teeParams,
      esc15
    ),
    buildScenario(
      "best_20_year",
      "Mejores 20 del año",
      "#e74c3c",
      esc20?.indice ?? null,
      teeParams,
      esc20
    ),
    buildScenario(
      "avg_all_year",
      "Promedio de todas",
      "#8fa3b8",
      activity?.difPromAnio ?? null,
      teeParams,
      activity?.difPromAnio != null
        ? {
            n_solicitado: activity.rondasAnio,
            n_usado: activity.rondasAnio,
            indice: activity.difPromAnio,
            desde: null,
            hasta: null,
            es_historico: false,
            universo: activity.rondasAnio,
          }
        : null
    ),
  ];

  // Rellenar nUsed/universo WHS
  const whsBar = scenarios.find((s) => s.key === "whs_8_20");
  if (whsBar) {
    whsBar.nUsed = whsOfficial.nUsed;
    whsBar.nUniverse = whsOfficial.nLast20;
  }

  const scenarioTable: ScenarioTableRow[] = [
    ...scenarios.map((s) => ({
      ...s,
      deltaHi:
        hiTorneo != null && s.index != null
          ? Math.round((s.index - hiTorneo) * 10) / 10
          : null,
      deltaHp: hp80 != null && s.hp != null ? s.hp - hp80 : null,
    })),
    ...(compHi.nd
      ? [
          {
            key: "solo_comp" as const,
            label: "Solo competencia",
            color: "#a29bfe",
            index: null,
            ch: null,
            hp: null,
            nUsed: 0,
            nUniverse: 0,
            esHistorico: false,
            periodLabel: "Sin rondas de competencia (CH/CA) en 5 años",
            sampleShort: true,
            deltaHi: null,
            deltaHp: null,
          },
        ]
      : []),
  ];

  const strokes = strokesReceivedByHole(hp80 ?? 0, CCQ_STROKE_INDEX);
  const netAvgs = holes.map((h, i) => {
    const avg = h.promedio;
    return avg != null && Number.isFinite(avg) ? avg - (strokes[i] ?? 0) : 0;
  });
  const netBest10 = holes.map((h, i) => {
    const avg = h.promedio_mejores10;
    return avg != null && Number.isFinite(avg) ? avg - (strokes[i] ?? 0) : 0;
  });

  const anyHistorico =
    holesHistorico ||
    scenarios.some((s) => s.esHistorico) ||
    Boolean(esc10?.es_historico);

  let verdict: VerdictStatus = "normal";
  let verdictNote: string | null = null;
  const enoughRounds =
    (activity?.rondas3Anios ?? 0) >= 10 ||
    (holes[0]?.n_rondas ?? 0) >= 10;

  if (!enoughRounds) {
    verdict = "sin_datos";
    verdictNote =
      "Menos de 10 rondas incluso retrocediendo 3 años. Sin datos suficientes.";
  } else {
    const over = scenarioTable.some(
      (s) =>
        s.key !== "hi_torneo" &&
        !s.sampleShort &&
        s.deltaHi != null &&
        Math.abs(s.deltaHi) > 1
    );
    if (over) {
      verdict = "revisar";
      verdictNote = anyHistorico
        ? "Alguna diferencia > 1 golpe (dato histórico). El comité decide."
        : "Alguna diferencia > 1 golpe respecto al HI del torneo.";
    } else {
      verdictNote = anyHistorico
        ? "Diferencias ≤ 1 golpe (cálculos con dato histórico)."
        : "Todas las diferencias ≤ 1 golpe.";
    }
  }

  return {
    playerId,
    fullName,
    ghin,
    gender,
    tournamentId,
    tournamentName,
    enrolled,
    provisional,
    teeCode,
    teeCr: tee.cr,
    teeSlope: tee.slope,
    teePar: tee.par,
    hiTorneo,
    hiWhsOfficial: whsOfficial.hi,
    hiBest10Year: esc10?.indice ?? null,
    hiBest10Historico: Boolean(esc10?.es_historico),
    hiSoloTorneos: compHi.hi,
    hiSoloTorneosN: compHi.n,
    hiSoloTorneosNUsed: compHi.nUsed,
    hiSoloTorneosNd: compHi.nd,
    hiSoloTorneosSuficiente: compHi.suficiente,
    ch100,
    hp80,
    activity,
    scenarios,
    scenarioTable,
    monthlyHi,
    holes,
    holesHistorico,
    holesPeriod,
    strokesByHole: strokes,
    netAvgs,
    netBest10,
    verdict,
    verdictNote,
    anyHistorico,
    minIndexFallbackUsed,
    caps,
    dataCutoffs,
  };
}

/** Helper exportado para tests / validación comité. */
export function validateBlancas256() {
  return hiToChHp(25.6, 127, 70.7, 72);
}
