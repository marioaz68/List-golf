import type { SupabaseClient } from "@supabase/supabase-js";

export type CategoryRange = {
  id?: string;
  code?: string | null;
  name?: string | null;
  handicap_min?: number | null;
  handicap_max?: number | null;
};

/** Asigna la misma categoría a ambos inscritos del equipo. */
export async function syncPairEntriesCategory(
  admin: SupabaseClient,
  params: { entryIds: string[]; categoryId: string | null }
): Promise<void> {
  if (!params.categoryId) return;
  const ids = params.entryIds.filter(Boolean);
  if (!ids.length) return;

  const { error } = await admin
    .from("tournament_entries")
    .update({ category_id: params.categoryId })
    .in("id", ids);

  if (error) throw new Error(`Categoría del equipo: ${error.message}`);
}

/**
 * Si la suma HI excede el máximo de la categoría, reduce el HI del jugador más alto
 * en tournament_entries hasta encajar. Devuelve HI vigentes y mensajes.
 */
export async function capMatchPlayPairHandicaps(
  admin: SupabaseClient,
  params: {
    entryAId: string;
    entryBId: string;
    hiA: number;
    hiB: number;
    category: CategoryRange | null;
  }
): Promise<{ hiA: number; hiB: number; combined_hi: number; messages: string[] }> {
  const messages: string[] = [];
  let liveA = params.hiA;
  let liveB = params.hiB;
  const maxCombined =
    params.category?.handicap_max != null
      ? Number(params.category.handicap_max)
      : null;

  if (maxCombined != null && Number.isFinite(maxCombined) && maxCombined > 0) {
    const combined = Math.round((liveA + liveB) * 10) / 10;
    if (combined > maxCombined) {
      const excess = Math.round((combined - maxCombined) * 10) / 10;
      const higherIsA = liveA >= liveB;
      const targetEntryId = higherIsA ? params.entryAId : params.entryBId;
      const newHi = Math.round(
        (higherIsA ? liveA - excess : liveB - excess) * 10
      ) / 10;

      if (newHi < 0) {
        throw new Error(
          `No se puede ajustar la pareja al tope ${maxCombined}: el HI del jugador más alto quedaría negativo.`
        );
      }

      const { error: hiErr } = await admin
        .from("tournament_entries")
        .update({ handicap_index: newHi })
        .eq("id", targetEntryId);

      if (hiErr) throw new Error(`Ajuste HI: ${hiErr.message}`);

      if (higherIsA) liveA = newHi;
      else liveB = newHi;

      const catLabel =
        params.category?.code || params.category?.name || "categoría";
      messages.push(
        `HI ajustado: jugador con HI más alto reducido a ${newHi} para encajar en tope ${maxCombined} (${catLabel}).`
      );
    }
  }

  const combined_hi = Math.round((liveA + liveB) * 10) / 10;
  return { hiA: liveA, hiB: liveB, combined_hi, messages };
}
