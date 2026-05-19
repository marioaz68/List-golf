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

function categoryCodeFromGroupNotes(notes: string | null | undefined) {
  const raw = String(notes ?? "").trim();
  if (!raw) return "";
  const head = raw.split(/\s*[—–-]\s*/)[0]?.trim() ?? raw;
  return normalizeCategoryToken(head);
}

function expectedGroupNotesLabel(
  categoryCode: string | null | undefined,
  categoryName: string | null | undefined
) {
  const parts = [categoryCode, categoryName].map((p) => String(p ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : "";
}

/**
 * Igual criterio que /tee-sheet: `pairing_groups.notes`, etiqueta compuesta, código o `category_id` del inscrito.
 */
export function pairingGroupMatchesCategory(
  groupNotes: string | null | undefined,
  members: Array<{ category_code: string | null; category_id?: string | null }>,
  categoryCode: string | null | undefined,
  categoryName?: string | null,
  categoryId?: string | null | undefined
): boolean {
  const cid = String(categoryId ?? "").trim();
  if (cid && members.some((m) => String(m.category_id ?? "").trim() === cid)) {
    return true;
  }

  const code = normalizeCategoryToken(categoryCode);
  const name = normalizeCategoryToken(categoryName);
  if (!code && !name && !cid) return true;

  const label = pairingGroupCategoryLabel(groupNotes);
  const labelNorm = normalizeCategoryToken(label);
  const labelCode = categoryCodeFromGroupNotes(groupNotes);
  const expectedLabel = expectedGroupNotesLabel(categoryCode ?? null, categoryName ?? null);
  const expectedNorm = normalizeCategoryToken(expectedLabel);

  if (expectedNorm && (labelNorm === expectedNorm || label === expectedLabel)) {
    return true;
  }
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

export function isSessionStartingOrderPublished(
  sessionRounds: SessionRoundFields[],
  roundId: string,
  notesByRoundId: ReadonlyMap<string, string | null | undefined>
): boolean {
  return roundsInSameSession(sessionRounds, roundId).some((sr) =>
    isStartingOrderConfirmed(notesByRoundId.get(sr.id))
  );
}
