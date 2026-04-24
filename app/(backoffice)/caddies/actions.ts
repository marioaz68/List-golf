"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

type PairingGroupRow = {
  id: string;
  tee_time: string | null;
  round_id: string;
};

type ExistingAssignmentRow = {
  id: string;
  entry_id: string;
  pairing_group_id: string | null;
  round_id: string | null;
  is_active: boolean | null;
};

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function assignCaddieAction(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = clean(formData.get("tournament_id"));
  const entry_id = clean(formData.get("entry_id"));
  const caddie_id = clean(formData.get("caddie_id"));
  const round_id = clean(formData.get("round_id"));
  const pairing_group_id = clean(formData.get("pairing_group_id"));

  if (!tournament_id || !entry_id || !caddie_id) {
    throw new Error("Datos incompletos para asignación");
  }

  if (!round_id) {
    throw new Error("Falta round_id");
  }

  // 🔵 CASO 1: no hay grupo → permitir asignar sin validación
  if (!pairing_group_id) {
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
      pairing_group_id: null,
      role: "marker",
      is_active: true,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/caddies");
    return;
  }

  // 🔵 Leer grupo actual
  const { data: currentGroup, error: currentGroupError } = await supabase
    .from("pairing_groups")
    .select("id, tee_time, round_id")
    .eq("id", pairing_group_id)
    .maybeSingle();

  if (currentGroupError) {
    throw new Error(`Error leyendo grupo: ${currentGroupError.message}`);
  }

  const currentPairingGroup = currentGroup as PairingGroupRow | null;

  // 🔵 CASO 2: grupo no existe → permitir asignar
  if (!currentPairingGroup) {
    const { error } = await supabase.from("caddie_assignments").insert({
      tournament_id,
      entry_id,
      caddie_id,
      round_id,
      pairing_group_id,
      role: "marker",
      is_active: true,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/caddies");
    return;
  }

  // 🔵 CASO 3: NO hay tee_time → permitir asignar SIN validar conflictos
  if (!currentPairingGroup.tee_time) {
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
      pairing_group_id,
      role: "marker",
      is_active: true,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/caddies");
    return;
  }

  // 🔴 CASO 4: SÍ hay tee_time → validar conflicto real

  const { data: sameTimeGroupsData, error: sameTimeGroupsError } = await supabase
    .from("pairing_groups")
    .select("id")
    .eq("round_id", round_id)
    .eq("tee_time", currentPairingGroup.tee_time);

  if (sameTimeGroupsError) {
    throw new Error("Error validando grupos por hora");
  }

  const sameTimeGroupIds = (sameTimeGroupsData ?? []).map((g) => g.id);

  const { data: conflictsData, error: conflictsError } = await supabase
    .from("caddie_assignments")
    .select("entry_id, pairing_group_id")
    .eq("tournament_id", tournament_id)
    .eq("caddie_id", caddie_id)
    .eq("round_id", round_id)
    .eq("is_active", true)
    .in("pairing_group_id", sameTimeGroupIds);

  if (conflictsError) {
    throw new Error("Error validando conflicto");
  }

  const conflict = (conflictsData ?? []).find((a) => {
    return a.entry_id !== entry_id;
  });

  if (conflict) {
    throw new Error(
      "Conflicto: este caddie ya está asignado a otro grupo en la misma hora"
    );
  }

  // 🔵 Guardar asignación
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
    pairing_group_id,
    role: "marker",
    is_active: true,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/caddies");
}

// =======================
// ACTIVAR / DESACTIVAR
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