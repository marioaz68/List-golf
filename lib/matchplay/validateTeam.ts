import { effectiveEntryHi } from "./entryHi";
import type { MatchPlayEntryRow, MatchPlayRulesSnapshot } from "./teamTypes";

export type TeamValidationInput = {
  match_type: "individual" | "pairs";
  player_a: MatchPlayEntryRow;
  player_b?: MatchPlayEntryRow | null;
  rules: MatchPlayRulesSnapshot | null;
  existingTeamCount: number;
  excludeTeamId?: string;
};

export type TeamValidationResult =
  | { ok: true; combined_hi: number }
  | { ok: false; message: string };

export function validateTeamFormation(
  input: TeamValidationInput
): TeamValidationResult {
  const { match_type, player_a, player_b, rules, existingTeamCount } = input;

  if (player_a.status && player_a.status !== "confirmed") {
    return { ok: false, message: "El jugador A no tiene inscripción confirmada." };
  }

  if (match_type === "individual") {
    const hi = effectiveEntryHi(player_a);
    return { ok: true, combined_hi: hi };
  }

  if (!player_b) {
    return { ok: false, message: "Selecciona dos jugadores para la pareja." };
  }

  if (player_a.id === player_b.id) {
    return { ok: false, message: "No puedes repetir el mismo inscrito." };
  }

  if (player_b.status && player_b.status !== "confirmed") {
    return { ok: false, message: "El jugador B no tiene inscripción confirmada." };
  }

  const hiA = effectiveEntryHi(player_a);
  const hiB = effectiveEntryHi(player_b);
  const combined = Math.round((hiA + hiB) * 10) / 10;

  const composition = rules?.pair_composition ?? "open";
  const gA = player_a.player.gender;
  const gB = player_b.player.gender;

  const maleCap = rules?.male_individual_hi_max ?? null;
  const femaleCap = rules?.female_individual_hi_max ?? null;

  const checkIndividual = (
    playerLabel: string,
    gender: "M" | "F" | "X" | null,
    hi: number
  ): TeamValidationResult | null => {
    if (gender === "M" && maleCap != null && hi > maleCap) {
      return {
        ok: false,
        message: `${playerLabel}: HI ${hi} excede el tope para caballeros (${maleCap}).`,
      };
    }
    if (gender === "F" && femaleCap != null && hi > femaleCap) {
      return {
        ok: false,
        message: `${playerLabel}: HI ${hi} excede el tope para damas (${femaleCap}).`,
      };
    }
    return null;
  };

  const failA = checkIndividual("Jugador A", gA, hiA);
  if (failA) return failA;
  const failB = checkIndividual("Jugador B", gB, hiB);
  if (failB) return failB;

  if (composition === "mixed_one_each") {
    const hasM = gA === "M" || gB === "M";
    const hasF = gA === "F" || gB === "F";
    if (!hasM || !hasF || gA === gB) {
      return {
        ok: false,
        message: "La pareja debe ser mixta: 1 caballero y 1 dama.",
      };
    }
  } else if (composition === "ladies_only") {
    if (gA !== "F" || gB !== "F") {
      return { ok: false, message: "Solo damas pueden formar esta pareja." };
    }
  } else if (composition === "gentlemen_only") {
    if (gA !== "M" || gB !== "M") {
      return { ok: false, message: "Solo caballeros pueden formar esta pareja." };
    }
  }

  const min = rules?.combined_hi_min;
  const max = rules?.combined_hi_max;
  if (min !== null && min !== undefined && combined < min) {
    return {
      ok: false,
      message: `Suma HI ${combined} menor al mínimo (${min}).`,
    };
  }
  if (max !== null && max !== undefined && combined > max) {
    return {
      ok: false,
      message: `Suma HI ${combined} mayor al máximo (${max}).`,
    };
  }

  const maxTeams = rules?.max_teams;
  if (
    maxTeams !== null &&
    maxTeams !== undefined &&
    existingTeamCount >= maxTeams
  ) {
    return {
      ok: false,
      message: `Límite del cuadro alcanzado (${maxTeams} equipos).`,
    };
  }

  return { ok: true, combined_hi: combined };
}
