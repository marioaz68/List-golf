/**
 * Helpers para visualizar parejas de match play dentro de un grupo (foursome).
 *
 * Convención de generación (ver `generateMatchPlayTeeSheet` en `actions.ts`):
 *   - position 1, 2 → pareja superior del bracket (top)
 *   - position 3, 4 → pareja inferior del bracket (bottom)
 *   - notes = "MATCH PLAY · #<seedTop> vs #<seedBottom>"
 */

const MATCH_PLAY_NOTES_PREFIX = "MATCH PLAY";

export type MatchPlayPairSide = "top" | "bottom";

export type MatchPlayPairInfo = {
  isMatchPlay: true;
  topLabel: string;
  bottomLabel: string;
};

export type MatchPlayGroupInfo = MatchPlayPairInfo | { isMatchPlay: false };

export function parseMatchPlayGroupNotes(
  notes: string | null | undefined
): MatchPlayGroupInfo {
  const raw = String(notes ?? "").trim();
  if (!raw.toUpperCase().startsWith(MATCH_PLAY_NOTES_PREFIX)) {
    return { isMatchPlay: false };
  }

  const m = raw.match(/MATCH\s*PLAY[^·]*·\s*(\S+)\s*vs\s*(\S+)/i);
  return {
    isMatchPlay: true,
    topLabel: (m?.[1] ?? "TOP").trim(),
    bottomLabel: (m?.[2] ?? "BOT").trim(),
  };
}

export function matchPlayPairSideForPosition(
  position: number | null | undefined
): MatchPlayPairSide {
  const p = Number(position ?? 0);
  return p >= 3 ? "bottom" : "top";
}

/**
 * Paleta visual para identificar a las dos parejas dentro del mismo foursome.
 * Pareja superior del bracket = azul marino. Pareja inferior = gris.
 */
export const MATCH_PLAY_PAIR_COLORS: Record<
  MatchPlayPairSide,
  {
    label: string;
    /** Color principal (línea izquierda, badge, ring). */
    accent: string;
    /** Fondo suave del row del jugador. */
    rowBg: string;
    /** Fondo del badge / chip de la pareja. */
    badgeBg: string;
    /** Texto del badge. */
    badgeFg: string;
    /** Borde sutil del row. */
    rowBorder: string;
  }
> = {
  top: {
    label: "Pareja superior",
    accent: "#1e3a8a",
    rowBg: "rgba(191, 219, 254, 0.62)",
    badgeBg: "#1e3a8a",
    badgeFg: "#eff6ff",
    rowBorder: "#93c5fd",
  },
  bottom: {
    label: "Pareja inferior",
    accent: "#475569",
    rowBg: "rgba(226, 232, 240, 0.7)",
    badgeBg: "#334155",
    badgeFg: "#f8fafc",
    rowBorder: "#cbd5e1",
  },
};

/**
 * Devuelve el nombre del jugador en formato compacto y uniforme para vistas
 * con poco espacio (móvil + tarjetas de match play): "PrimerApellido Nombres".
 * Si solo viene `player_name` (sin partes separadas), regresa el original.
 */
export function compactPlayerName(input: {
  first_name?: string | null;
  last_name?: string | null;
  player_name?: string | null;
}): string {
  const fn = String(input.first_name ?? "").trim();
  const ln = String(input.last_name ?? "").trim();

  if (fn || ln) {
    const firstSurname = ln.split(/\s+/).filter(Boolean)[0] ?? "";
    return [firstSurname, fn].filter(Boolean).join(" ").trim() || "Jugador";
  }

  return String(input.player_name ?? "").trim() || "Jugador";
}
