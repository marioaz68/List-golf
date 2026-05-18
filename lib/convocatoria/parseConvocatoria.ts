import { buildCutRulesCcQ } from "./buildCutRules";
import { buildPrizeRulesFromCompetition } from "./buildPrizeRules";
import { ccqTorneoAnualMachote } from "./templates/ccqTorneoAnualMachote";
import type {
  ConvocatoriaDraft,
  DraftCategory,
  DraftCompetitionRule,
} from "./types";

const CATEGORY_DEFS: Array<{
  patterns: RegExp[];
  code: string;
  name: string;
  gender: DraftCategory["gender"];
  category_group: DraftCategory["category_group"];
  default_has_cut: boolean;
  default_hi?: { min: number; max: number };
  default_tee?: string;
  default_format_notes?: string;
}> = [
  {
    patterns: [/^campeonato$/i],
    code: "CAMP",
    name: "Campeonato",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 2.7, max: 3.0 },
    default_tee: "Negras",
    default_format_notes: "Stroke Play sin hándicap",
  },
  {
    patterns: [/^aa$/i],
    code: "AA",
    name: "AA",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 2.8, max: 6.4 },
    default_tee: "Azules",
    default_format_notes: "Stroke Play sin hándicap",
  },
  {
    patterns: [/^a$/i],
    code: "A",
    name: "A",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 6.5, max: 11.3 },
    default_tee: "Blancas",
    default_format_notes: "Stroke Play sin hándicap",
  },
  {
    patterns: [/^b$/i],
    code: "B",
    name: "B",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 11.4, max: 15.8 },
    default_tee: "Blancas",
    default_format_notes: "Stroke Play sin hándicap",
  },
  {
    patterns: [/^c$/i],
    code: "C",
    name: "C",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 15.9, max: 22.0 },
    default_tee: "Blancas",
    default_format_notes: "Stroke Play sin hándicap",
  },
  {
    patterns: [/abierta/i, /\(d-e\)/i, /^d-e$/i, /^de$/i],
    code: "DE",
    name: "Abierta (D-E)",
    gender: "M",
    category_group: "main",
    default_has_cut: true,
    default_hi: { min: 22.1, max: 33.6 },
    default_tee: "Blancas",
    default_format_notes: "Stableford (juego por puntos) al 80% del hándicap",
  },
  {
    patterns: [/^seniors?$/i],
    code: "SEN",
    name: "Seniors",
    gender: "M",
    category_group: "senior",
    default_has_cut: true,
    default_hi: { min: 0, max: 33.6 },
    default_tee: "Blancas",
    default_format_notes: "Stroke Play al 80% · 54 hoyos con corte a 36",
  },
  {
    patterns: [/super\s*seniors?/i],
    code: "SS",
    name: "Super Seniors",
    gender: "M",
    category_group: "super_senior",
    default_has_cut: true,
    default_hi: { min: 0, max: 37.5 },
    default_tee: "Doradas",
    default_format_notes: "Stroke Play al 80% · 54 hoyos con corte a 36",
  },
  {
    patterns: [/damas\s*a/i],
    code: "DA",
    name: "Damas A",
    gender: "F",
    category_group: "ladies",
    default_has_cut: false,
    default_hi: { min: 3.0, max: 14.1 },
    default_tee: "Blancas / Rojas",
    default_format_notes:
      "Stroke Play al 80% · sin corte · H.I. +3.0 a 4.1 (Blancas) o 4.2 a 14.1 (Rojas)",
  },
  {
    patterns: [/damas\s*b/i],
    code: "DB",
    name: "Damas B",
    gender: "F",
    category_group: "ladies",
    default_has_cut: false,
    default_hi: { min: 14.2, max: 20.7 },
    default_tee: "Rojas",
    default_format_notes: "Stroke Play al 80% · 54 hoyos sin corte",
  },
  {
    patterns: [/damas\s*c/i],
    code: "DC",
    name: "Damas C",
    gender: "F",
    category_group: "ladies",
    default_has_cut: false,
    default_hi: { min: 20.8, max: 34.0 },
    default_tee: "Rojas",
    default_format_notes: "Stableford al 80% · 54 hoyos sin corte",
  },
];

function parseHiRange(text: string): { min: number; max: number } | null {
  const m = text.match(
    /([+\-]?\d+(?:\.\d+)?)\s+a\s+([+\-]?\d+(?:\.\d+)?)/i
  );
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function detectFormat(line: string): "stroke_play" | "stableford" | null {
  if (/stableford/i.test(line)) return "stableford";
  if (/stroke\s*play/i.test(line)) return "stroke_play";
  return null;
}

function detectHandicapPct(text: string, format: "stroke_play" | "stableford") {
  if (/sin\s+h[aá]ndicap|sin\s+handicap/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*%/);
  if (m) return Number(m[1]);
  if (format === "stableford") return 80;
  if (/al\s+80\s*%|80\s*%/i.test(text)) return 80;
  return 0;
}

function matchCategoryName(line: string) {
  const clean = line.replace(/\s+/g, " ").trim();
  for (const def of CATEGORY_DEFS) {
    for (const pat of def.patterns) {
      if (pat.test(clean)) return def;
    }
  }
  return null;
}

function buildCompetitionRule(
  cat: DraftCategory,
  narrative: string
): DraftCompetitionRule {
  const block = `${cat.name} ${cat.format_notes ?? ""} ${narrative}`;
  let scoring_format: DraftCompetitionRule["scoring_format"] = "stroke_play";
  if (/stableford/i.test(block)) scoring_format = "stableford";

  const handicap_percentage = detectHandicapPct(block, scoring_format);

  let leaderboard_basis: DraftCompetitionRule["leaderboard_basis"] = "gross";
  let prize_basis: DraftCompetitionRule["prize_basis"] = "gross";

  if (scoring_format === "stableford") {
    leaderboard_basis = "stableford";
    prize_basis = "stableford";
  } else if (handicap_percentage > 0) {
    leaderboard_basis = "net";
    if (
      /1\s*er[oa]?\s+gross.*3.*neto|1\s+gross.*3.*net/i.test(narrative) ||
      ["SEN", "SS", "DA", "DB"].includes(cat.code)
    ) {
      prize_basis = "both";
    } else {
      prize_basis = "net";
    }
  }

  let gross_prize_places = 3;
  let net_prize_places: number | null = null;

  if (prize_basis === "gross") {
    gross_prize_places = 3;
  } else if (prize_basis === "both") {
    gross_prize_places = 1;
    net_prize_places = 3;
  } else if (prize_basis === "stableford") {
    gross_prize_places = 3;
  } else {
    gross_prize_places = 0;
    net_prize_places = 3;
  }

  return {
    category_code: cat.code,
    scoring_format,
    leaderboard_basis,
    prize_basis,
    handicap_percentage,
    gross_prize_places,
    net_prize_places,
    notes: cat.format_notes,
  };
}

/** Analiza texto de convocatoria (CCQ / torneos 54h con corte). */
export function parseConvocatoriaText(text: string): ConvocatoriaDraft {
  const warnings: string[] = [];
  const templateRef = ccqTorneoAnualMachote();
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/68VO\.\s*TORNEO ANUAL[^\n]*/gi, "")
    .replace(/67VO\.\s*TORNEO ANUAL[^\n]*/gi, "");

  const titleMatch = text.match(/(\d+)[º°o]?\s*torneo\s+anual/i);
  const holesMatch = normalized.match(/(\d+)\s*hoyos/i);
  const cutMatch = normalized.match(/corte\s+a\s+(\d+)\s*hoyos/i);
  const cutPctMatch = normalized.match(
    /corte,?\s*ser[aá]\s*maximo\s*el\s*(\d+)\s*%/i
  );

  const total_holes = holesMatch ? Number(holesMatch[1]) : 54;
  const cut_after_holes = cutMatch ? Number(cutMatch[1]) : 36;
  const cut_percent = cutPctMatch ? Number(cutPctMatch[1]) : 50;
  const round_count =
    total_holes >= 54 ? 3 : total_holes >= 36 ? 2 : 1;

  const lines = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const categories: DraftCategory[] = [];
  const seen = new Set<string>();

  let inCategoryTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^categor[ií]as$/i.test(line) || /^caballeros$/i.test(line)) {
      inCategoryTable = true;
      continue;
    }
    if (
      inCategoryTable &&
      /desempate|trofeos|participantes|premios|d[ií]as de juego/i.test(line)
    ) {
      inCategoryTable = false;
    }
    if (!inCategoryTable) continue;

    const def = matchCategoryName(line);
    if (!def || seen.has(def.code)) continue;

    let handicap_min = def.default_hi?.min ?? 0;
    let handicap_max = def.default_hi?.max ?? 54;
    let tee_hint: string | null = def.default_tee ?? null;
    let format_notes: string | null = def.default_format_notes ?? null;

    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const hi = parseHiRange(lines[j]);
      if (hi) {
        handicap_min = hi.min;
        handicap_max = hi.max;
      }
      if (/negras|azules|blancas|doradas|rojas/i.test(lines[j])) {
        tee_hint =
          lines[j].match(/(negras|azules|blancas|doradas|rojas)/i)?.[0] ??
          tee_hint;
      }
      const fmt = detectFormat(lines[j]);
      if (fmt) format_notes = lines[j];
    }

    if (def.code === "DA" && /4\.2\s+a\s+14\.1/i.test(normalized)) {
      format_notes = def.default_format_notes ?? format_notes;
      warnings.push(
        "Damas A: convocatoria define dos bandas H.I. (+3.0–4.1 y 4.2–14.1); inscripción usa rango 3.0–14.1."
      );
    }

    let min_age: number | null = null;
    let max_age: number | null = null;
    if (def.code === "SEN") {
      min_age = 58;
      max_age = 64;
    }
    if (def.code === "SS") {
      min_age = 65;
      max_age = null;
    }

    let has_cut = def.default_has_cut;
    if (/sin\s+corte/i.test(normalized) && def.category_group === "ladies") {
      const ladiesNoCut = /damas\s*a\s+y\s+b.*sin\s+corte/i.test(normalized);
      if (
        ladiesNoCut &&
        (def.code === "DA" || def.code === "DB" || def.code === "DC")
      ) {
        has_cut = false;
      }
    }

    categories.push({
      code: def.code,
      name: def.name,
      gender: def.gender,
      category_group: def.category_group,
      handicap_min,
      handicap_max,
      min_age,
      max_age,
      tee_hint,
      format_notes,
      has_cut,
    });
    seen.add(def.code);
  }

  if (categories.length === 0) {
    warnings.push(
      "No se detectaron categorías en tablas. Revisa el DOCX o edita el borrador manualmente."
    );
    return {
      ...templateRef,
      source: "docx",
      meta: {
        ...templateRef.meta,
        title: titleMatch ? titleMatch[0] : templateRef.meta.title,
        total_holes,
        cut_after_holes,
        cut_percent,
        round_count,
      },
      warnings: [
        ...warnings,
        "Se cargó plantilla 68º por defecto (sin tablas detectadas).",
        ...(templateRef.warnings ?? []),
      ],
    };
  }

  const narrative = normalized.slice(0, 12000);
  const competition_rules = categories.map((c) =>
    buildCompetitionRule(c, narrative)
  );

  const meta = {
    title: titleMatch ? titleMatch[0] : null,
    total_holes,
    cut_after_holes,
    cut_percent,
    round_count,
    practice_day: templateRef.meta.practice_day,
    handicap_index_date: templateRef.meta.handicap_index_date,
  };

  const cut_rules = buildCutRulesCcQ(meta);
  const prize_rules = buildPrizeRulesFromCompetition(competition_rules);

  warnings.push(templateRef.reference?.out_of_scope ?? "");
  warnings.push(
    "Perfiles de desempate (10-18, 13-18, retrocesión 9-6-3-1) están en pestaña «Texto convocatoria» — configúralos en Reglas de corte / Desempates."
  );

  return {
    version: 1,
    source: "docx",
    meta,
    reference: templateRef.reference,
    categories,
    competition_rules,
    cut_rules,
    prize_rules,
    warnings: warnings.filter(Boolean),
  };
}
