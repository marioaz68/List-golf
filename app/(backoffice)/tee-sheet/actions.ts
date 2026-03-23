"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

function computeShotgunHole(groupIndexZeroBased: number, totalGroups: number) {
  if (totalGroups <= 18) return (groupIndexZeroBased % 18) + 1;
  if (totalGroups <= 36) return (Math.floor(groupIndexZeroBased / 2) % 18) + 1;
  throw new Error("Demasiados grupos para shotgun (máximo 36 con doble salida por hoyo).");
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

export async function clearGroups(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: oldGroups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id")
    .eq("round_id", round_id);

  if (gErr) throw new Error("Error leyendo grupos: " + gErr.message);

  const ids = (oldGroups ?? []).map((x: any) => x.id);

  if (ids.length > 0) {
    const { error: delM } = await supabase.from("pairing_group_members").delete().in("group_id", ids);
    if (delM) throw new Error("Error borrando miembros: " + delM.message);

    const { error: delG } = await supabase.from("pairing_groups").delete().eq("round_id", round_id);
    if (delG) throw new Error("Error borrando grupos: " + delG.message);
  }

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function updateGroup(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
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
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, start_type, start_time, interval_minutes")
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
    reqStr(formData, "round_id");

    const entry_id = reqStr(formData, "entry_id");
    const to_group_id = reqStr(formData, "to_group_id");
    const target_position = reqInt(formData, "target_position");

    if (target_position < 1) throw new Error("target_position debe ser >= 1");

    const { error } = await supabase.rpc("move_entry_to_group_position", {
      p_entry_id: entry_id,
      p_to_group_id: to_group_id,
      p_target_position: target_position,
    });

    if (error) throw new Error("Error moviendo jugador (posición): " + error.message);

    revalidatePath("/tee-sheet");
    return { ok: true };
  } catch (e: any) {
    throw new Error(e?.message ? String(e.message) : "Error moviendo jugador");
  }
}

export async function moveEntryToGroup(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
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
    .select("id, tournament_id, org_id")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round (org_id): " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const org_id = r.org_id as string;

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
    org_id,
    group_id: to_group_id,
    entry_id,
    position: newPos,
  });

  if (insErr) throw new Error("Error moviendo jugador a grupo destino: " + insErr.message);

  await renumberPositions(supabase, from_group_id);
  await renumberPositions(supabase, to_group_id);

  revalidatePath("/tee-sheet");
  redirectToTeeSheet({ tournament_id, round_id, group_size, cat });
}

export async function balanceGroupsByCategory(formData: FormData) {
  try {
    const supabase = await createClient();

    reqStr(formData, "tournament_id");
    const round_id = reqStr(formData, "round_id");
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

export async function generateGroupsByCategory(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const round_id = reqStr(formData, "round_id");
  const group_size = reqGroupSize(formData);
  const cat = optStr(formData, "cat");

  const { data: r, error: rErr } = await supabase
    .from("rounds")
    .select("id, org_id, tournament_id, start_type, start_time, interval_minutes")
    .eq("id", round_id)
    .single();

  if (rErr || !r) throw new Error("No se pudo leer round: " + (rErr?.message ?? ""));
  if (r.tournament_id !== tournament_id) throw new Error("El round no pertenece al torneo seleccionado.");

  const org_id = r.org_id as string;
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

  const { data: eData, error: eErr } = await supabase
    .from("tournament_entries")
    .select(`
      id,
      handicap_index,
      category_id,
      players:players ( first_name, last_name, gender, birth_year )
    `)
    .eq("tournament_id", tournament_id)
    .in("status", ["active", "confirmed"]);

  if (eErr) throw new Error("Error leyendo inscritos: " + eErr.message);

  const entries: EntryRow[] = (eData ?? []) as any[];
  if (entries.length === 0) {
    throw new Error("No hay inscritos (status active/confirmed) para generar grupos.");
  }

  const { data: oldGroups, error: gErr } = await supabase
    .from("pairing_groups")
    .select("id")
    .eq("round_id", round_id);

  if (gErr) throw new Error("Error leyendo grupos previos: " + gErr.message);

  const oldGroupIds = (oldGroups ?? []).map((x: any) => x.id);

  if (oldGroupIds.length > 0) {
    const { error: delM } = await supabase
      .from("pairing_group_members")
      .delete()
      .in("group_id", oldGroupIds);

    if (delM) throw new Error("Error borrando miembros previos: " + delM.message);

    const { error: delG } = await supabase
      .from("pairing_groups")
      .delete()
      .eq("round_id", round_id);

    if (delG) throw new Error("Error borrando grupos previos: " + delG.message);
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

  const catKeys = Array.from(byCat.keys()).sort((a, b) => {
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

  const groupedChunks: typeof resolved[][] = [];

  for (const k of catKeys) {
    const list = byCat.get(k)!;

    list.sort((a, b) => {
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

    groupedChunks.push(...chunkN(list, group_size));
  }

  const totalGroups = groupedChunks.length;
  let groupNo = 1;

  for (let i = 0; i < groupedChunks.length; i++) {
    const g = groupedChunks[i];

    const tee_time =
      canAutoTeeTimes ? formatHHMM((baseMinutes as number) + i * (interval as number)) : null;

    const starting_hole =
      startType === "shotgun" ? computeShotgunHole(i, totalGroups) : null;

    const catId = g[0]?._catId ?? "NO_CAT";
    const meta = catId !== "NO_CAT" ? catMetaById.get(catId) : null;

    let notes: string | null = null;
    if (catId === "NO_CAT") {
      notes = "SIN CATEGORÍA";
    } else if (meta) {
      notes = [meta.code, meta.name].filter(Boolean).join(" — ") || "SIN CATEGORÍA";
    }

    const { data: pg, error: insG } = await supabase
      .from("pairing_groups")
      .insert({
        org_id,
        tournament_id,
        round_id,
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
      org_id,
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