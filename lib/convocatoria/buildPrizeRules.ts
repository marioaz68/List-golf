import type { DraftCompetitionRule, DraftPrizeRule } from "./types";

/** Genera filas de premios de podio según reglas de competencia (convocatoria 68º CCQ). */
export function buildPrizeRulesFromCompetition(
  competition_rules: DraftCompetitionRule[],
  options?: {
    includeMemberSpecials?: boolean;
  }
): DraftPrizeRule[] {
  const prize_rules: DraftPrizeRule[] = [];

  for (const r of competition_rules) {
    const code = r.category_code.toUpperCase();

    if (r.prize_basis === "both") {
      prize_rules.push(
        {
          category_code: code,
          prize_position: 1,
          prize_label: `1° lugar Gross — ${displayName(code)}`,
          ranking_basis: "gross",
          scope_type: "category",
          scope_value: code,
        },
        {
          category_code: code,
          prize_position: 1,
          prize_label: `1° lugar Neto — ${displayName(code)}`,
          ranking_basis: "net",
          scope_type: "category",
          scope_value: code,
        },
        {
          category_code: code,
          prize_position: 2,
          prize_label: `2° lugar Neto — ${displayName(code)}`,
          ranking_basis: "net",
          scope_type: "category",
          scope_value: code,
        },
        {
          category_code: code,
          prize_position: 3,
          prize_label: `3° lugar Neto — ${displayName(code)}`,
          ranking_basis: "net",
          scope_type: "category",
          scope_value: code,
        }
      );
    } else if (r.prize_basis === "stableford") {
      for (let pos = 1; pos <= Math.max(1, r.gross_prize_places || 3); pos++) {
        prize_rules.push({
          category_code: code,
          prize_position: pos,
          prize_label: `${pos}° lugar — ${displayName(code)} (Stableford)`,
          ranking_basis: "stableford",
          scope_type: "category",
          scope_value: code,
        });
      }
    } else {
      const places = Math.max(1, r.gross_prize_places || 3);
      for (let pos = 1; pos <= places; pos++) {
        prize_rules.push({
          category_code: code,
          prize_position: pos,
          prize_label: `${pos}° lugar — ${displayName(code)} (Gross)`,
          ranking_basis: "gross",
          scope_type: "category",
          scope_value: code,
        });
      }
    }
  }

  if (options?.includeMemberSpecials !== false) {
    prize_rules.push(
      {
        category_code: "DA",
        prize_position: 1,
        prize_label:
          "Mejor jugadora socia del club — Damas A (salida Blancas, score Gross)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "DA",
      },
      {
        category_code: "CAMP",
        prize_position: 1,
        prize_label:
          "Mejor jugador socio del club — Campeonato (salida Negras, score Gross)",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "CAMP",
      }
    );
  }

  return prize_rules;
}

function displayName(code: string): string {
  switch (code) {
    case "CAMP":
      return "Campeonato";
    case "DE":
      return "Abierta (D-E)";
    case "DA":
      return "Damas A";
    case "DB":
      return "Damas B";
    case "DC":
      return "Damas C";
    case "SEN":
      return "Seniors";
    case "SS":
      return "Super Seniors";
    default:
      return code;
  }
}
