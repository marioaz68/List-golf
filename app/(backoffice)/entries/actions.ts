"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
}

function optNum(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return n;
}

type Cat = {
  id: string;
  gender: "M" | "F" | "X";
  handicap_min: number;
  handicap_max: number;
  code: string;
};

function pickCategoryId(params: {
  cats: Cat[];
  playerGender: "M" | "F" | "X";
  handicap: number;
}) {
  const { cats, playerGender, handicap } = params;

  const candidates = cats.filter((c) => {
    const genderOk = c.gender === playerGender || c.gender === "X";
    return genderOk && handicap >= c.handicap_min && handicap <= c.handicap_max;
  });

  if (candidates.length === 0) return null;

  const exact = candidates.filter((c) => c.gender === playerGender);
  const pool = exact.length > 0 ? exact : candidates;

  pool.sort((a, b) => a.handicap_min - b.handicap_min);

  return pool[0].id;
}

function mapCats(catsData: any[]): Cat[] {
  return (catsData ?? []).map((c: any) => ({
    id: c.id,
    gender: String(c.gender ?? "X").toUpperCase() as "M" | "F" | "X",
    handicap_min: Number(c.handicap_min),
    handicap_max: Number(c.handicap_max),
    code: String(c.code ?? ""),
  }));
}

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function getTournamentData(supabase: any, tournament_id: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, org_id")
    .eq("id", tournament_id)
    .single();

  if (error || !data) {
    throw new Error("Torneo no encontrado: " + (error?.message ?? ""));
  }

  return data as { id: string; org_id: string };
}

async function getTournamentCats(supabase: any, tournament_id: string) {
  const { data: catsData, error: cErr } = await supabase
    .from("categories")
    .select("id, gender, handicap_min, handicap_max, code")
    .eq("tournament_id", tournament_id);

  if (cErr) throw new Error("Error leyendo categorías: " + cErr.message);

  return mapCats(catsData as any[]);
}

async function ensureEntriesAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
      "checkin",
    ],
  });
}

export async function addEntry(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const player_id = reqStr(formData, "player_id");
  const handicap_index_input = optNum(formData, "handicap_index");

  const t = await getTournamentData(supabase, tournament_id);

  const { data: p, error: pErr } = await supabase
    .from("players")
    .select("gender, handicap_index")
    .eq("id", player_id)
    .single();

  if (pErr) throw new Error("Error leyendo jugador: " + pErr.message);

  const playerGender = String(p?.gender ?? "X").toUpperCase() as "M" | "F" | "X";
  const playerHI = p?.handicap_index ?? null;
  const handicap = handicap_index_input ?? playerHI;

  if (handicap === null) {
    throw new Error("El jugador no tiene handicap_index y no se capturó handicap torneo.");
  }

  const cats = await getTournamentCats(supabase, tournament_id);
  const category_id = pickCategoryId({ cats, playerGender, handicap });

  const { error } = await supabase.from("tournament_entries").insert({
    org_id: t.org_id,
    tournament_id,
    player_id,
    handicap_index: handicap,
    category_id,
    status: "confirmed",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/entries");
  revalidatePath("/players");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function createPlayerAndAddEntry(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const first_name = reqStr(formData, "first_name");
  const last_name = reqStr(formData, "last_name");
  const gender = reqStr(formData, "gender").toUpperCase() as "M" | "F";
  const handicap_index = optNum(formData, "handicap_index") ?? 0;

  const club = optStr(formData, "club");
  const city = optStr(formData, "city");
  const email = optStr(formData, "email");
  const phone = optStr(formData, "phone");
  const member_type = optStr(formData, "member_type");

  const t = await getTournamentData(supabase, tournament_id);
  const cats = await getTournamentCats(supabase, tournament_id);

  const { data: newPlayer, error: pErr } = await supabase
    .from("players")
    .insert({
      first_name,
      last_name,
      gender,
      handicap_index,
      club,
      city,
      email,
      phone,
      member_type,
      is_active: true,
    })
    .select("id, gender, handicap_index")
    .single();

  if (pErr) throw new Error("Error creando jugador: " + pErr.message);

  const playerGender = String(newPlayer.gender ?? "X").toUpperCase() as "M" | "F" | "X";
  const handicap = Number(newPlayer.handicap_index ?? handicap_index ?? 0);
  const category_id =
    handicap != null && Number.isFinite(handicap)
      ? pickCategoryId({ cats, playerGender, handicap })
      : null;

  const { error: eErr } = await supabase.from("tournament_entries").insert({
    org_id: t.org_id,
    tournament_id,
    player_id: newPlayer.id,
    handicap_index: handicap,
    category_id,
    status: "confirmed",
  });

  if (eErr) throw new Error("Error inscribiendo jugador nuevo: " + eErr.message);

  revalidatePath("/entries");
  revalidatePath("/players");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function addSelectedEntries(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const playerIdsRaw = formData.getAll("player_ids");
  const playerIds = [...new Set(playerIdsRaw.map((x) => String(x)).filter(Boolean))];

  if (playerIds.length === 0) {
    throw new Error("No seleccionaste jugadores.");
  }

  const t = await getTournamentData(supabase, tournament_id);
  const cats = await getTournamentCats(supabase, tournament_id);

  const chunks = chunkArray(playerIds, 100);

  const playersAll: any[] = [];
  for (const ids of chunks) {
    const { data, error } = await supabase
      .from("players")
      .select("id, gender, handicap_torneo, handicap_index")
      .in("id", ids);

    if (error) {
      throw new Error("Error leyendo players seleccionados: " + error.message);
    }

    playersAll.push(...(data ?? []));
  }

  const existingAll: any[] = [];
  for (const ids of chunks) {
    const { data, error } = await supabase
      .from("tournament_entries")
      .select("player_id")
      .eq("tournament_id", tournament_id)
      .in("player_id", ids);

    if (error) {
      throw new Error("Error leyendo entries existentes: " + error.message);
    }

    existingAll.push(...(data ?? []));
  }

  const existingSet = new Set(existingAll.map((x: any) => x.player_id));

  const rows =
    playersAll
      .filter((p: any) => !existingSet.has(p.id))
      .map((p: any) => {
        const playerGender = String(p.gender ?? "X").toUpperCase() as "M" | "F" | "X";

        const handicap =
          p.handicap_torneo != null
            ? Number(p.handicap_torneo)
            : p.handicap_index != null
              ? Number(p.handicap_index)
              : null;

        const category_id =
          handicap != null && Number.isFinite(handicap)
            ? pickCategoryId({ cats, playerGender, handicap })
            : null;

        return {
          org_id: t.org_id,
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  if (rows.length > 0) {
    for (const batch of chunkArray(rows, 100)) {
      const { error: insErr } = await supabase.from("tournament_entries").insert(batch);
      if (insErr) {
        throw new Error("Error insertando entries seleccionados: " + insErr.message);
      }
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function deleteEntry(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const { error } = await supabase.from("tournament_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function updateEntryHandicap(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  const player_id = reqStr(formData, "player_id");
  await ensureEntriesAccess(tournament_id);

  const handicap = optNum(formData, "handicap_index");
  if (handicap === null) throw new Error("handicap_index requerido");

  const { data: p, error: pErr } = await supabase
    .from("players")
    .select("gender")
    .eq("id", player_id)
    .single();

  if (pErr) throw new Error("Error leyendo jugador: " + pErr.message);

  const playerGender = String(p?.gender ?? "X").toUpperCase() as "M" | "F" | "X";
  const cats = await getTournamentCats(supabase, tournament_id);
  const category_id = pickCategoryId({ cats, playerGender, handicap });

  const { error } = await supabase
    .from("tournament_entries")
    .update({ handicap_index: handicap, category_id })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function autoCategorizeEntries(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const cats = await getTournamentCats(supabase, tournament_id);

  const { data: eData, error: eErr } = await supabase
    .from("tournament_entries")
    .select(
      `
      id,
      player_id,
      handicap_index,
      players:players (
        gender,
        handicap_index
      )
    `
    )
    .eq("tournament_id", tournament_id);

  if (eErr) throw new Error("Error leyendo entries: " + eErr.message);

  const entries = (eData ?? []) as any[];

  for (const e of entries) {
    const playerGender = String(e.players?.gender ?? "X").toUpperCase() as "M" | "F" | "X";
    const hEntry = e.handicap_index == null ? null : Number(e.handicap_index);
    const hPlayer = e.players?.handicap_index == null ? null : Number(e.players.handicap_index);
    const handicap = hEntry ?? hPlayer;

    if (handicap == null || !Number.isFinite(handicap)) continue;

    const category_id = pickCategoryId({ cats, playerGender, handicap });

    const { error } = await supabase
      .from("tournament_entries")
      .update({ category_id, handicap_index: hEntry ?? handicap })
      .eq("id", e.id);

    if (error) {
      throw new Error("Error actualizando entry " + e.id + ": " + error.message);
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function enrollExcelPlayersToTournament(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const rawLimit = Number(formData.get("limit") ?? 30);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : 30;

  const t = await getTournamentData(supabase, tournament_id);
  const cats = await getTournamentCats(supabase, tournament_id);

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, gender, handicap_torneo, handicap_index")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (pErr) throw new Error("Error leyendo players: " + pErr.message);

  const { data: existing, error: eErr } = await supabase
    .from("tournament_entries")
    .select("player_id")
    .eq("tournament_id", tournament_id);

  if (eErr) throw new Error("Error leyendo entries existentes: " + eErr.message);

  const existingSet = new Set((existing ?? []).map((x: any) => x.player_id));

  const rows =
    (players ?? [])
      .filter((p: any) => !existingSet.has(p.id))
      .slice(0, limit)
      .map((p: any) => {
        const playerGender = String(p.gender ?? "X").toUpperCase() as "M" | "F" | "X";

        const handicap =
          p.handicap_torneo != null
            ? Number(p.handicap_torneo)
            : p.handicap_index != null
              ? Number(p.handicap_index)
              : null;

        const category_id =
          handicap != null && Number.isFinite(handicap)
            ? pickCategoryId({ cats, playerGender, handicap })
            : null;

        return {
          org_id: t.org_id,
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  if (rows.length > 0) {
    for (const batch of chunkArray(rows, 100)) {
      const { error: insErr } = await supabase.from("tournament_entries").insert(batch);
      if (insErr) throw new Error("Error insertando entries: " + insErr.message);
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function enrollAllPlayersToTournament(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const t = await getTournamentData(supabase, tournament_id);
  const cats = await getTournamentCats(supabase, tournament_id);

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, gender, handicap_torneo, handicap_index")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (pErr) throw new Error("Error leyendo players: " + pErr.message);

  const { data: existing, error: eErr } = await supabase
    .from("tournament_entries")
    .select("player_id")
    .eq("tournament_id", tournament_id);

  if (eErr) throw new Error("Error leyendo entries existentes: " + eErr.message);

  const existingSet = new Set((existing ?? []).map((x: any) => x.player_id));

  const rows =
    (players ?? [])
      .filter((p: any) => !existingSet.has(p.id))
      .map((p: any) => {
        const playerGender = String(p.gender ?? "X").toUpperCase() as "M" | "F" | "X";

        const handicap =
          p.handicap_torneo != null
            ? Number(p.handicap_torneo)
            : p.handicap_index != null
              ? Number(p.handicap_index)
              : null;

        const category_id =
          handicap != null && Number.isFinite(handicap)
            ? pickCategoryId({ cats, playerGender, handicap })
            : null;

        return {
          org_id: t.org_id,
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  if (rows.length > 0) {
    for (const batch of chunkArray(rows, 100)) {
      const { error: insErr } = await supabase.from("tournament_entries").insert(batch);
      if (insErr) throw new Error("Error insertando entries: " + insErr.message);
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}