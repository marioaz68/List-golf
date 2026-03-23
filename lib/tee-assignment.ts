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

  if (rule.age_min !== null && age !== null && age < rule.age_min) {
    return false;
  }

  if (rule.age_max !== null && age !== null && age > rule.age_max) {
    return false;
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

export function assignTeeSet(
  player: Player,
  rules: Rule[],
  teeSets: TeeSet[]
): TeeSet | null {

  const categoryRules = rules
    .filter((r) => r.category_id === player.category_id)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of categoryRules) {
    if (matchRule(player, rule)) {
      const tee = teeSets.find((t) => t.id === rule.tee_set_id);
      if (tee) return tee;
    }
  }

  return null;
}