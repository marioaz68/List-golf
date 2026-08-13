import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALCUTA_2026_HI_WINDOW,
  CCQ_STROKE_INDEX,
  CCQ_TEES_MEN,
  TEE_HI_CUTOFF,
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
import type {
  GhinEscenarioRow,
  GhinHoleAvgRow,
  GhinLiveReportData,
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
): Promise<number | null> {
  const { data, error } = await supabase
    .from("ghin_rounds")
    .select("differential, date_played")
    .eq("ghin_number", ghin)
    .not("differential", "is", null)
    .order("date_played", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[ghin-report] whs official", error.message);
    return null;
  }
  const diffs = (data ?? [])
    .map((r) => num((r as { differential: unknown }).differential))
    .filter((x): x is number => x != null);
  if (diffs.length === 0) return null;
  const take = Math.min(8, diffs.length);
  const best = [...diffs].sort((a, b) => a - b).slice(0, take);
  const avg = best.reduce((s, x) => s + x, 0) / best.length;
  return truncateOneDecimal(avg);
}

/**
 * HI solo torneos: mejores 8 de últimas 20 competencia.
 * Si n < 20 → n/d (casi todos los socios).
 */
async function loadCompetitionHi(
  supabase: SupabaseClient,
  ghin: string
): Promise<{ hi: number | null; n: number; nd: boolean }> {
  const { data: summary } = await supabase
    .from("v_ghin_competition_summary")
    .select("rondas_comp")
    .eq("ghin_number", ghin)
    .maybeSingle();

  let n = num((summary as { rondas_comp?: unknown } | null)?.rondas_comp) ?? 0;

  if (n === 0) {
    const { count } = await supabase
      .from("ghin_competition_rounds")
      .select("id", { count: "exact", head: true })
      .eq("ghin_number", ghin);
    n = count ?? 0;
  }

  if (n < 20) {
    return { hi: null, n, nd: true };
  }

  const { data, error } = await supabase
    .from("ghin_competition_rounds")
    .select("differential, date_played")
    .eq("ghin_number", ghin)
    .not("differential", "is", null)
    .order("date_played", { ascending: false })
    .limit(20);
  if (error || !data?.length) {
    return { hi: null, n, nd: true };
  }
  const diffs = data
    .map((r) => num((r as { differential: unknown }).differential))
    .filter((x): x is number => x != null);
  const best = [...diffs].sort((a, b) => a - b).slice(0, 8);
  const avg = best.reduce((s, x) => s + x, 0) / best.length;
  return { hi: truncateOneDecimal(avg), n, nd: false };
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

async function loadMonthlyHi(
  supabase: SupabaseClient,
  ghin: string,
  /** Ancla del historial: corte real de revisiones, no "hoy". */
  revisionsCutoff: string | null
): Promise<{ month: string; label: string; hi: number }[]> {
  const untilStr = revisionsCutoff ?? "1970-01-01";
  const until = new Date(`${untilStr}T12:00:00`);
  const since = new Date(until);
  since.setMonth(since.getMonth() - 12);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("ghin_index_revisions")
    .select("revision_date, handicap_index")
    .eq("ghin_number", ghin)
    .gte("revision_date", sinceStr)
    .lte("revision_date", untilStr)
    .order("revision_date", { ascending: true });

  if (error || !data?.length) return [];

  // Última revisión de cada mes
  const byMonth = new Map<string, number>();
  for (const row of data) {
    const d = String((row as { revision_date: string }).revision_date);
    const hi = num((row as { handicap_index: unknown }).handicap_index);
    if (hi == null) continue;
    const month = d.slice(0, 7);
    byMonth.set(month, hi);
  }

  const months = [...byMonth.keys()].sort();
  const MONTH_SHORT = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return months.map((month) => {
    const [, mm] = month.split("-");
    const mi = Math.max(0, Number(mm) - 1);
    return {
      month,
      label: MONTH_SHORT[mi] ?? month,
      hi: byMonth.get(month)!,
    };
  });
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
  esc: GhinEscenarioRow | null
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
  const ghin = ghinRaw || null;
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
      // Inferir tee desde reason o dejar Blancas/Azules por HI
      const reason = (teeOverrideReason ?? "").toLowerCase();
      if (reason.includes("azul")) teeCode = "Azules";
      else if (reason.includes("dorad")) teeCode = "Doradas";
      else if (reason.includes("blanc")) teeCode = "Blancas";
      else teeCode = pickTeeCode(entryHi ?? playerHi);
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
  const computed = hiTorneo != null ? hiToChHp(hiTorneo, tee.slope, tee.cr, tee.par) : null;
  const ch100 = enrolled && entryCh != null ? entryCh : computed?.ch ?? null;
  const hp80 = enrolled && entryHp != null ? entryHp : computed?.hp ?? null;

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
      hiSoloTorneosNd: true,
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
      promedio: Number(r.promedio),
      promedio_mejores10: Number(r.promedio_mejores10),
      n_rondas: Number(r.n_rondas ?? 0),
      desde: r.desde != null ? String(r.desde) : null,
      hasta: r.hasta != null ? String(r.hasta) : null,
      es_historico: Boolean(r.es_historico),
    }))
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
      whsOfficial,
      teeParams,
      null
    ),
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
    whsBar.nUsed = Math.min(8, 20);
    whsBar.nUniverse = 20;
  }

  const scenarioTable: ScenarioTableRow[] = scenarios.map((s) => ({
    ...s,
    deltaHi:
      hiTorneo != null && s.index != null
        ? Math.round((s.index - hiTorneo) * 10) / 10
        : null,
    deltaHp:
      hp80 != null && s.hp != null ? s.hp - hp80 : null,
  }));

  const strokes = strokesReceivedByHole(hp80 ?? 0, CCQ_STROKE_INDEX);
  const netAvgs = holes.map((h, i) =>
    Number.isFinite(h.promedio) ? h.promedio - (strokes[i] ?? 0) : 0
  );
  const netBest10 = holes.map((h, i) =>
    Number.isFinite(h.promedio_mejores10)
      ? h.promedio_mejores10 - (strokes[i] ?? 0)
      : 0
  );

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
    hiWhsOfficial: whsOfficial,
    hiBest10Year: esc10?.indice ?? null,
    hiBest10Historico: Boolean(esc10?.es_historico),
    hiSoloTorneos: compHi.hi,
    hiSoloTorneosN: compHi.n,
    hiSoloTorneosNd: compHi.nd,
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
