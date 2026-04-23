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

export async function assignCaddieAction(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = String(formData.get("tournament_id") ?? "").trim();
  const entry_id = String(formData.get("entry_id") ?? "").trim();
  const caddie_id = String(formData.get("caddie_id") ?? "").trim();
  const round_id = String(formData.get("round_id") ?? "").trim();
  const pairing_group_id = String(formData.get("pairing_group_id") ?? "").trim();

  if (!tournament_id || !entry_id || !caddie_id) {
    throw new Error("Datos incompletos para asignación");
  }

  if (!round_id) {
    throw new Error("Falta round_id para validar horario del caddie");
  }

  if (!pairing_group_id) {
    throw new Error("Falta pairing_group_id para validar horario del caddie");
  }

  // 1) Leer el grupo actual para obtener su tee_time
  const { data: currentGroup, error: currentGroupError } = await supabase
    .from("pairing_groups")
    .select("id, tee_time, round_id")
    .eq("id", pairing_group_id)
    .single();

  if (currentGroupError) {
    throw new Error(`No se pudo leer el grupo actual: ${currentGroupError.message}`);
  }

  const currentPairingGroup = currentGroup as PairingGroupRow | null;

  if (!currentPairingGroup) {
    throw new Error("No se encontró el grupo actual");
  }

  if (!currentPairingGroup.tee_time) {
    throw new Error("El grupo actual no tiene tee_time; no se puede validar conflicto");
  }

  // 2) Buscar todos los grupos de la misma ronda y misma hora
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

  // 3) Revisar si ese caddie ya está activo en otro grupo de la misma ronda y misma hora
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

  // 4) Desactivar asignaciones previas de ese entry en ese torneo/ronda
  await supabase
    .from("caddie_assignments")
    .update({ is_active: false })
    .eq("tournament_id", tournament_id)
    .eq("entry_id", entry_id)
    .eq("round_id", round_id)
    .eq("is_active", true);

  // 5) Crear nueva asignación
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