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
    throw new Error("Falta round_id para validar horario del caddie");
  }

  if (!pairing_group_id) {
    throw new Error("Falta pairing_group_id para validar horario del caddie");
  }

  const { data: currentGroup, error: currentGroupError } = await supabase
    .from("pairing_groups")
    .select("id, tee_time, round_id")
    .eq("id", pairing_group_id)
    .maybeSingle();

  if (currentGroupError) {
    throw new Error(`No se pudo leer el grupo actual: ${currentGroupError.message}`);
  }

  const currentPairingGroup = currentGroup as PairingGroupRow | null;

  if (!currentPairingGroup) {
    throw new Error("El grupo actual no existe");
  }

  if (!currentPairingGroup.tee_time) {
    throw new Error("El grupo actual no tiene tee_time; no se puede validar conflicto");
  }

  const { data: sameTimeGroupsData, error: sameTimeGroupsError } = await supabase
    .from("pairing_groups")
    .select("id, tee_time, round_id")
    .eq("round_id", round_id)
    .eq("tee_time", currentPairingGroup.tee_time);

  if (sameTimeGroupsError) {
    throw new Error(`No se pudo validar grupos de la misma hora: ${sameTimeGroupsError.message}`);
  }

  const sameTimeGroups = (sameTimeGroupsData ?? []) as PairingGroupRow[];
  const sameTimeGroupIds = sameTimeGroups.map((g) => g.id);

  if (sameTimeGroupIds.length === 0) {
    throw new Error("No se encontraron grupos para validar conflicto de horario");
  }

  const { data: conflictingAssignmentsData, error: conflictingAssignmentsError } =
    await supabase
      .from("caddie_assignments")
      .select("id, entry_id, pairing_group_id, round_id, is_active")
      .eq("tournament_id", tournament_id)
      .eq("caddie_id", caddie_id)
      .eq("round_id", round_id)
      .eq("is_active", true)
      .in("pairing_group_id", sameTimeGroupIds);

  if (conflictingAssignmentsError) {
    throw new Error(
      `No se pudo validar conflicto de asignación: ${conflictingAssignmentsError.message}`
    );
  }

  const conflictingAssignments =
    (conflictingAssignmentsData ?? []) as ExistingAssignmentRow[];

  const realConflict = conflictingAssignments.find((a) => {
    const sameEntry = a.entry_id === entry_id;
    const sameGroup = (a.pairing_group_id ?? "") === pairing_group_id;
    return !(sameEntry && sameGroup);
  });

  if (realConflict) {
    throw new Error(
      "Conflicto de horario: este caddie ya está asignado a otro grupo en la misma ronda y a la misma hora"
    );
  }

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

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/caddies");
}

export async function deactivateCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const caddieId = clean(formData.get("caddie_id"));

  if (!caddieId) {
    throw new Error("Falta caddie_id");
  }

  const { error } = await supabase
    .from("caddies")
    .update({ is_active: false })
    .eq("id", caddieId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/caddies");
}

export async function activateCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const caddieId = clean(formData.get("caddie_id"));

  if (!caddieId) {
    throw new Error("Falta caddie_id");
  }

  const { error } = await supabase
    .from("caddies")
    .update({ is_active: true })
    .eq("id", caddieId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/caddies");
}

export async function deleteCaddieAction(formData: FormData) {
  const supabase = createAdminClient();
  const caddieId = clean(formData.get("caddie_id"));

  if (!caddieId) {
    throw new Error("Falta caddie_id");
  }

  const { count, error: countError } = await supabase
    .from("caddie_assignments")
    .select("id", { count: "exact", head: true })
    .eq("caddie_id", caddieId);

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error(
      "No se puede eliminar este caddie porque ya tiene asignaciones. Usa BAJA en su lugar."
    );
  }

  const { error } = await supabase.from("caddies").delete().eq("id", caddieId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/caddies");
}