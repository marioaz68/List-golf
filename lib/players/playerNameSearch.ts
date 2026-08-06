/**
 * Criterio compartido de búsqueda de jugadores (inscripciones, pareja, etc.).
 * Sin acentos, por trozos: cada palabra del query debe aparecer en el nombre completo.
 */

/** Quita acentos, unifica mayúsculas y espacios. */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9ñ\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras del query (vacío → sin filtro). */
export function playerSearchTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Haystack de nombre: first+last y last+first normalizados,
 * para que "Jose Antonio Galindo" y "Vaqueiro" coincidan igual.
 */
export function playerNameHaystack(player: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const first = String(player.first_name ?? "").trim();
  const last = String(player.last_name ?? "").trim();
  return normalizeSearchText(`${first} ${last} ${last} ${first}`);
}

/**
 * ¿Coincide el jugador con la búsqueda?
 * - Por defecto también busca en club (opcional, no es filtro exclusivo).
 * - Match por tokens: cada palabra debe estar contenida en el haystack.
 */
export function matchesPlayerNameSearch(
  player: {
    first_name?: string | null;
    last_name?: string | null;
    club_label?: string | null;
  },
  query: string,
  options?: { matchClub?: boolean }
): boolean {
  const tokens = playerSearchTokens(query);
  if (tokens.length === 0) return true;

  const parts = [playerNameHaystack(player)];
  if (options?.matchClub !== false && player.club_label) {
    parts.push(normalizeSearchText(player.club_label));
  }
  const haystack = parts.join(" ");

  return tokens.every((token) => haystack.includes(token));
}
