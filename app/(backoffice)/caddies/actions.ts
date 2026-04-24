"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function redirectBack(tournamentId: string, roundId: string) {
  const params = new URLSearchParams();

  if (tournamentId) params.set("tournament_id", tournamentId);
  if (roundId) params.set("round_id", roundId);

  const qs = params.toString();
  redirect(qs ? `/caddies?${qs}` : "/caddies");
}

export async function assignCaddieAction(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = clean(formData.get("tournament_id"));
  const entry_id = clean(formData.get("entry_id"));
  const caddie_id = clean(formData.get("caddie_id"));
  const round_id = clean(formData.get("round_id"));
  const pairing_group_id = clean(formData.get("pairing_group_id"));

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

  revalidatePath("/caddies");
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