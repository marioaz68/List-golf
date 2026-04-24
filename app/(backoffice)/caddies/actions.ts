"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";

type PairingGroupRow = {
  id: string;
  tee_time: string | null;
  round_id: string;
};

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

  // 🔵 helper para guardar
  async function saveAssignment() {
    await supabase
      .from("caddie_assignments")
      .update({ is_active: false })
      .eq("tournament_id", tournament_id)
      .eq("entry_id", entry_id)
      .eq("round_id", round_id)
      .eq("is_active", true);

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

  // 🔵 SIN GRUPO
  if (!pairing_group_id) {
    await saveAssignment();
  }

  // 🔵 leer grupo
  const { data: group } = await supabase
    .from("pairing_groups")
    .select("id, tee_time, round_id")
    .eq("id", pairing_group_id)
    .maybeSingle();

  const currentGroup = group as PairingGroupRow | null;

  // 🔵 SIN GRUPO REAL → permitir
  if (!currentGroup) {
    await saveAssignment();
  }

  // 🔵 SIN TEE TIME → permitir
  if (!currentGroup?.tee_time) {
    await saveAssignment();
  }

  // 🔴 validar conflicto SOLO si hay hora

  const { data: sameTimeGroups } = await supabase
    .from("pairing_groups")
    .select("id")
    .eq("round_id", round_id)
    .eq("tee_time", currentGroup!.tee_time);

  const groupIds = (sameTimeGroups ?? []).map((g) => g.id);

  const { data: conflicts } = await supabase
    .from("caddie_assignments")
    .select("entry_id")
    .eq("tournament_id", tournament_id)
    .eq("caddie_id", caddie_id)
    .eq("round_id", round_id)
    .eq("is_active", true)
    .in("pairing_group_id", groupIds);

  const conflict = (conflicts ?? []).find((a) => a.entry_id !== entry_id);

  if (conflict) {
    throw new Error("Conflicto: caddie ocupado en misma hora");
  }

  await saveAssignment();
}

// =======================
// BAJA
// =======================

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

// =======================
// REACTIVAR
// =======================

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

// =======================
// ELIMINAR
// =======================

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