export type StartingHoleSide = "A" | "B";

/** Parsea códigos internos (`H1A`) o texto ya mostrado (`HOYO 1`). */
export function parseStartingHoleLabel(
  label: string | null | undefined,
  holeNumber?: number | null
): { hole: number | null; side: StartingHoleSide | null } {
  const raw = (label ?? "").trim();
  if (raw) {
    const hMatch = /^H(\d+)([AB])?$/i.exec(raw);
    if (hMatch) {
      const sideRaw = hMatch[2]?.toUpperCase();
      return {
        hole: Number(hMatch[1]),
        side:
          sideRaw === "A" || sideRaw === "B" ? (sideRaw as StartingHoleSide) : null,
      };
    }

    const hoyoMatch = /^HOYO\s*(\d+)(?:\s*([AB]))?$/i.exec(raw);
    if (hoyoMatch) {
      const sideRaw = hoyoMatch[2]?.toUpperCase();
      return {
        hole: Number(hoyoMatch[1]),
        side:
          sideRaw === "A" || sideRaw === "B" ? (sideRaw as StartingHoleSide) : null,
      };
    }
  }

  if (typeof holeNumber === "number" && Number.isFinite(holeNumber)) {
    return { hole: holeNumber, side: null };
  }

  return { hole: null, side: null };
}

export function formatStartingHoleNumber(hole: number | null | undefined): string {
  if (hole == null || !Number.isFinite(hole)) return "—";
  return `HOYO ${hole}`;
}

/** Etiqueta legible para salidas (p. ej. `H10B` → `HOYO 10 B`). */
export function formatStartingHoleLabel(
  label: string | null | undefined,
  holeNumber?: number | null
): string {
  const { hole, side } = parseStartingHoleLabel(label, holeNumber);
  if (hole == null) {
    const raw = (label ?? "").trim();
    return raw || "—";
  }
  const base = formatStartingHoleNumber(hole);
  return side ? `${base} ${side}` : base;
}

export function formatStartingHoleLabelParts(
  label: string | null | undefined,
  holeNumber?: number | null
): { holeText: string; side: StartingHoleSide | null } {
  const { hole, side } = parseStartingHoleLabel(label, holeNumber);
  return {
    holeText: hole != null ? formatStartingHoleNumber(hole) : "—",
    side,
  };
}
