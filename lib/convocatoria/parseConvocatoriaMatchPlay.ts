import { ccqMatchPlayMixto } from "./templates/ccqMatchPlayMixto";
import { matchPlayMachote } from "./templates/matchPlayMachote";
import type { ConvocatoriaDraft } from "./types";
import type {
  MatchPlayBracketType,
  MatchPlayPairFormat,
  MatchPlayTiebreaker,
} from "@/lib/matchplay/types";

function detectPairFormat(text: string): MatchPlayPairFormat | null {
  if (/four\s*[-]?\s*ball|mejor\s+bola|fourball/i.test(text)) return "fourball";
  if (/foursomes|golpe\s+alterno/i.test(text)) return "foursomes";
  if (/greensome|pinehurst/i.test(text)) return "greensome";
  if (/chapman/i.test(text)) return "chapman";
  if (/scramble/i.test(text)) return "scramble";
  return null;
}

function detectBracketType(text: string): MatchPlayBracketType | null {
  if (/doble\s+eliminaci[oó]n|double\s+elim/i.test(text)) return "double_elim";
  if (/consolaci[oó]n/i.test(text)) return "single_elim_consolation";
  if (/round\s*robin|todos\s+contra\s+todos/i.test(text)) return "round_robin";
  if (/clasificaci[oó]n|stroke\s*play.*match/i.test(text))
    return "stroke_qualifier";
  if (/eliminaci[oó]n\s+directa|single\s+elim/i.test(text))
    return "single_elim";
  return null;
}

function detectTiebreaker(text: string): MatchPlayTiebreaker | null {
  if (/muerte\s+s[uú]bita.*18|sudden\s+death.*18/i.test(text))
    return "sudden_death_18";
  if (/muerte\s+s[uú]bita|sudden\s+death/i.test(text)) return "sudden_death";
  if (/3\s+hoyos\s+extra/i.test(text)) return "extra_3_holes";
  if (/h[aá]ndicap\s+m[aá]s\s+bajo|lowest\s+hi/i.test(text))
    return "lowest_hi";
  return null;
}

function looksLikeCcqMixto(text: string): boolean {
  return (
    /match\s*play\s+de\s+parejas/i.test(text) &&
    /mixto/i.test(text) &&
    /(club\s+campestre\s+de\s+quer[eé]taro|ccq)/i.test(text)
  );
}

/** Parser básico de convocatoria match play desde texto (DOCX/PDF). */
export function parseConvocatoriaMatchPlayText(text: string): ConvocatoriaDraft {
  const warnings: string[] = [];
  const normalized = text.replace(/\u00a0/g, " ");

  if (looksLikeCcqMixto(normalized)) {
    const seed = ccqMatchPlayMixto();
    return {
      ...seed,
      source: "docx",
      warnings: [
        ...(seed.warnings ?? []),
        "Detectado: Convocatoria CCQ Mixto Match Play. Plantilla precargada — revisa antes de cerrar.",
      ],
    };
  }

  const template = matchPlayMachote();

  const titleMatch = normalized.match(
    /(torneo[^\n]{0,80}match\s*play[^\n]{0,40}|match\s*play[^\n]{0,80})/i
  );
  const holesMatch = normalized.match(/(\d+)\s*hoyos/i);
  const pairsMatch = normalized.match(/(\d+)\s*parejas/i);

  const pair_format = detectPairFormat(normalized) ?? template.matchplay!.pair_format;
  const bracket_type =
    detectBracketType(normalized) ?? template.matchplay!.bracket_type;
  const match_tiebreaker =
    detectTiebreaker(normalized) ?? template.matchplay!.match_tiebreaker;

  const holes_per_match = holesMatch
    ? (Number(holesMatch[1]) <= 9 ? 9 : 18)
    : template.matchplay!.holes_per_match;

  let max_pairs = template.matchplay!.max_pairs_per_category;
  if (pairsMatch) {
    const n = Number(pairsMatch[1]);
    if ([8, 16, 32, 64].includes(n)) max_pairs = n;
  }

  let bracket_round_count = template.matchplay!.bracket_round_count;
  if (max_pairs) {
    bracket_round_count = Math.ceil(Math.log2(max_pairs));
  }

  if (!detectPairFormat(normalized)) {
    warnings.push(
      "No se detectó formato de pareja en el texto; se usó Four-Ball por defecto."
    );
  }

  return {
    ...template,
    source: "docx",
    meta: {
      ...template.meta,
      title: titleMatch ? titleMatch[0].trim() : template.meta.title,
      total_holes: holes_per_match,
      round_count: bracket_round_count,
    },
    matchplay: {
      ...template.matchplay!,
      pair_format,
      bracket_type,
      match_tiebreaker,
      holes_per_match,
      max_pairs_per_category: max_pairs,
      bracket_round_count,
    },
    warnings: [...(template.warnings ?? []), ...warnings],
  };
}
