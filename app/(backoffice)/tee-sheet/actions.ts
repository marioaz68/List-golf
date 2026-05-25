"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { listCategoriesBlockedForRound } from "@/lib/rounds/categoryRoundGate";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import {
  buildTeeSheetEntryOrderMap,
  sortEntriesForTeeSheetRound,
  type TeeSheetEntryOrderInfo,
} from "@/lib/tee-sheet/leaderboardOrderForPairing";
import {
  assertRegistrationClosedForTeeSheet,
  fetchTournamentRegistrationStatus,
} from "@/lib/tournaments/registrationGate";
import { roundsInSameSession, type SessionRoundFields } from "./sessionBlock";
import { repairCutRulesTargetFinalRound } from "@/lib/convocatoria/upgradeTournamentRules";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

function optInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
}

function reqInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
}

function reqGroupSize(fd: FormData) {
  const raw = String(fd.get("group_size") ?? "").trim();
  const n = Number(raw || "4");
  if (!Number.isFinite(n)) return 4;
  if (n < 2 || n > 8) return 4;
  return Math.trunc(n);
}

function redirectToTeeSheet(params: {
  tournament_id: string;
  round_id: string;
  group_size: number;
  cat?: string | null;
}) {
  const qs = new URLSearchParams({
    tournament_id: params.tournament_id,
    round_id: params.round_id,
    group_size: String(params.group_size),
  });

  if (params.cat && params.cat !== "ALL") {
    qs.set("cat", params.cat);
  }

  redirect(`/tee-sheet?${qs.toString()}`);
}

type EntryRow = {
  id: string;
  handicap_index: number | null;
  category_id: string | null;
  players?: {
    first_name?: string;
    last_name?: string;
    gender?: string | null;
    birth_year?: number | null;
  } | null;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  handicap_min: number | null;
  handicap_max: number | null;
  gender: "M" | "F" | "X" | null;
  category_group:
    | "main"
    | "senior"
    | "ladies"
    | "super_senior"
    | "mixed"
    | null;
};

function chunkN<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function getPlayerAgeFromBirthYear(birthYear: number | null | undefined) {
  if (!birthYear || !Number.isFinite(Number(birthYear))) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - Number(birthYear);
}

function parseHHMM(s: string) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

function formatHHMM(totalMinutes: number) {
  const mins = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

function computeShotgunHole(groupIndexZeroBased: number, totalGroups: number) {
  const slots = buildShotgunSlots(totalGroups);
  const slot = slots[groupIndexZeroBased];
  if (!slot) {
    throw new Error("Demasiados grupos para shotgun (máximo 36 con doble salida por hoyo).");
  }
  return slot.hole;
}

type ShotgunSlot = {
  hole: number;
  side: "A" | "B";
  order: number;
};

function getShotgunExtraHoleOrder() {
  // Prioridad para DOBLES salidas:
  // 1) H1 y H10.
  // 2) Pares 5.
  // 3) Pares 4.
  // 4) Pares 3 solo cuando ya no hay otra opción; por ejemplo, si hay 36 grupos.
  //
  // TODO futuro: leer par real desde tournament_holes/course_holes.
  // Por ahora usamos el orden base del campo cargado en código.
  const primary = [1, 10];
  const par5 = [5, 9, 14, 18];
  const par4 = [2, 4, 6, 11, 13, 15, 17];
  const par3 = [8, 3, 7, 12, 16];

  return [...primary, ...par5, ...par4, ...par3];
}

function buildShotgunSlots(totalGroups?: number) {
  // Regla del bloque completo:
  // 1) Primero se define cuántos grupos hay en TODO el bloque.
  // 2) Los primeros 18 grupos ocupan una salida A en cada hoyo.
  // 3) Si hay más de 18, se agregan salidas B en esta prioridad:
  //    H1/H10, pares 5, pares 4 y pares 3 solamente si el bloque se acerca a 36.
  // 4) En un hoyo doble, B sale antes que A.
  // 5) Las categorías se consumen completas en esta secuencia, sin mezclarse.
  const groupCount = totalGroups ?? 36;
  if (groupCount > 36) {
    throw new Error("Demasiados grupos para shotgun (máximo 36 con doble salida por hoyo).");
  }

  const extraNeeded = Math.max(0, groupCount - 18);
  const doubleHoles = new Set(getShotgunExtraHoleOrder().slice(0, extraNeeded));

  const slots: ShotgunSlot[] = [];

  for (let hole = 1; hole <= 18; hole++) {
    if (doubleHoles.has(hole)) {
      slots.push({ hole, side: "B", order: slots.length + 1 });
      slots.push({ hole, side: "A", order: slots.length + 1 });
    } else {
      slots.push({ hole, side: "A", order: slots.length + 1 });
    }
  }

  return slots.slice(0, groupCount);
}

function isStartingOrderConfirmed(notes: string | null | undefined) {
  return String(notes ?? "").includes(STARTING_ORDER_CONFIRMED_MARKER);
}

function stripStartingOrderConfirmedMarker(notes: string | null | undefined) {
  return String(notes ?? "")
    .replace(STARTING_ORDER_CONFIRMED_MARKER, "")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim() || null;
}

async function loadTournamentSessionRounds(
  supabase: any,
  tournament_id: string,
  round_id: string
): Promise<SessionRoundFields[]> {
  const { data, error } = await supabase
    .from("rounds")
    .select(
      "id, tournament_id, category_id, round_no, round_date, start_type, start_time, interval_minutes, wave"
    )
    .eq("tournament_id", tournament_id);

  if (error) {
    throw new Error("Error leyendo rondas del torneo: " + error.message);
  }

  return roundsInSameSession((data ?? []) as SessionRoundFields[], round_id);
}

function resolveRoundIdForCategoryInSession(
  categoryId: string,
  sessionRounds: SessionRoundFields[],
  fallbackRoundId: string
): string {
  if (categoryId === "NO_CAT") {
    const shared = sessionRounds.find((sr) => !String(sr.category_id ?? "").trim());
    return shared?.id ?? fallbackRoundId;
  }

  const exact = sessionRounds.find(
    (sr) => String(sr.category_id ?? "").trim() === categoryId
  );
  if (exact) return exact.id;

  const shared = sessionRounds.find((sr) => !String(sr.category_id ?? "").trim());
  return shared?.id ?? fallbackRoundId;
}

async function ensureSessionStartingOrderIsEditable(
  supabase: any,
  sessionRounds: SessionRoundFields[]
) {
  for (const sr of sessionRounds) {
    await ensureStartingOrderIsEditable(supabase, sr.id);
  }
}

async function deletePairingGroupsForRoundIds(supabase: any, roundIds: string[]) {
  if (roundIds.length === 0) return;

  const { data: oldGroups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id")
    .in("round_id", roundIds);

  if (gErr) throw new Error("Error leyendo grupos previos: " + gErr.message);

  const oldGroupIds = (oldGroups ?? []).map((x: { id: string }) => x.id);
  if (oldGroupIds.length === 0) return;

  const { error: delM } = await supabase
    .from("pairing_group_members")
    .delete()
    .in("group_id", oldGroupIds);

  if (delM) throw new Error("Error borrando miembros previos: " + delM.message);

  const { error: delG } = await supabase
    .from("pairing_groups")
    .delete()
    .in("round_id", roundIds);

  if (delG) throw new Error("Error borrando grupos previos: " + delG.message);
}

async function ensureStartingOrderIsEditable(supabase: any, round_id: string) {
  const { data, error } = await supabase
    .from("rounds")
    .select("id, notes")
    .eq("id", round_id)
    .single();

  if (error || !data) {
    throw new Error("No se pudo validar si el orden de salidas está confirmado: " + (error?.message ?? ""));
  }

  if (isStartingOrderConfirmed(data.notes)) {
    throw new Error("El orden de salidas de este día ya está confirmado. Primero reabre el orden si necesitas cambiar grupos o salidas.");
  }
}

function slotSortKey(slot: ShotgunSlot) {
  return slot.order;
}

async function renumberPositions(supabase: any, group_id: string) {
  const { data, error } = await supabase
    .from("pairing_group_members")
    .select("id, position")
    .eq("group_id", group_id)
    .order("position", { ascending: true });

  if (error) throw new Error("Error leyendo miembros para renumerar: " + error.message);

  const rows = (data ?? []) as any[];
  for (let i = 0; i < rows.length; i++) {
    const desired = i + 1;
    if (Number(rows[i].position) === desired) continue;

    const { error: upErr } = await supabase
      .from("pairing_group_members")
      .update({ position: desired })
      .eq("id", rows[i].id);

    if (upErr) throw new Error("Error renumerando posiciones: " + upErr.message);
  }
}

async function applyOrderedPositions(
  supabase: any,
  group_id: string,
  orderedEntryIds: string[]
) {
  const { data, error } = await supabase
    .from("pairing_group_members")
    .select("id, entry_id, position")
    .eq("group_id", group_id);

  if (error) {
    throw new Error("Error leyendo miembros para reordenar: " + error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    entry_id: string;
    position: number | null;
  }>;

  const rowByEntryId = new Map(rows.map((r) => [r.entry_id, r]));

  for (let i = 0; i < orderedEntryIds.length; i++) {
    const entryId = orderedEntryIds[i];
    const row = rowByEntryId.get(entryId);
    if (!row) continue;

    const desired = i + 1;
    if (Number(row.position ?? 0) === desired) continue;

    const { error: upErr } = await supabase
      .from("pairing_group_members")
      .update({ position: desired })
      .eq("id", row.id);

    if (upErr) {
      throw new Error("Error actualizando posiciones: " + upErr.message);
    }
  }
}

async function compactGroupsForRound(supabase: any, round_id: string) {
  const { data: groups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", round_id)
    .order("group_no", { ascending: true });

  if (gErr) throw new Error("Error leyendo grupos para compactar: " + gErr.message);

  const list = (groups ?? []) as Array<{ id: string; group_no: number }>;
  if (list.length === 0) return;

  const ids = list.map((g) => g.id);

  const { data: members, error: mErr } = await supabase
    .from("pairing_group_members")
    .select("group_id")
    .in("group_id", ids);

  if (mErr) throw new Error("Error leyendo miembros para compactar: " + mErr.message);

  const countByGroupId = new Map<string, number>();
  for (const id of ids) countByGroupId.set(id, 0);

  for (const row of (members ?? []) as Array<{ group_id: string }>) {
    countByGroupId.set(row.group_id, (countByGroupId.get(row.group_id) ?? 0) + 1);
  }

  const emptyIds = list
    .filter((g) => (countByGroupId.get(g.id) ?? 0) === 0)
    .map((g) => g.id);

  if (emptyIds.length > 0) {
    const { error: delErr } = await supabase
      .from("pairing_groups")
      .delete()
      .in("id", emptyIds);

    if (delErr) throw new Error("Error borrando grupos vacíos: " + delErr.message);
  }

  const { data: aliveGroups, error: aliveErr } = await supabase
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", round_id)
    .order("group_no", { ascending: true });

  if (aliveErr) throw new Error("Error leyendo grupos vivos: " + aliveErr.message);

  const alive = (aliveGroups ?? []) as Array<{ id: string; group_no: number }>;

  for (let i = 0; i < alive.length; i++) {
    const desired = i + 1;
    if (Number(alive[i].group_no) === desired) continue;

    const { error: upErr } = await supabase
      .from("pairing_groups")
      .update({ group_no: desired })
      .eq("id", alive[i].id);

    if (upErr) throw new Error("Error renumerando group_no: " + upErr.message);
  }
}

async function recalcStartsForRound(supabase: any, round_id: string) {
  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, start_type, start_time, interval_minutes")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round para recalcular salidas: " + (rErr?.message ?? ""));

  const { data: groups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", round_id)
    .order("group_no", { ascending: true });

  if (gErr) throw new Error("Error leyendo grupos para recalcular salidas: " + gErr.message);

  const list = (groups ?? []) as Array<{ id: string; group_no: number }>;

  if (r.start_type === "tee_times") {
    const baseMinutes = typeof r.start_time === "string" ? parseHHMM(r.start_time) : null;
    const interval = r.interval_minutes == null ? null : Number(r.interval_minutes);

    if (baseMinutes == null) return;
    if (interval == null || !Number.isFinite(interval) || interval <= 0) return;

    for (const g of list) {
      const groupNo = Number(g.group_no);
      const tee_time = formatHHMM(baseMinutes + (groupNo - 1) * interval);

      const { error } = await supabase
        .from("pairing_groups")
        .update({
          tee_time,
          starting_hole: null,
        })
        .eq("id", g.id);

      if (error) throw new Error("Error recalculando tee_time: " + error.message);
    }

    return;
  }

  if (r.start_type === "shotgun") {
    // En shotgun, los hoyos ya se asignan desde la planeación por carriles H1/H10.
    // Al mover jugadores con DnD no debemos recalcularlos, porque rompería el orden aprobado.
    return;
  }
}

export async function clearGroups(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const sessionRounds = await loadTournamentSessionRounds(
    supabase,
    tournament_id,
    round_id
  );
  await ensureSessionStartingOrderIsEditable(supabase, sessionRounds);
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const sessionRoundIds = sessionRounds.map((sr) => sr.id);
  await deletePairingGroupsForRoundIds(supabase, sessionRoundIds);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function updateGroup(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  await ensureStartingOrderIsEditable(supabase, round_id);
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const tee_time = optStr(formData, "tee_time");
  const starting_hole = optInt(formData, "starting_hole");
  const notes = optStr(formData, "notes");

  if (starting_hole != null && (starting_hole < 1 || starting_hole > 18)) {
    throw new Error("starting_hole debe ser entre 1 y 18");
  }

  if (tee_time != null && parseHHMM(tee_time) == null) {
    throw new Error("tee_time inválido. Usa HH:MM (ej. 07:30)");
  }

  const { error } = await supabase
    .from("pairing_groups")
    .update({ tee_time, starting_hole, notes })
    .eq("id", id);

  if (error) throw new Error("Error actualizando grupo: " + error.message);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function recalculateTeeTimes(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  await ensureStartingOrderIsEditable(supabase, round_id);
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, category_id, start_type, start_time, interval_minutes")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");
  if (r.start_type !== "tee_times") throw new Error("Este round no es tee_times.");

  const baseMinutes = typeof r.start_time === "string" ? parseHHMM(r.start_time) : null;
  const interval = r.interval_minutes == null ? null : Number(r.interval_minutes);

  if (baseMinutes == null) throw new Error("Falta start_time válido en el round (ej. 07:30).");
  if (interval == null || !Number.isFinite(interval) || interval <= 0) {
    throw new Error("Falta interval_minutes válido (ej. 8 o 10).");
  }

  const { data: groups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", round_id)
    .order("group_no", { ascending: true });

  if (gErr) throw new Error("Error leyendo grupos: " + gErr.message);

  const list = (groups ?? []) as any[];

  for (const g of list) {
    const groupNo = Number(g.group_no);
    const tee_time = formatHHMM(baseMinutes + (groupNo - 1) * interval);

    const { error } = await supabase
      .from("pairing_groups")
      .update({
        tee_time,
        starting_hole: null,
      })
      .eq("id", g.id);

    if (error) throw new Error("Error actualizando tee_time: " + error.message);
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function recalculateStartingHoles(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  await ensureStartingOrderIsEditable(supabase, round_id);
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, start_type")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");
  if (r.start_type !== "shotgun") throw new Error("Este round no es shotgun.");

  const { data: groups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", round_id)
    .order("group_no", { ascending: true });

  if (gErr) throw new Error("Error leyendo grupos: " + gErr.message);

  const list = (groups ?? []) as any[];
  const total = list.length;

  for (let i = 0; i < list.length; i++) {
    const hole = computeShotgunHole(i, total);

    const { error } = await supabase
      .from("pairing_groups")
      .update({
        starting_hole: hole,
        tee_time: null,
      })
      .eq("id", list[i].id);

    if (error) throw new Error("Error actualizando starting_hole: " + error.message);
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function moveEntryToGroupPosition(formData: FormData) {
  try {
    const supabase = await createClient();

    reqStr(formData, "tournament_id");
    const round_id = reqStr(formData, "round_id");
    await ensureStartingOrderIsEditable(supabase, round_id);

    const entry_id = reqStr(formData, "entry_id");
    const to_group_id = reqStr(formData, "to_group_id");
    const target_position = reqInt(formData, "target_position");

    if (target_position < 1) {
      throw new Error("target_position debe ser >= 1");
    }

    // 🔥 1. ELIMINAR DE TODOS LOS GRUPOS (evita duplicados)
    const { error: deleteErr } = await supabase
      .from("pairing_group_members")
      .delete()
      .eq("entry_id", entry_id);

    if (deleteErr) {
      throw new Error("Error limpiando grupos previos: " + deleteErr.message);
    }

    // 🔥 2. LEER DESTINO
    const { data: rows, error: err } = await supabase
      .from("pairing_group_members")
      .select("entry_id, position")
      .eq("group_id", to_group_id)
      .order("position", { ascending: true });

    if (err) {
      throw new Error("Error leyendo grupo destino: " + err.message);
    }

    const ordered = (rows ?? []).map((r: any) => r.entry_id);

    const insertAt = Math.min(
      Math.max(target_position - 1, 0),
      ordered.length
    );

    ordered.splice(insertAt, 0, entry_id);

    // 🔥 3. LIMPIAR GRUPO DESTINO
    const { error: delGroupErr } = await supabase
      .from("pairing_group_members")
      .delete()
      .eq("group_id", to_group_id);

    if (delGroupErr) {
      throw new Error("Error limpiando grupo destino: " + delGroupErr.message);
    }

    // 🔥 4. INSERTAR ORDENADO
    const insertData = ordered.map((id, i) => ({
      group_id: to_group_id,
      entry_id: id,
      position: i + 1,
    }));

    const { error: insErr } = await supabase
      .from("pairing_group_members")
      .insert(insertData);

    if (insErr) {
      throw new Error("Error insertando orden: " + insErr.message);
    }

    // 🔥 5. LIMPIAR GRUPOS VACÍOS + RECORRER
    await compactGroupsForRound(supabase, round_id);
    await recalcStartsForRound(supabase, round_id);

    revalidatePath("/tee-sheet");
    return { ok: true };
  } catch (e: any) {
    throw new Error(e?.message ?? "Error moviendo jugador");
  }
}

export async function moveEntryToGroup(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  await ensureStartingOrderIsEditable(supabase, round_id);
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const entry_id = reqStr(formData, "entry_id");
  const from_group_id = reqStr(formData, "from_group_id");
  const to_group_id = reqStr(formData, "to_group_id");

  if (from_group_id === to_group_id) {
    revalidatePath("/tee-sheet");
    redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
  }

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, tournament_id")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const { error: delErr } = await supabase
    .from("pairing_group_members")
    .delete()
    .eq("group_id", from_group_id)
    .eq("entry_id", entry_id);

  if (delErr) throw new Error("Error quitando jugador del grupo: " + delErr.message);

  const { data: lastPosRow, error: lastErr } = await supabase
    .from("pairing_group_members")
    .select("position")
    .eq("group_id", to_group_id)
    .order("position", { ascending: false })
    .limit(1);

  if (lastErr) throw new Error("Error leyendo posiciones destino: " + lastErr.message);

  const lastPos = (lastPosRow?.[0]?.position ?? 0) as number;
  const newPos = Number(lastPos) + 1;

  const { error: insErr } = await supabase.from("pairing_group_members").insert({
    group_id: to_group_id,
    entry_id,
    position: newPos,
  });

  if (insErr) throw new Error("Error moviendo jugador a grupo destino: " + insErr.message);

  await renumberPositions(supabase, from_group_id);
  await renumberPositions(supabase, to_group_id);
  await compactGroupsForRound(supabase, round_id);
  await recalcStartsForRound(supabase, round_id);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function balanceGroupsByCategory(formData: FormData) {
  try {
    const supabase = await createClient();

    reqStr(formData, "tournament_id");
    const round_id = reqStr(formData, "round_id");
    await ensureStartingOrderIsEditable(supabase, round_id);
    const maxSize = reqGroupSize(formData);

    const { data, error } = await supabase.rpc("balance_groups_by_category", {
      p_round_id: round_id,
      p_max_size: maxSize,
    });

    if (error) {
      throw new Error("RPC balance_groups_by_category: " + error.message);
    }

    revalidatePath("/tee-sheet");
    return { ok: true, data };
  } catch (e: any) {
    throw new Error(e?.message ? String(e.message) : "Error auto-balance");
  }
}

function normalizePlanRows(formData: FormData) {
  const ids = formData.getAll("plan_category_id").map((x) => String(x).trim());
  const orders = formData.getAll("plan_order").map((x) => Number(String(x).trim()));
  const sizes = formData.getAll("plan_group_size").map((x) => Number(String(x).trim()));

  return ids
    .map((id, idx) => {
      const order = Number.isFinite(orders[idx]) ? Math.trunc(orders[idx]) : idx + 1;
      const groupSize = Number.isFinite(sizes[idx]) ? Math.trunc(sizes[idx]) : 4;

      return {
        id,
        order,
        groupSize: groupSize === 5 ? 5 : 4,
      };
    })
    .filter((row) => row.id)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });
}

function buildBalancedChunks<T>(list: T[], preferredSize: number) {
  const total = list.length;
  const size = preferredSize === 5 ? 5 : 4;

  if (total === 0) return [];
  if (total < 3) {
    throw new Error(
      `No se puede generar una categoría con ${total} jugador(es). Para evitar grupos de 1 o 2, mueve esos jugadores de categoría o ajusta la planeación.`
    );
  }

  const minGroups = Math.ceil(total / size);
  const maxGroups = Math.floor(total / 3);

  for (let groupCount = minGroups; groupCount <= maxGroups; groupCount++) {
    const base = Math.floor(total / groupCount);
    const extra = total % groupCount;
    const sizes = Array.from({ length: groupCount }, (_, idx) => base + (idx < extra ? 1 : 0));

    if (sizes.every((n) => n >= 3 && n <= size)) {
      const chunks: T[][] = [];
      let offset = 0;
      for (const n of sizes) {
        chunks.push(list.slice(offset, offset + n));
        offset += n;
      }
      return chunks;
    }
  }

  throw new Error(
    `No se encontró una distribución válida para ${total} jugadores con grupos de ${size}. Ajusta a 4/5 o mueve jugadores antes de generar.`
  );
}

function assignShotgunSlotsByCategoryOrder(
  categories: Array<{ categoryId: string; order: number; chunks: any[][] }>
) {
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const totalGroups = sortedCategories.reduce((acc, category) => acc + category.chunks.length, 0);

  if (totalGroups > 36) {
    throw new Error(
      `Demasiados grupos para shotgun con doble salida por hoyo: ${totalGroups}. Máximo 36. Divide el bloque o mueve categorías a otra sesión.`
    );
  }

  const slots = buildShotgunSlots(totalGroups);
  let slotCursor = 0;

  const out: Array<{
    categoryId: string;
    chunk: any[];
    startingHole: number;
    startingSide: "A" | "B";
    displayOrder: number;
    categoryOrder: number;
    indexWithinCategory: number;
  }> = [];

  for (const category of sortedCategories) {
    // Cada categoría se mantiene junta. Cuando termina una categoría,
    // la siguiente toma la siguiente salida disponible.
    for (let i = 0; i < category.chunks.length; i++) {
      const slot = slots[slotCursor];
      if (!slot) {
        throw new Error(
          "No hay suficientes salidas disponibles para esta planeación. Divide el bloque o cambia grupos de 4/5."
        );
      }

      out.push({
        categoryId: category.categoryId,
        chunk: category.chunks[i],
        startingHole: slot.hole,
        startingSide: slot.side,
        displayOrder: slotSortKey(slot),
        categoryOrder: category.order,
        indexWithinCategory: i,
      });

      slotCursor += 1;
    }
  }

  // Importante: NO ordenar por hoyo. El grupo 1,2,3... queda por categoría.
  return out;
}

export async function saveCategoryPlanOrder(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");
  const planRows = normalizePlanRows(formData);

  await ensureStartingOrderIsEditable(supabase, round_id);

  for (let i = 0; i < planRows.length; i++) {
    const row = planRows[i];
    if (row.id === "NO_CAT") continue;

    const { error } = await supabase
      .from("categories")
      .update({ sort_order: i + 1 })
      .eq("id", row.id)
      .eq("tournament_id", tournament_id);

    if (error) throw new Error("Error guardando orden de categorías: " + error.message);
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function confirmStartingOrder(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: groups, error: groupsErr } = await supabase
    .from("pairing_groups")
    .select("id")
    .eq("round_id", round_id)
    .limit(1);

  if (groupsErr) throw new Error("Error validando grupos: " + groupsErr.message);
  if ((groups ?? []).length === 0) {
    throw new Error("No puedes confirmar el orden definitivo sin grupos generados.");
  }

  const { data: round, error: roundErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, notes")
    .eq("id", round_id)
    .single();

  if (roundErr || !round) throw new Error("No se pudo leer round: " + (roundErr?.message ?? ""));
  if (round.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const currentNotes = String(round.notes ?? "").trim();
  const nextNotes = isStartingOrderConfirmed(currentNotes)
    ? currentNotes
    : [currentNotes, STARTING_ORDER_CONFIRMED_MARKER].filter(Boolean).join("\n");

  const { error } = await supabase
    .from("rounds")
    .update({ notes: nextNotes })
    .eq("id", round_id);

  if (error) throw new Error("Error confirmando orden definitivo: " + error.message);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function reopenStartingOrder(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: round, error: roundErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, notes")
    .eq("id", round_id)
    .single();

  if (roundErr || !round) throw new Error("No se pudo leer round: " + (roundErr?.message ?? ""));
  if (round.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const { error } = await supabase
    .from("rounds")
    .update({ notes: stripStartingOrderConfirmedMarker(round.notes) })
    .eq("id", round_id);

  if (error) throw new Error("Error reabriendo orden definitivo: " + error.message);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function generateMatchPlayTeeSheet(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");

  const intervalRaw = String(formData.get("interval_minutes") ?? "10").trim();
  const intervalNum = Number(intervalRaw);
  const interval =
    Number.isFinite(intervalNum) && intervalNum >= 5 && intervalNum <= 30
      ? Math.trunc(intervalNum)
      : 10;

  const startTimeRaw = String(formData.get("start_time") ?? "").trim();
  const baseMinutes = startTimeRaw ? parseHHMM(startTimeRaw) : null;

  const sessionRounds = await loadTournamentSessionRounds(
    supabase,
    tournament_id,
    round_id
  );
  await ensureSessionStartingOrderIsEditable(supabase, sessionRounds);

  const registrationStatus = await fetchTournamentRegistrationStatus(
    supabase,
    tournament_id
  );
  assertRegistrationClosedForTeeSheet(registrationStatus);

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, round_no, start_type, start_time, interval_minutes")
    .eq("id", round_id)
    .single();

  if (rErr || !r) {
    throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  }
  if (r.tournament_id !== tournament_id) {
    throw new Error("El round no pertenece al torneo seleccionado.");
  }

  const targetRoundNo = Number(r.round_no ?? 1);

  // Persistimos hora/intervalo en el round para que coincidan
  // con la regeneración / recalculo posterior.
  if (baseMinutes != null || interval) {
    const update: Record<string, unknown> = {
      start_type: "tee_times",
      interval_minutes: interval,
    };
    if (baseMinutes != null) update.start_time = formatHHMM(baseMinutes);
    const { error: updRoundErr } = await supabase
      .from("rounds")
      .update(update)
      .eq("id", round_id);
    if (updRoundErr) {
      throw new Error("Error actualizando hora/intervalo del round: " + updRoundErr.message);
    }
  }

  const effectiveBase =
    baseMinutes != null
      ? baseMinutes
      : typeof r.start_time === "string"
        ? parseHHMM(r.start_time)
        : null;

  if (effectiveBase == null) {
    throw new Error(
      "Falta hora de inicio (start_time) válida para el día. Configúrala en el módulo de rondas (ej. 07:00)."
    );
  }

  // Buscamos el bracket activo del torneo.
  const { data: bracket, error: brErr } = await supabase
    .from("matchplay_brackets")
    .select("id, name")
    .eq("tournament_id", tournament_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brErr) {
    throw new Error("Error leyendo bracket: " + brErr.message);
  }
  if (!bracket) {
    throw new Error(
      "No hay bracket de match play creado todavía. Genéralo desde el módulo Match Play antes de armar salidas."
    );
  }

  // Para tee-sheet de match play tomamos el bracket round = round_no del día.
  // Si el día corresponde a una stroke play clasificatoria previa, no habrá
  // matches y mostramos error útil.
  const { data: matchesRaw, error: mErr } = await supabase
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id"
    )
    .eq("bracket_id", bracket.id)
    .eq("round_no", targetRoundNo)
    .order("position_no", { ascending: true });

  if (mErr) {
    throw new Error("Error leyendo matches del bracket: " + mErr.message);
  }

  const matches = (matchesRaw ?? []) as Array<{
    id: string;
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
  }>;

  if (matches.length === 0) {
    throw new Error(
      `No hay matches del bracket para la ronda ${targetRoundNo}. ` +
        `Verifica que esta ronda corresponde a un día de match play y que el bracket esté generado.`
    );
  }

  const realMatches = matches.filter(
    (m) => m.top_pair_id && m.bottom_pair_id
  );

  if (realMatches.length === 0) {
    throw new Error(
      `Todos los matches de la ronda ${targetRoundNo} son BYE o están sin postura. ` +
        `Termina la subasta y la siembra del bracket antes de generar salidas.`
    );
  }

  const pairIds = new Set<string>();
  for (const m of realMatches) {
    if (m.top_pair_id) pairIds.add(m.top_pair_id);
    if (m.bottom_pair_id) pairIds.add(m.bottom_pair_id);
  }

  const { data: teamsRaw, error: tErr } = await supabase
    .from("matchplay_pair_teams")
    .select(
      `id, seed, team_name,
       player_a_entry_id, player_b_entry_id,
       entry_a:tournament_entries!matchplay_pair_teams_player_a_entry_id_fkey (
         id, handicap_index,
         players ( first_name, last_name, gender )
       ),
       entry_b:tournament_entries!matchplay_pair_teams_player_b_entry_id_fkey (
         id, handicap_index,
         players ( first_name, last_name, gender )
       )
      `
    )
    .in("id", Array.from(pairIds));

  if (tErr) {
    throw new Error("Error leyendo parejas de match play: " + tErr.message);
  }

  type TeamLite = {
    id: string;
    seed: number | null;
    entry_a_id: string | null;
    entry_b_id: string | null;
    entry_a_label: string;
    entry_b_label: string;
  };

  function labelEntry(e: any) {
    const p = Array.isArray(e?.players) ? e.players[0] : e?.players;
    const fn = String(p?.first_name ?? "").trim();
    const ln = String(p?.last_name ?? "").trim();
    return [fn, ln].filter(Boolean).join(" ") || "—";
  }

  const teamById = new Map<string, TeamLite>();
  for (const row of (teamsRaw ?? []) as any[]) {
    const ea = Array.isArray(row.entry_a) ? row.entry_a[0] : row.entry_a;
    const eb = Array.isArray(row.entry_b) ? row.entry_b[0] : row.entry_b;
    teamById.set(row.id, {
      id: row.id,
      seed: row.seed ?? null,
      entry_a_id: row.player_a_entry_id ?? null,
      entry_b_id: row.player_b_entry_id ?? null,
      entry_a_label: labelEntry(ea),
      entry_b_label: labelEntry(eb),
    });
  }

  // Borramos cualquier grupo previo del round.
  await deletePairingGroupsForRoundIds(supabase, [round_id]);

  let groupNo = 1;
  for (const match of realMatches) {
    const top = match.top_pair_id ? teamById.get(match.top_pair_id) : null;
    const bot = match.bottom_pair_id ? teamById.get(match.bottom_pair_id) : null;
    if (!top || !bot) continue;

    const teeMinutes = effectiveBase + (groupNo - 1) * interval;
    const tee_time = formatHHMM(teeMinutes);

    const topLabel =
      top.seed != null ? `#${top.seed}` : "TOP";
    const botLabel =
      bot.seed != null ? `#${bot.seed}` : "BOT";

    const notes = `MATCH PLAY · ${topLabel} vs ${botLabel}`;

    const { data: pg, error: insG } = await supabase
      .from("pairing_groups")
      .insert({
        round_id,
        group_no: groupNo,
        tee_time,
        starting_hole: null,
        notes,
      })
      .select("id")
      .single();

    if (insG || !pg) {
      throw new Error("Error creando grupo (foursome): " + (insG?.message ?? ""));
    }

    const orderedEntries = [
      top.entry_a_id,
      top.entry_b_id,
      bot.entry_a_id,
      bot.entry_b_id,
    ].filter((id): id is string => !!id);

    const members = orderedEntries.map((entry_id, idx) => ({
      group_id: pg.id,
      entry_id,
      position: idx + 1,
    }));

    if (members.length > 0) {
      const { error: insM } = await supabase
        .from("pairing_group_members")
        .insert(members);
      if (insM) {
        throw new Error("Error agregando jugadores al foursome: " + insM.message);
      }
    }

    groupNo += 1;
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({
    tournament_id,
    round_id,
    group_size: 4,
    cat: null,
  });
}

export async function generateGroupsByCategory(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");
  const planRows = normalizePlanRows(formData);

  const sessionRounds = await loadTournamentSessionRounds(
    supabase,
    tournament_id,
    round_id
  );
  await ensureSessionStartingOrderIsEditable(supabase, sessionRounds);
  const sessionRoundIds = sessionRounds.map((sr) => sr.id);

  const registrationStatus = await fetchTournamentRegistrationStatus(
    supabase,
    tournament_id
  );
  assertRegistrationClosedForTeeSheet(registrationStatus);

  for (let i = 0; i < planRows.length; i++) {
    const row = planRows[i];
    if (row.id === "NO_CAT") continue;

    const { error: orderErr } = await supabase
      .from("categories")
      .update({ sort_order: i + 1 })
      .eq("id", row.id)
      .eq("tournament_id", tournament_id);

    if (orderErr) throw new Error("Error guardando orden de categorías: " + orderErr.message);
  }

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select(
      "id, tournament_id, category_id, round_no, start_type, start_time, interval_minutes"
    )
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const targetRoundNo = Number(r.round_no ?? 0);
  if (targetRoundNo > 1) {
    const categoryIdsToCheck = planRows
      .map((row) => row.id)
      .filter((id) => id !== "NO_CAT");

    if (categoryIdsToCheck.length > 0) {
      const gateCtx = await loadCategoryRoundGateContext(supabase, tournament_id);
      const { data: tournamentRow } = await supabase
        .from("tournaments")
        .select("settings")
        .eq("id", tournament_id)
        .maybeSingle();
      const blockedIds = listCategoriesBlockedForRound(
        gateCtx.entries,
        gateCtx.rounds,
        targetRoundNo,
        categoryIdsToCheck,
        gateCtx.lookups,
        tournamentRow?.settings ?? null
      );

      if (blockedIds.length > 0) {
        throw new Error(
          `No se pueden generar salidas de la ronda ${targetRoundNo}: la ronda ${targetRoundNo - 1} debe estar cerrada para todas las categorías del plan (${blockedIds.length} pendiente(s)).`
        );
      }
    }
  }

  const startType = (r.start_type as "tee_times" | "shotgun") ?? "tee_times";

  const baseMinutes = typeof r.start_time === "string" ? parseHHMM(r.start_time) : null;
  const interval = r.interval_minutes == null ? null : Number(r.interval_minutes);

  const canAutoTeeTimes =
    startType === "tee_times" &&
    baseMinutes != null &&
    interval != null &&
    Number.isFinite(interval) &&
    interval > 0;

  const { data: cData, error: cErr } = await supabase
    .from("categories")
    .select("id, code, name, handicap_min, handicap_max, gender, category_group")
    .eq("tournament_id", tournament_id)
    .order("sort_order", { ascending: true })
    .order("handicap_min", { ascending: true });

  if (cErr) throw new Error("Error leyendo categorías: " + cErr.message);

  const categories = (cData ?? []) as CategoryRow[];
  const hasCategories = categories.length > 0;

  function isHandicapInsideCategory(hi: number | null, c: CategoryRow) {
    if (hi == null || !Number.isFinite(hi)) return false;
    const min = c.handicap_min == null ? -999999 : Number(c.handicap_min);
    const max = c.handicap_max == null ? 999999 : Number(c.handicap_max);
    return hi >= min && hi <= max;
  }

  function isGenderCompatible(playerGender: string, categoryGender: string | null) {
    const pg = String(playerGender || "X").trim().toUpperCase();
    const cg = String(categoryGender || "X").trim().toUpperCase();

    if (cg === "X") return true;
    return pg === cg;
  }

  function isCategoryGroupCompatible(
    playerGender: string,
    age: number | null,
    categoryGroup: CategoryRow["category_group"]
  ) {
    const cg = categoryGroup ?? "main";
    const pg = String(playerGender || "X").trim().toUpperCase();

    if (cg === "ladies") return pg === "F";
    if (cg === "super_senior") return pg !== "F" && age != null && age >= 65;
    if (cg === "senior") return pg !== "F" && age != null && age >= 50 && age < 65;

    if (cg === "main") {
      if (pg === "F") return false;
      if (age == null) return true;
      return age < 50;
    }

    if (cg === "mixed") return true;

    return false;
  }

  function findCategoryIdForEntry(entry: EntryRow): string | null {
    if (!hasCategories) return null;

    const hi = entry.handicap_index == null ? null : Number(entry.handicap_index);
    const playerGender = String(entry.players?.gender ?? "X").trim().toUpperCase();
    const age = getPlayerAgeFromBirthYear(entry.players?.birth_year ?? null);

    const eligible = categories.filter((c) => {
      return (
        isGenderCompatible(playerGender, c.gender) &&
        isCategoryGroupCompatible(playerGender, age, c.category_group)
      );
    });

    for (const c of eligible) {
      if (isHandicapInsideCategory(hi, c)) return c.id;
    }

    return eligible.length > 0 ? eligible[eligible.length - 1].id : null;
  }

  const catMetaById = new Map<
    string,
    {
      code: string | null;
      name: string | null;
      handicap_min: number | null;
      gender: "M" | "F" | "X" | null;
      category_group:
        | "main"
        | "senior"
        | "ladies"
        | "super_senior"
        | "mixed"
        | null;
    }
  >();

  for (const c of categories) {
    catMetaById.set(c.id, {
      code: c.code ?? null,
      name: c.name ?? null,
      handicap_min: c.handicap_min ?? null,
      gender: c.gender ?? "X",
      category_group: c.category_group ?? "main",
    });
  }

  let entriesQuery = supabase
    .from("tournament_entries")
    .select(`
      id,
      handicap_index,
      category_id,
      players:players ( first_name, last_name, gender, birth_year )
    `)
    .eq("tournament_id", tournament_id)
    .in("status", ["active", "confirmed"]);

  const plannedCategoryIds = planRows.map((row) => row.id).filter((id) => id !== "NO_CAT");
  const roundCategoryId =
    typeof r.category_id === "string" && r.category_id.trim()
      ? r.category_id.trim()
      : null;

  if (plannedCategoryIds.length > 0) {
    entriesQuery = entriesQuery.in("category_id", plannedCategoryIds);
  } else if (roundCategoryId) {
    entriesQuery = entriesQuery.eq("category_id", roundCategoryId);
  }

  const { data: eData, error: eErr } = await entriesQuery;

  if (eErr) throw new Error("Error leyendo inscritos: " + eErr.message);

  const entries: EntryRow[] = (eData ?? []) as any[];
  if (entries.length === 0) {
    throw new Error(
      plannedCategoryIds.length > 0 || roundCategoryId
        ? "No hay inscritos activos/confirmados para las categorías de esta planeación."
        : "No hay inscritos (status active/confirmed) para generar grupos."
    );
  }

  await deletePairingGroupsForRoundIds(supabase, sessionRoundIds);

  let teeSheetEntryOrderMap = new Map<string, TeeSheetEntryOrderInfo>();
  let pairingCutEnforces = false;
  if (targetRoundNo > 1) {
    const admin = await createAdminClient();
    await repairCutRulesTargetFinalRound(admin, tournament_id);
    const pairingOrder = await buildTeeSheetEntryOrderMap(
      admin,
      tournament_id,
      targetRoundNo
    );
    teeSheetEntryOrderMap = pairingOrder.orderMap;
    pairingCutEnforces = pairingOrder.cutEnforces;
  }

  const resolved = entries.map((e) => {
    const hi = e.handicap_index == null ? null : Number(e.handicap_index);

    let finalCatId = "NO_CAT";

    if (e.category_id) {
      const existingCat = categories.find((c) => c.id === e.category_id);
      if (existingCat) {
        finalCatId = existingCat.id;
      } else {
        finalCatId = findCategoryIdForEntry(e) ?? "NO_CAT";
      }
    } else {
      finalCatId = findCategoryIdForEntry(e) ?? "NO_CAT";
    }

    return {
      ...e,
      _hi: hi as number | null,
      _catId: finalCatId as string,
    };
  });

  const byCat = new Map<string, typeof resolved>();
  for (const e of resolved) {
    const key = e._catId;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(e);
  }

  const defaultCatKeys = Array.from(byCat.keys()).sort((a, b) => {
    if (a === "NO_CAT") return 1;
    if (b === "NO_CAT") return -1;

    const aMeta = catMetaById.get(a);
    const bMeta = catMetaById.get(b);

    const kindOrder = {
      main: 1,
      senior: 2,
      super_senior: 3,
      ladies: 4,
      mixed: 5,
    } as const;

    const ak = aMeta?.category_group != null ? kindOrder[aMeta.category_group] : 9999;
    const bk = bMeta?.category_group != null ? kindOrder[bMeta.category_group] : 9999;
    if (ak !== bk) return ak - bk;

    const genderOrder = {
      M: 1,
      X: 2,
      F: 3,
    } as const;

    const ag = aMeta?.gender != null ? genderOrder[aMeta.gender] : 9999;
    const bg = bMeta?.gender != null ? genderOrder[bMeta.gender] : 9999;
    if (ag !== bg) return ag - bg;

    const av = aMeta?.handicap_min == null ? 9999 : Number(aMeta.handicap_min);
    const bv = bMeta?.handicap_min == null ? 9999 : Number(bMeta.handicap_min);

    return av - bv;
  });

  const planByCategory = new Map(planRows.map((row) => [row.id, row]));

  const catKeys = planRows.length > 0
    ? planRows.map((row) => row.id).filter((id) => byCat.has(id))
    : defaultCatKeys;

  type EntryGroupItem = (typeof resolved)[number];
  const plannedCategoryBlocks: Array<{
    categoryId: string;
    order: number;
    chunks: EntryGroupItem[][];
  }> = [];

  for (let catIndex = 0; catIndex < catKeys.length; catIndex++) {
    const k = catKeys[catIndex];
    const list = byCat.get(k);
    if (!list || list.length === 0) continue;

    let orderedList = sortEntriesForTeeSheetRound(
      list,
      targetRoundNo,
      teeSheetEntryOrderMap,
      { cutEnforces: pairingCutEnforces }
    );

    if (targetRoundNo <= 1) {
      orderedList = [...orderedList].sort((a, b) => {
        const ahi = a._hi == null ? 9999 : Number(a._hi);
        const bhi = b._hi == null ? 9999 : Number(b._hi);
        if (ahi !== bhi) return ahi - bhi;

        const al = String(a.players?.last_name ?? "").localeCompare(
          String(b.players?.last_name ?? "")
        );
        if (al !== 0) return al;

        return String(a.players?.first_name ?? "").localeCompare(
          String(b.players?.first_name ?? "")
        );
      });
    }

    const plan = planByCategory.get(k);
    const preferredSize = plan?.groupSize ?? group_size;
    const order = plan?.order ?? catIndex + 1;
    const chunks = buildBalancedChunks(orderedList, preferredSize);

    plannedCategoryBlocks.push({
      categoryId: k,
      order,
      chunks,
    });
  }

  const plannedGroups = startType === "shotgun"
    ? assignShotgunSlotsByCategoryOrder(plannedCategoryBlocks)
    : plannedCategoryBlocks.flatMap((category) =>
        category.chunks.map((chunk, indexWithinCategory) => ({
          categoryId: category.categoryId,
          chunk,
          startingHole: null as number | null,
          indexWithinCategory,
        }))
      );

  if (plannedGroups.length === 0) {
    throw new Error("No hay grupos válidos para generar con la planeación actual.");
  }

  let groupNo = 1;

  for (let i = 0; i < plannedGroups.length; i++) {
    const planned = plannedGroups[i];
    const g = planned.chunk;

    const tee_time =
      startType === "shotgun"
        ? (typeof r.start_time === "string" && r.start_time.trim() ? r.start_time.trim().slice(0, 5) : null)
        : canAutoTeeTimes
          ? formatHHMM((baseMinutes as number) + i * (interval as number))
          : null;

    const starting_hole = startType === "shotgun" ? planned.startingHole : null;

    const catId = planned.categoryId;
    const meta = catId !== "NO_CAT" ? catMetaById.get(catId) : null;

    let notes: string | null = null;
    if (catId === "NO_CAT") {
      notes = "SIN CATEGORÍA";
    } else if (meta) {
      notes = [meta.code, meta.name].filter(Boolean).join(" — ") || "SIN CATEGORÍA";
    }

    const targetRoundId = resolveRoundIdForCategoryInSession(
      catId,
      sessionRounds,
      round_id
    );

    const { data: pg, error: insG } = await supabase
      .from("pairing_groups")
      .insert({
        round_id: targetRoundId,
        group_no: groupNo,
        tee_time,
        starting_hole,
        notes,
      })
      .select("id")
      .single();

    if (insG) throw new Error("Error creando grupo: " + insG.message);

    const group_id = pg.id;

    const members = g.map((e, idx) => ({
      group_id,
      entry_id: e.id,
      position: idx + 1,
    }));

    const { error: insM } = await supabase.from("pairing_group_members").insert(members);
    if (insM) throw new Error("Error creando miembros: " + insM.message);

    groupNo += 1;
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}
