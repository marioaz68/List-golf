import {
  roundsInSameSession,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";

const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

export function isStartingOrderConfirmed(notes: string | null | undefined) {
  return String(notes ?? "").includes(STARTING_ORDER_CONFIRMED_MARKER);
}

/** Etiqueta de categoría en `pairing_groups.notes` (igual que tee-sheet backoffice). */
export function pairingGroupCategoryLabel(notes: string | null | undefined) {
  const v = String(notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function normalizeCategoryToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Código al inicio de notas tipo `DB — Damas B`. */
function categoryCodeFromGroupNotes(notes: string | null | undefined) {
  const raw = String(notes ?? "").trim();
  if (!raw) return "";
  const head = raw.split(/\s*[—–-]\s*/)[0]?.trim() ?? raw;
  return normalizeCategoryToken(head);
}

/**
 * Misma lógica que el filtro por categoría en /tee-sheet: prioriza `pairing_groups.notes`.
 */
export function pairingGroupMatchesCategory(
  groupNotes: string | null | undefined,
  members: Array<{ category_code: string | null }>,
  categoryCode: string | null | undefined,
  categoryName?: string | null
): boolean {
  const code = normalizeCategoryToken(categoryCode);
  const name = normalizeCategoryToken(categoryName);
  if (!code && !name) return true;

  const label = pairingGroupCategoryLabel(groupNotes);
  const labelNorm = normalizeCategoryToken(label);
  const labelCode = categoryCodeFromGroupNotes(groupNotes);

  if (code && (labelCode === code || labelNorm === code || labelNorm.startsWith(`${code} `))) {
    return true;
  }
  if (name && (labelNorm === name || labelNorm.includes(name))) {
    return true;
  }

  return members.some((m) => {
    const mc = normalizeCategoryToken(m.category_code);
    return (code && mc === code) || (name && mc === name);
  });
}

/** Publicado si cualquier ronda del bloque día/turno tiene orden confirmado. */
export function isSessionStartingOrderPublished(
  sessionRounds: SessionRoundFields[],
  roundId: string,
  notesByRoundId: ReadonlyMap<string, string | null | undefined>
): boolean {
  return roundsInSameSession(sessionRounds, roundId).some((sr) =>
    isStartingOrderConfirmed(notesByRoundId.get(sr.id))
  );
}
