import { buildCutRulesCcQ } from "../buildCutRules";
import { buildPrizeRulesFromCompetition } from "../buildPrizeRules";
import type { ConvocatoriaDraft } from "../types";

/**
 * Plantilla alineada a: Convocatoria 68º Torneo Anual CCQ (oct 2025).
 * 54 hoyos · corte a 36 · máx. 50% por categoría · 11 categorías.
 */
export function ccqTorneoAnualMachote(
  overrides?: Partial<ConvocatoriaDraft["meta"]>
): ConvocatoriaDraft {
  const meta = {
    title: "68º Torneo Anual",
    total_holes: 54,
    cut_after_holes: 36,
    cut_percent: 50,
    round_count: 3,
    practice_day:
      "Martes 14 de octubre — día de práctica (no socios CCQ: reservación + recibo de pago).",
    handicap_index_date: "1 de octubre de 2025 (FMG/GHIN, SPEI, TeeTime)",
    ...overrides,
  };

  const categories: ConvocatoriaDraft["categories"] = [
    {
      code: "CAMP",
      name: "Campeonato",
      gender: "M",
      category_group: "main",
      handicap_min: 2.7,
      handicap_max: 3.0,
      min_age: null,
      max_age: null,
      tee_hint: "Negras",
      format_notes: "Stroke Play sin hándicap",
      has_cut: true,
    },
    {
      code: "AA",
      name: "AA",
      gender: "M",
      category_group: "main",
      handicap_min: 2.8,
      handicap_max: 6.4,
      min_age: null,
      max_age: null,
      tee_hint: "Azules",
      format_notes: "Stroke Play sin hándicap",
      has_cut: true,
    },
    {
      code: "A",
      name: "A",
      gender: "M",
      category_group: "main",
      handicap_min: 6.5,
      handicap_max: 11.3,
      min_age: null,
      max_age: null,
      tee_hint: "Blancas",
      format_notes: "Stroke Play sin hándicap",
      has_cut: true,
    },
    {
      code: "B",
      name: "B",
      gender: "M",
      category_group: "main",
      handicap_min: 11.4,
      handicap_max: 15.8,
      min_age: null,
      max_age: null,
      tee_hint: "Blancas",
      format_notes: "Stroke Play sin hándicap",
      has_cut: true,
    },
    {
      code: "C",
      name: "C",
      gender: "M",
      category_group: "main",
      handicap_min: 15.9,
      handicap_max: 22.0,
      min_age: null,
      max_age: null,
      tee_hint: "Blancas",
      format_notes: "Stroke Play sin hándicap",
      has_cut: true,
    },
    {
      code: "DE",
      name: "Abierta (D-E)",
      gender: "M",
      category_group: "main",
      handicap_min: 22.1,
      handicap_max: 33.6,
      min_age: null,
      max_age: null,
      tee_hint: "Blancas",
      format_notes: "Stableford (juego por puntos) al 80% del hándicap",
      has_cut: true,
    },
    {
      code: "SEN",
      name: "Seniors",
      gender: "M",
      category_group: "senior",
      handicap_min: 0,
      handicap_max: 33.6,
      min_age: 58,
      max_age: 64,
      tee_hint: "Blancas",
      format_notes: "Stroke Play al 80% · 54 hoyos con corte a 36",
      has_cut: true,
    },
    {
      code: "SS",
      name: "Super Seniors",
      gender: "M",
      category_group: "super_senior",
      handicap_min: 0,
      handicap_max: 37.5,
      min_age: 65,
      max_age: null,
      tee_hint: "Doradas",
      format_notes: "Stroke Play al 80% · 54 hoyos con corte a 36",
      has_cut: true,
    },
    {
      code: "DA",
      name: "Damas A",
      gender: "F",
      category_group: "ladies",
      handicap_min: 3.0,
      handicap_max: 14.1,
      min_age: null,
      max_age: null,
      tee_hint: "Blancas / Rojas",
      format_notes:
        "Stroke Play al 80% · sin corte · H.I. +3.0 a 4.1 (Blancas) o 4.2 a 14.1 (Rojas)",
      has_cut: false,
    },
    {
      code: "DB",
      name: "Damas B",
      gender: "F",
      category_group: "ladies",
      handicap_min: 14.2,
      handicap_max: 20.7,
      min_age: null,
      max_age: null,
      tee_hint: "Rojas",
      format_notes: "Stroke Play al 80% · 54 hoyos sin corte",
      has_cut: false,
    },
    {
      code: "DC",
      name: "Damas C",
      gender: "F",
      category_group: "ladies",
      handicap_min: 20.8,
      handicap_max: 34.0,
      min_age: null,
      max_age: null,
      tee_hint: "Rojas",
      format_notes: "Stableford al 80% · 54 hoyos sin corte",
      has_cut: false,
    },
  ];

  const competition_rules: ConvocatoriaDraft["competition_rules"] = [
    {
      category_code: "CAMP",
      scoring_format: "stroke_play",
      leaderboard_basis: "gross",
      prize_basis: "gross",
      handicap_percentage: 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: "Trofeos: 1º, 2º y 3º lugar Gross",
    },
    {
      category_code: "AA",
      scoring_format: "stroke_play",
      leaderboard_basis: "gross",
      prize_basis: "gross",
      handicap_percentage: 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: null,
    },
    {
      category_code: "A",
      scoring_format: "stroke_play",
      leaderboard_basis: "gross",
      prize_basis: "gross",
      handicap_percentage: 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: null,
    },
    {
      category_code: "B",
      scoring_format: "stroke_play",
      leaderboard_basis: "gross",
      prize_basis: "gross",
      handicap_percentage: 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: null,
    },
    {
      category_code: "C",
      scoring_format: "stroke_play",
      leaderboard_basis: "gross",
      prize_basis: "gross",
      handicap_percentage: 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: null,
    },
    {
      category_code: "DE",
      scoring_format: "stableford",
      leaderboard_basis: "stableford",
      prize_basis: "stableford",
      handicap_percentage: 80,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: "Trofeos: 1º, 2º y 3º por puntos",
    },
    {
      category_code: "SEN",
      scoring_format: "stroke_play",
      leaderboard_basis: "net",
      prize_basis: "both",
      handicap_percentage: 80,
      gross_prize_places: 1,
      net_prize_places: 3,
      notes: "1º Gross + 1º, 2º y 3º Neto",
    },
    {
      category_code: "SS",
      scoring_format: "stroke_play",
      leaderboard_basis: "net",
      prize_basis: "both",
      handicap_percentage: 80,
      gross_prize_places: 1,
      net_prize_places: 3,
      notes: "1º Gross + 1º, 2º y 3º Neto",
    },
    {
      category_code: "DA",
      scoring_format: "stroke_play",
      leaderboard_basis: "net",
      prize_basis: "both",
      handicap_percentage: 80,
      gross_prize_places: 1,
      net_prize_places: 3,
      notes: "1º Gross + 1º, 2º y 3º Neto + premio especial mejor socia",
    },
    {
      category_code: "DB",
      scoring_format: "stroke_play",
      leaderboard_basis: "net",
      prize_basis: "both",
      handicap_percentage: 80,
      gross_prize_places: 1,
      net_prize_places: 3,
      notes: "1º Gross + 1º, 2º y 3º Neto",
    },
    {
      category_code: "DC",
      scoring_format: "stableford",
      leaderboard_basis: "stableford",
      prize_basis: "stableford",
      handicap_percentage: 80,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: "Trofeos: 1º, 2º y 3º por puntos (como Abierta)",
    },
  ];

  const cut_rules = buildCutRulesCcQ(meta);
  const prize_rules = buildPrizeRulesFromCompetition(competition_rules);

  const reference = {
    system:
      "54 hoyos con corte a 36 hoyos. Corte máximo 50% por categoría (adaptable por logística). Reglas USGA / FMG.",
    gentlemen:
      "Campeonato, AA, A, B y C: Stroke Play sin hándicap. Abierta (D-E): Stableford al 80%.",
    ladies:
      "Damas A y B: 54 hoyos sin corte, Stroke al 80%. Damas C: 54 hoyos sin corte, Stableford al 80%.",
    seniors_ages:
      "Seniors: 58–64 años cumplidos al 15 de octubre. Super Seniors: 65 años o más cumplidos al 15 de octubre.",
    cut_policy:
      "Corte: 50% redondeado a la baja sobre inscritos = cupo exacto (70→35). Empates en el límite se resuelven con desempate (no pasan todos los empatados).",
    cut_tiebreak_gross:
      "Camp., AA, A, B, C: mejor score hoyos 10–18 del 2º día; luego 13–18, 16–18, 18, 1–9, 4–9, 7–9, 9.",
    cut_tiebreak_stableford:
      "Abierta (D-E): puntos en 10–18, luego 13–18, etc. (misma secuencia que gross).",
    cut_tiebreak_seniors:
      "Seniors / Super Seniors: score neto 2 días; empate → gross 10–18 menos PH campo al 80% de esa vuelta.",
    trophy_tiebreak:
      "Trofeos gross (Camp.–C): retrogresión 9-6-3-1 en hoyos 10–18 ronda final. Neto (Damas A/B, SEN, SS): idem con PH 80%. Abierta y Damas C: menor H.I. y luego retrogresión por puntos 10–18.",
    trophies:
      "3 primeros: Camp., AA, A, B, C, Abierta, Damas C (gross o puntos). SEN/SS: 1 gross + 3 neto. DA/DB: 1 gross + 3 neto. Premios especiales: mejor socia DA y mejor socio Camp.",
    out_of_scope:
      "Hole in One, O'Yes, premio diario (tequila), Putt, Approach, Drive, rifas — no se generan en parámetros automáticos.",
  };

  return {
    version: 1,
    source: "template",
    meta,
    reference,
    categories,
    competition_rules,
    cut_rules,
    prize_rules,
    warnings: [
      "Plantilla alineada a convocatoria 68º Torneo Anual CCQ. Revisa fechas y número de edición.",
      "Damas A tiene dos bandas de H.I. en la convocatoria; el rango 3.0–14.1 cubre ambas para inscripción.",
      reference.out_of_scope,
    ],
  };
}
