/** Orden canónico de inscripciones (inscripciones ↔ comité de handicaps). */
export const ENTRY_DISPLAY_ORDER_SPECS = [
  { column: "handicap_index", ascending: true, nullsFirst: false },
  { column: "player_number", ascending: true, nullsFirst: false },
] as const;

type OrderableQuery<T> = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) => T;
};

/** Aplica el mismo orden HI → # jugador en consultas Supabase. */
export function applyEntryDisplayOrder<T extends OrderableQuery<T>>(
  query: T
): T {
  let q = query;
  for (const spec of ENTRY_DISPLAY_ORDER_SPECS) {
    q = q.order(spec.column, {
      ascending: spec.ascending,
      nullsFirst: spec.nullsFirst,
    });
  }
  return q;
}
