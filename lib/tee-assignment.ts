export type Category = {
  id: string;
  code: string;
  name: string;
};

export type TeeSet = {
  id: string;
  code: string;
  name: string;
};

export type Rule = {
  id: string;
  category_id: string;
  tee_set_id: string;
  priority: number;
  age_min: number | null;
  age_max: number | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
};

export type Player = {
  id: string;
  gender: "M" | "F" | "X";
  handicap_index: number;
  birth_year: number | null;
  category_id: string;
};

function calculateAge(birthYear: number | null) {
  if (!birthYear) return null;
  const year = new Date().getFullYear();
  return year - birthYear;
}

function matchRule(player: Player, rule: Rule) {
  const age = calculateAge(player.birth_year);

  if (rule.gender && rule.gender !== player.gender) {
    return false;
  }

  // Si la regla exige edad y no sabemos la edad del jugador, NO aplica.
  // Antes esta verificación dejaba pasar la regla (semánticamente
  // incorrecto: un jugador sin birth_year terminaba en salidas seniors).
  if (rule.age_min !== null) {
    if (age === null || age < rule.age_min) return false;
  }
  if (rule.age_max !== null) {
    if (age === null || age > rule.age_max) return false;
  }

  if (
    rule.handicap_min !== null &&
    player.handicap_index < rule.handicap_min
  ) {
    return false;
  }

  if (
    rule.handicap_max !== null &&
    player.handicap_index > rule.handicap_max
  ) {
    return false;
  }

  return true;
}

/** Cumple género y edad (no evalúa rango de handicap). */
function matchGenderAndAge(player: Player, rule: Rule): boolean {
  const age = calculateAge(player.birth_year);

  if (rule.gender && rule.gender !== player.gender) return false;
  if (rule.age_min !== null) {
    if (age === null || age < rule.age_min) return false;
  }
  if (rule.age_max !== null) {
    if (age === null || age > rule.age_max) return false;
  }
  return true;
}

/** Distancia del HI del jugador al rango de la regla.
 *  - 0 si está dentro del rango.
 *  - Positivo: cuántos golpes le faltan (o le sobran) para entrar al rango.
 */
function hiDistanceToRule(hi: number, rule: Rule): number {
  if (rule.handicap_min !== null && hi < rule.handicap_min) {
    return rule.handicap_min - hi;
  }
  if (rule.handicap_max !== null && hi > rule.handicap_max) {
    return hi - rule.handicap_max;
  }
  return 0;
}

export type AssignTeeResult = {
  tee: TeeSet;
  /** "exact" si la regla coincidió tal cual; "extrapolated" si el HI
   *  está fuera del rango pero asignamos la regla más cercana del
   *  mismo género/edad. */
  match: "exact" | "extrapolated";
  rule: Rule;
};

export function assignTeeSetWithMeta(
  player: Player,
  rules: Rule[],
  teeSets: TeeSet[]
): AssignTeeResult | null {
  const categoryRules = rules
    .filter((r) => r.category_id === player.category_id)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of categoryRules) {
    if (matchRule(player, rule)) {
      const tee = teeSets.find((t) => t.id === rule.tee_set_id);
      if (tee) return { tee, match: "exact", rule };
    }
  }

  // Fallback: ningún rango de handicap aplica al jugador. Tomar la
  // regla del mismo género/edad cuyo rango está más cerca del HI del
  // jugador (típicamente, el HI rebasa el handicap_max de la regla
  // "estándar" para su sexo).
  const relaxed = categoryRules
    .filter((r) => matchGenderAndAge(player, r))
    .map((rule) => ({
      rule,
      dist: hiDistanceToRule(player.handicap_index, rule),
      tee: teeSets.find((t) => t.id === rule.tee_set_id) ?? null,
    }))
    .filter((c) => c.tee != null)
    .sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return a.rule.priority - b.rule.priority;
    });

  const best = relaxed[0];
  if (best?.tee) {
    return { tee: best.tee, match: "extrapolated", rule: best.rule };
  }

  return null;
}

export function assignTeeSet(
  player: Player,
  rules: Rule[],
  teeSets: TeeSet[]
): TeeSet | null {
  return assignTeeSetWithMeta(player, rules, teeSets)?.tee ?? null;
}