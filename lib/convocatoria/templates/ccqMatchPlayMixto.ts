import type { ConvocatoriaDraft } from "../types";
import {
  DEFAULT_STROKE_AGGREGATE_TIEBREAKERS,
  type MatchPlayConvocatoriaConfig,
} from "@/lib/matchplay/types";

/**
 * Plantilla machote: Match Play de Parejas Mixto CCQ 2026 (4–7 jun 2026).
 * Categoría única, parejas mixtas, calcuta para siembra, consolaciones MP y stroke.
 */
export function ccqMatchPlayMixto(opts?: {
  title?: string | null;
}): ConvocatoriaDraft {
  const title =
    opts?.title?.trim() || "Torneo Match Play de Parejas Mixto CCQ 2026";

  const mp: MatchPlayConvocatoriaConfig = {
    match_type: "pairs",
    pair_format: "fourball",
    bracket_type: "single_elim_consolation",
    category_basis: "open",
    handicap_allowance: "custom",
    handicap_allowance_custom_pct: 80,
    match_tiebreaker: "sudden_death",
    holes_per_match: 18,
    // 32 parejas → 5 rondas (1/16, 1/8, cuartos, semis, final). 5 victorias para ser campeón.
    bracket_round_count: 5,
    max_pairs_per_category: 32,
    seeding_method: "auction",
    prize_places: 4,

    pair_composition: "mixed_one_each",
    combined_hi_min: 14.0,
    combined_hi_max: 34.9,
    play_in_enabled: false,
    bracket_main_pairs: 32,

    auction: {
      enabled: true,
      pot_percent_of_total: 90,
      min_bid: 10000,
      max_bid: 40000,
      player_cover_percent: 20,
      currency: "MXN",
    },

    consolations: [
      {
        enabled: true,
        from_round_no: 3,
        consolation_format: "match_play",
        prize_label: "Consolación Match Play",
        prize_percent: 8,
        match_play_tiebreaker: "sudden_death",
      },
      {
        enabled: true,
        from_round_no: 0,
        consolation_format: "stroke_play_aggregate",
        prize_label: "Stroke Play Agregado (80% HI)",
        prize_percent: 7,
        stroke_aggregate_tiebreakers: [...DEFAULT_STROKE_AGGREGATE_TIEBREAKERS],
      },
    ],

    prize_shares: [
      { position: 1, label: "Campeones", percent: 43, source: "match_play" },
      { position: 2, label: "Subcampeones", percent: 20, source: "match_play" },
      { position: 3, label: "3er Lugar", percent: 12, source: "match_play" },
      { position: 4, label: "4to Lugar", percent: 10, source: "match_play" },
      {
        position: 1,
        label: "Consolación Match Play",
        percent: 8,
        source: "consolation_match_play",
      },
      {
        position: 1,
        label: "Stroke Play Agregado",
        percent: 7,
        source: "stroke_play_aggregate",
      },
    ],

    trophies: [
      {
        position: 1,
        label: "Trofeo Campeón",
        count_per_team: 2,
        source: "match_play",
      },
    ],

    rules_text:
      "Cada jugador da/recibe ventajas vs el jugador correspondiente (menor HI vs menor HI, mayor vs mayor) al 80% del hándicap de campo. Empate de match: muerte súbita desde hoyo 1. Stroke Play Agregado: 80% HI, suma neto pareja; desempate por retrocesión hoyos 10-18, 13-18, 16-18, 18, 1-9, 4-9, 7-9, 9.",

    reference_notes:
      "Convocatoria CCQ 2026 — Match Play Parejas Mixto. Sede: Club Campestre de Querétaro.",
  };

  return {
    version: 1,
    tournament_mode: "matchplay",
    source: "template",
    meta: {
      title,
      total_holes: 18,
      cut_after_holes: null,
      cut_percent: null,
      round_count: 5,
      practice_day: null,
      handicap_index_date: "2026-02-20 al 2026-05-20",
    },
    matchplay: mp,
    categories: [
      {
        code: "MIXTO",
        name: "Mixto (única)",
        gender: "X",
        category_group: "mixed",
        handicap_min: 0,
        handicap_max: 34.0,
        min_age: 18,
        max_age: null,
        tee_hint: "Caballeros: Azules / Blancas / Doradas · Damas: Rojas / Blancas",
        format_notes:
          "Pareja 1 dama + 1 caballero. Suma HI: 14.0 mín, 34.9 máx. 80% hándicap de campo.",
        has_cut: false,
      },
    ],
    competition_rules: [],
    cut_rules: [],
    prize_rules: [
      {
        category_code: "MIXTO",
        prize_position: 1,
        prize_label: "Campeones (43% bolsa)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "MIXTO",
      },
      {
        category_code: "MIXTO",
        prize_position: 2,
        prize_label: "Subcampeones (20% bolsa)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "MIXTO",
      },
      {
        category_code: "MIXTO",
        prize_position: 3,
        prize_label: "3er Lugar (12% bolsa)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "MIXTO",
      },
      {
        category_code: "MIXTO",
        prize_position: 4,
        prize_label: "4to Lugar (10% bolsa)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "MIXTO",
      },
    ],
    warnings: [
      "Torneo CCQ Mixto 2026: bolsa = 90% de subasta; siembra por subasta (calcuta).",
      "Mínimo 16 parejas inscritas al 3 de junio para realizar el torneo.",
      "Edades/marcas de salida (Azul ≤6.4, Blanca 6.5-25.6, Doradas ≥65, Damas Rojas >5.9, Blancas ≤5.8) se aplican por jugador en sets de salida.",
    ],
  };
}
