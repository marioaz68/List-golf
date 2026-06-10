/** Nombre normalizado del Club Campestre de Querétaro (CCQ). */
export const CCQ_NORMALIZED_NAME = "club campestre de queretaro";

const CCQ_SHORT_CODE = "CCQ";

const CCQ_ALIASES = new Set([
  CCQ_NORMALIZED_NAME,
  "club campestre de quer",
  "club campestre de qro",
  "club campestre queretaro",
  "club campesrre de queretaro",
]);

export const CCQ_DISPLAY_NAME = "Club Campestre de Querétaro";

export function normalizeClubText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeClubShortCode(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

export function isFullClubShortName(shortName: string | null | undefined): boolean {
  return String(shortName ?? "").trim().length > 4;
}

/** Resuelve alias truncados de CCQ al nombre canónico normalizado. */
export function resolveClubLookupNormalized(name: string): string {
  const normalized = normalizeClubText(name);
  return CCQ_ALIASES.has(normalized) ? CCQ_NORMALIZED_NAME : normalized;
}

export function isCcqNormalizedName(normalized: string): boolean {
  return normalized === CCQ_NORMALIZED_NAME;
}

export function validateClubIdentity(params: {
  name: string;
  short_name?: string | null;
}): { normalized_name: string } {
  const name = params.name.trim();
  const normalized_name = normalizeClubText(name);

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
  }

  const shortRaw = String(params.short_name ?? "").trim();
  const shortCode = normalizeClubShortCode(shortRaw);

  if (isCcqNormalizedName(normalized_name)) {
    if (shortRaw && shortCode !== CCQ_SHORT_CODE) {
      throw new Error(
        '"Club Campestre de Querétaro" está reservado para CCQ (sigla CCQ). ' +
          'Para otro club campestre incluye la ciudad, ej. "Club Campestre de Tijuana".'
      );
    }
  }

  if (
    normalized_name.startsWith("club campestre de quer") &&
    !isCcqNormalizedName(normalized_name)
  ) {
    throw new Error(
      'Nombre de club incompleto o ambiguo. Para CCQ usa "Club Campestre de Querétaro"; para otros incluye la ciudad completa.'
    );
  }

  if (
    normalized_name === "club campestre" ||
    normalized_name === "club campestre de"
  ) {
    throw new Error("Indica la ciudad en el nombre del club campestre.");
  }

  if (shortRaw && isFullClubShortName(shortRaw)) {
    const shortNorm = normalizeClubText(shortRaw);
    if (shortNorm !== normalized_name) {
      throw new Error(
        "El nombre corto debe coincidir con el nombre del club o ser una sigla (ej. CCQ)."
      );
    }
  }

  return { normalized_name };
}
