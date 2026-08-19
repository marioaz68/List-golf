import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGroupPairSides } from "./loadGroupPairSides";
import {
  assignmentsAreOpposing,
  buildOpposingWitnessAssignments,
} from "./pairWitness";

export type WitnessAssignment = {
  entryId: string;
  witnessEntryId: string;
};

/**
 * Devuelve los testigos asignados al grupo. Si no existen, los genera al
 * azar (cada jugador ⇒ un testigo distinto del propio grupo, jamás el
 * mismo jugador) y los persiste. Grupos de 1 jugador → no se asigna nada.
 *
 * En torneo de parejas: el testigo es siempre de la pareja rival (nunca el
 * compañero). Si ya había asignaciones inválidas (compañero como testigo),
 * se regeneran.
 */
export async function ensureGroupWitnesses(
  admin: SupabaseClient,
  groupId: string
): Promise<WitnessAssignment[]> {
  const gid = groupId.trim();
  if (!gid) return [];

  const pairSides = await loadGroupPairSides(admin, gid);

  const { data: existing } = await admin
    .from("score_witnesses")
    .select("entry_id, witness_entry_id")
    .eq("group_id", gid);

  const existingRows = (existing ?? []) as Array<{
    entry_id: string;
    witness_entry_id: string;
  }>;

  const { data: members } = await admin
    .from("pairing_group_members")
    .select("entry_id, position")
    .eq("group_id", gid)
    .order("position", { ascending: true });

  const entryIds = ((members ?? []) as Array<{
    entry_id: string | null;
    position: number | null;
  }>)
    .map((m) => String(m.entry_id ?? "").trim())
    .filter(Boolean);

  if (entryIds.length < 2) return [];

  const mappedExisting: WitnessAssignment[] = existingRows.map((r) => ({
    entryId: r.entry_id,
    witnessEntryId: r.witness_entry_id,
  }));

  if (pairSides) {
    const covering = mappedExisting.filter((r) => entryIds.includes(r.entryId));
    if (
      covering.length === entryIds.length &&
      assignmentsAreOpposing(covering, pairSides)
    ) {
      return covering;
    }
    const assignments = buildOpposingWitnessAssignments(entryIds, pairSides);
    await persistAssignments(admin, gid, assignments, { replace: true });
    return assignments;
  }

  if (existingRows.length > 0) {
    return mappedExisting;
  }

  const assignments = buildRandomDerangement(entryIds);
  await persistAssignments(admin, gid, assignments, { replace: false });
  return assignments;
}

export async function getGroupWitnesses(
  admin: SupabaseClient,
  groupId: string
): Promise<WitnessAssignment[]> {
  const gid = groupId.trim();
  if (!gid) return [];

  const { data } = await admin
    .from("score_witnesses")
    .select("entry_id, witness_entry_id")
    .eq("group_id", gid);

  return ((data ?? []) as Array<{
    entry_id: string;
    witness_entry_id: string;
  }>).map((r) => ({
    entryId: r.entry_id,
    witnessEntryId: r.witness_entry_id,
  }));
}

async function persistAssignments(
  admin: SupabaseClient,
  groupId: string,
  assignments: WitnessAssignment[],
  opts: { replace: boolean }
): Promise<void> {
  if (assignments.length === 0) return;
  if (opts.replace) {
    await admin.from("score_witnesses").delete().eq("group_id", groupId);
  }
  const rows = assignments.map((a) => ({
    group_id: groupId,
    entry_id: a.entryId,
    witness_entry_id: a.witnessEntryId,
  }));
  await admin
    .from("score_witnesses")
    .upsert(rows, { onConflict: "group_id,entry_id" });
}

function buildRandomDerangement(entryIds: string[]): WitnessAssignment[] {
  const n = entryIds.length;
  if (n < 2) return [];

  const shuffled = [...entryIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < n; i += 1) {
    if (shuffled[i] === entryIds[i]) {
      const swap = (i + 1) % n;
      [shuffled[i], shuffled[swap]] = [shuffled[swap], shuffled[i]];
    }
  }

  for (let i = 0; i < n; i += 1) {
    if (shuffled[i] === entryIds[i]) {
      const partner = i === 0 ? 1 : 0;
      [shuffled[i], shuffled[partner]] = [shuffled[partner], shuffled[i]];
    }
  }

  return entryIds.map((eid, idx) => ({
    entryId: eid,
    witnessEntryId: shuffled[idx],
  }));
}
