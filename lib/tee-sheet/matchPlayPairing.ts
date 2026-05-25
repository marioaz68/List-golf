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
 * Es deliberadamente constante (no por grupo) para que el comité y los
 * jugadores aprendan los colores: arriba = sky / abajo = rose.
 */
export const MATCH_PLAY_PAIR_COLORS: Record<
  MatchPlayPairSide,
  {
    label: string;
    /** Color principal (línea izquierda, badge, ring). */
    accent: string;
    /** Fondo suave del row del jugador. */
    rowBg: string;
    /** Fondo del badge de la pareja. */
    badgeBg: string;
    /** Texto del badge. */
    badgeFg: string;
    /** Borde sutil del row. */
    rowBorder: string;
  }
> = {
  top: {
    label: "Pareja A",
    accent: "#0284c7",
    rowBg: "rgba(186, 230, 253, 0.55)",
    badgeBg: "#0369a1",
    badgeFg: "#f0f9ff",
    rowBorder: "#7dd3fc",
  },
  bottom: {
    label: "Pareja B",
    accent: "#e11d48",
    rowBg: "rgba(254, 205, 211, 0.55)",
    badgeBg: "#be123c",
    badgeFg: "#fff1f2",
    rowBorder: "#fda4af",
  },
};
