"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  assignCaddieToEntry,
  resolveDefaultRoundForEntry,
} from "@/lib/caddies/assignCaddieToEntry";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function redirectBack(tournamentId: string, roundId: string, caddieQuery = "") {
  const params = new URLSearchParams();

  if (tournamentId) params.set("tournament_id", tournamentId);
  if (roundId) params.set("round_id", roundId);
  if (caddieQuery) params.set("caddie_q", caddieQuery);

  const qs = params.toString();
  redirect(qs ? `/caddies?${qs}` : "/caddies");
}

/** Validamos el `redirect_to` para evitar open-redirects: sólo rutas
 *  internas (que arrancan con "/"). */
function safeRedirectTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

export async function assignCaddieAction(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = clean(formData.get("tournament_id"));
  const entry_id = clean(formData.get("entry_id"));
  const caddie_id = clean(formData.get("caddie_id"));
  const round_id = clean(formData.get("round_id"));
  const pairing_group_id = clean(formData.get("pairing_group_id"));
  const redirect_to = safeRedirectTo(clean(formData.get("redirect_to")));
  // Cuando viene "1", el caddie se asigna a TODAS las rondas elegibles del
  // torneo, sobreescribiendo cualquier otro caddie que el inscrito tuviera.
  const apply_all_rounds = clean(formData.get("apply_all_rounds")) === "1";

  if (!tournament_id || !entry_id || !caddie_id) {
    throw new Error("Datos incompletos");
  }

  if (!round_id) {
    throw new Error("Falta round_id");
  }

  const { data: conflicts, error: conflictError } = await supabase
    .from("caddie_assignments")
    .select("id, entry_id")
    .eq("tournament_id", tournament_id)
    .eq("caddie_id", caddie_id)
    .eq("round_id", round_id)
    .eq("is_active", true);

  if (conflictError) throw new Error(conflictError.message);

  const conflict = (conflicts ?? []).find((a) => a.entry_id !== entry_id);

  if (conflict) {
    throw new Error("Este caddie ya está asignado en esta ronda");
  }

  const { error: deactivateError } = await supabase
    .from("caddie_assignments")
    .update({ is_active: false })
    .eq("tournament_id", tournament_id)
    .eq("entry_id", entry_id)
    .eq("round_id", round_id)
    .eq("is_active", true);

  if (deactivateError) throw new Error(deactivateError.message);

  const { error } = await supabase.from("caddie_assignments").insert({
    tournament_id,
    entry_id,
    caddie_id,
    round_id,
    pairing_group_id: pairing_group_id || null,
    role: "marker",
    is_active: true,
  });

  if (error) throw new Error(error.message);

  // ── Propagar el caddie al resto de rondas del torneo ─────────────
  // Regla del comité: por defecto el mismo caddie trabaja con el
  // jugador todo el torneo. Sólo rellenamos rondas donde el inscrito
  // todavía no tiene caddie activo; no sobreescribimos asignaciones
  // existentes (si un caddie ya está apartado a otro jugador en una
  // ronda, también la saltamos).
  try {
    // 1. Categoría del inscrito (para filtrar rondas relevantes).
    const { data: entryRow } = await supabase
      .from("tournament_entries")
      .select("category_id")
      .eq("id", entry_id)
      .maybeSingle();
    const categoryId =
      (entryRow as { category_id?: string | null } | null)?.category_id ??
      null;

    // 2. Todas las rondas del torneo (mismas que aparecen en el verificador).
    const roundsQuery = supabase
      .from("rounds")
      .select("id, category_id, round_no")
      .eq("tournament_id", tournament_id);
    const { data: roundsRaw } = await roundsQuery;
    type RoundLite = {
      id: string;
      category_id: string | null;
      round_no: number | null;
    };
    const allRounds = (roundsRaw ?? []) as RoundLite[];
    const eligibleRounds = allRounds.filter((r) => {
      if (r.id === round_id) return false; // ya insertada
      // Si la ronda no tiene categoría, aplica a todos los inscritos.
      // Si tiene categoría, debe coincidir con la del jugador.
      if (!r.category_id) return true;
      return categoryId != null && r.category_id === categoryId;
    });

    if (eligibleRounds.length > 0) {
      // 3. Buscar rondas donde el inscrito ya tiene caddie activo.
      const eligibleIds = eligibleRounds.map((r) => r.id);
      const { data: existingForEntry } = await supabase
        .from("caddie_assignments")
        .select("round_id, caddie_id")
        .eq("tournament_id", tournament_id)
        .eq("entry_id", entry_id)
        .eq("is_active", true)
        .in("round_id", eligibleIds);
      // round_id -> caddie_id actualmente asignado al inscrito.
      const caddieByRoundForEntry = new Map<string, string>();
      for (const a of existingForEntry ?? []) {
        caddieByRoundForEntry.set(String(a.round_id), String(a.caddie_id));
      }
      const occupiedByEntry = new Set(caddieByRoundForEntry.keys());

      // 4. Rondas donde el caddie ya está asignado a otro jugador.
      const { data: caddieElsewhere } = await supabase
        .from("caddie_assignments")
        .select("round_id, entry_id")
        .eq("tournament_id", tournament_id)
        .eq("caddie_id", caddie_id)
        .eq("is_active", true)
        .in("round_id", eligibleIds);
      const blockedRoundsForCaddie = new Set(
        (caddieElsewhere ?? [])
          .filter((a) => a.entry_id !== entry_id)
          .map((a) => String(a.round_id))
      );

      // 5. Rondas destino.
      //  - Modo normal: sólo rondas donde el inscrito aún no tiene caddie.
      //  - Modo "todas las rondas": también las que ya tienen OTRO caddie
      //    (se sobreescribe), saltando sólo las rondas donde este caddie ya
      //    trabaja con otro jugador (conflicto real).
      const targetRoundIds = eligibleIds.filter((rid) => {
        if (blockedRoundsForCaddie.has(rid)) return false;
        const existingCaddie = caddieByRoundForEntry.get(rid);
        if (existingCaddie === caddie_id) return false; // ya está este caddie
        if (apply_all_rounds) return true; // sobreescribir cualquier otro
        return !occupiedByEntry.has(rid); // normal: sólo rondas vacías
      });

      // En modo "todas las rondas" desactivamos el caddie previo del inscrito
      // en las rondas que vamos a sobreescribir.
      if (apply_all_rounds) {
        const roundsToOverwrite = targetRoundIds.filter((rid) =>
          occupiedByEntry.has(rid)
        );
        if (roundsToOverwrite.length > 0) {
          const { error: deactOthersErr } = await supabase
            .from("caddie_assignments")
            .update({ is_active: false })
            .eq("tournament_id", tournament_id)
            .eq("entry_id", entry_id)
            .eq("is_active", true)
            .in("round_id", roundsToOverwrite);
          if (deactOthersErr) {
            console.warn(
              "[caddies] no se pudo desactivar caddie previo en otras rondas:",
              deactOthersErr.message
            );
          }
        }
      }
      const groupByRound = new Map<string, string | null>();
      if (targetRoundIds.length > 0) {
        const { data: pgmRows } = await supabase
          .from("pairing_group_members")
          .select(
            `id, group_id,
             pairing_groups!inner ( id, round_id )`
          )
          .eq("entry_id", entry_id);
        type PgmRow = {
          group_id: string;
          pairing_groups:
            | { id: string; round_id: string }
            | { id: string; round_id: string }[]
            | null;
        };
        for (const row of (pgmRows ?? []) as unknown as PgmRow[]) {
          const pg = Array.isArray(row.pairing_groups)
            ? row.pairing_groups[0]
            : row.pairing_groups;
          if (pg?.round_id) {
            groupByRound.set(String(pg.round_id), String(row.group_id));
          }
        }
      }

      // 6. Insertar.
      const insertRows = targetRoundIds.map((rid) => ({
        tournament_id,
        entry_id,
        caddie_id,
        round_id: rid,
        pairing_group_id: groupByRound.get(rid) ?? null,
        role: "marker",
        is_active: true,
      }));
      if (insertRows.length > 0) {
        const { error: bulkErr } = await supabase
          .from("caddie_assignments")
          .insert(insertRows);
        if (bulkErr) {
          console.warn(
            "[caddies] no se pudo propagar caddie al resto de rondas:",
            bulkErr.message
          );
        }
      }
    }
  } catch (err) {
    // No abortamos la asignación principal si algo falla al propagar.
    console.warn("[caddies] error propagando caddie a otras rondas:", err);
  }

  revalidatePath("/caddies");
  revalidatePath("/entries");
  if (redirect_to) {
    // Asignación desde Inscritos / búsqueda directa — regresamos al
    // contexto original sin pasar por la tabla completa de caddies.
    revalidatePath(redirect_to);
    redirect(redirect_to);
  }
  redirectBack(tournament_id, round_id);
}

/**
 * Asigna un caddie a un INSCRITO del torneo (sin requerir que la ronda tenga
 * grupos armados): resuelve la primera ronda aplicable y, si existe, su grupo.
 * Además marca al jugador como FAVORITO del caddie (sin borrar otros favoritos).
 *
 * Usado por el panel "Buscar caddie y asignar jugador" de /caddies, que opera
 * con solo seleccionar el torneo arriba.
 */
export async function assignCaddieByEntryAction(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = clean(formData.get("tournament_id"));
  const entry_id = clean(formData.get("entry_id"));
  const caddie_id = clean(formData.get("caddie_id"));
  const player_id = clean(formData.get("player_id"));
  const caddie_q = clean(formData.get("caddie_q"));

  if (!tournament_id || !entry_id || !caddie_id) {
    throw new Error("Selecciona torneo, caddie e inscrito.");
  }

  const { data: entry } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id")
    .eq("id", entry_id)
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!entry) {
    throw new Error("El inscrito no pertenece a ese torneo.");
  }

  const { roundId, pairingGroupId } = await resolveDefaultRoundForEntry(
    supabase,
    tournament_id,
    entry_id
  );

  if (!roundId) {
    throw new Error(
      "El torneo no tiene rondas configuradas. Crea las rondas primero."
    );
  }

  const result = await assignCaddieToEntry(supabase, {
    tournamentId: tournament_id,
    entryId: entry_id,
    caddieId: caddie_id,
    roundId,
    pairingGroupId,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  // Marcar al jugador como favorito del caddie (sin tocar los demás favoritos).
  if (player_id) {
    const { data: existingFav } = await supabase
      .from("caddie_favorites")
      .select("id")
      .eq("caddie_id", caddie_id)
      .eq("player_id", player_id)
      .maybeSingle();

    if (!existingFav) {
      const { error: favErr } = await supabase
        .from("caddie_favorites")
        .insert({ caddie_id, player_id });
      if (favErr) {
        console.warn("[caddies] no se pudo marcar favorito:", favErr.message);
      }
    }
  }

  revalidatePath("/caddies");
  revalidatePath("/caddies/new");
  revalidatePath("/entries");
  redirectBack(tournament_id, "", caddie_q);
}

export async function deleteCaddieAssignmentAction(formData: FormData) {
  const supabase = createAdminClient();

  const assignment_id = clean(formData.get("assignment_id"));
  const tournament_id = clean(formData.get("tournament_id"));
  const round_id = clean(formData.get("round_id"));

  if (!assignment_id) {
    throw new Error("Falta assignment_id");
  }

  const { error } = await supabase
    .from("caddie_assignments")
    .update({ is_active: false })
    .eq("id", assignment_id);

  if (error) throw new Error(error.message);

  revalidatePath("/caddies");
  revalidatePath("/entries");
  redirectBack(tournament_id, round_id);
}

export async function deactivateCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const id = clean(formData.get("caddie_id"));

  const { error } = await supabase
    .from("caddies")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/caddies");
}

export async function activateCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const id = clean(formData.get("caddie_id"));

  const { error } = await supabase
    .from("caddies")
    .update({ is_active: true })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/caddies");
}

export async function deleteCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const id = clean(formData.get("caddie_id"));

  const { count } = await supabase
    .from("caddie_assignments")
    .select("id", { count: "exact", head: true })
    .eq("caddie_id", id);

  if ((count ?? 0) > 0) {
    throw new Error("No se puede eliminar, tiene asignaciones");
  }

  const { error } = await supabase.from("caddies").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/caddies");
}