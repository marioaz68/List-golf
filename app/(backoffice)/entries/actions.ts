"use server";

import { createClient, createAdminClient } from "@/utils/supabase/server";
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
  max_players: number | null;
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
    max_players:
      c.max_players === null || c.max_players === undefined
        ? null
        : Number(c.max_players),
  }));
}

function chunkArray<T>(arr: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function buildEntriesRedirect(params: {
  tournamentId: string;
  tab?: string;
  bulkStatus?: "success" | "warning" | "error";
  bulkMessage?: string;
  addedCount?: number;
  skippedCount?: number;
  selectedCount?: number;
}) {
  const search = new URLSearchParams();

  search.set("tournament_id", params.tournamentId);
  search.set("tab", params.tab ?? "bulk");

  if (params.bulkStatus) search.set("bulk_status", params.bulkStatus);
  if (params.bulkMessage) search.set("bulk_message", params.bulkMessage);
  if (typeof params.addedCount === "number") {
    search.set("bulk_added", String(params.addedCount));
  }
  if (typeof params.skippedCount === "number") {
    search.set("bulk_skipped", String(params.skippedCount));
  }
  if (typeof params.selectedCount === "number") {
    search.set("bulk_selected", String(params.selectedCount));
  }

  return `/entries?${search.toString()}`;
}

async function getTournamentData(supabase: any, tournament_id: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournament_id)
    .single();

  if (error || !data) {
    throw new Error("Torneo no encontrado: " + (error?.message ?? ""));
  }

  return data as { id: string };
}

async function getTournamentCats(supabase: any, tournament_id: string) {
  const { data: catsData, error: cErr } = await supabase
    .from("categories")
    .select("id, gender, handicap_min, handicap_max, code, max_players")
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

async function getActiveEntryCountByCategory(
  supabase: any,
  params: {
    categoryId: string;
    excludeEntryId?: string;
  }
) {
  let query = supabase
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("category_id", params.categoryId)
    .neq("status", "dq")
    .neq("status", "withdrawn");

  if (params.excludeEntryId) {
    query = query.neq("id", params.excludeEntryId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error("Error contando jugadores por categoría: " + error.message);
  }

  return count ?? 0;
}

async function validateCategoryCapacity(params: {
  supabase: any;
  cats: Cat[];
  categoryId: string | null;
  addCount?: number;
  excludeEntryId?: string;
}) {
  const { supabase, cats, categoryId, addCount = 1, excludeEntryId } = params;

  if (!categoryId) return;

  const cat = cats.find((c) => c.id === categoryId);
  const maxPlayers = cat?.max_players ?? null;

  if (maxPlayers === null || maxPlayers === undefined) return;

  const currentCount = await getActiveEntryCountByCategory(supabase, {
    categoryId,
    excludeEntryId,
  });

  if (currentCount + addCount > maxPlayers) {
    throw new Error(
      `CAPACITY_FULL|Categoría ${cat?.code || ""} llena. Límite ${maxPlayers}, inscritos actuales ${currentCount}.`
    );
  }
}

async function validateBulkCategoryCapacity(params: {
  supabase: any;
  cats: Cat[];
  rows: Array<{ category_id: string | null }>;
}) {
  const { supabase, cats, rows } = params;

  const addByCategory = new Map<string, number>();

  for (const row of rows) {
    if (!row.category_id) continue;
    addByCategory.set(row.category_id, (addByCategory.get(row.category_id) ?? 0) + 1);
  }

  for (const [categoryId, addCount] of addByCategory.entries()) {
    await validateCategoryCapacity({
      supabase,
      cats,
      categoryId,
      addCount,
    });
  }
}

async function getEntryOrThrow(admin: any, entryId: string) {
  const { data, error } = await admin
    .from("tournament_entries")
    .select("id, tournament_id, player_id, status")
    .eq("id", entryId)
    .single();

  if (error || !data) {
    throw new Error("Entry no encontrado: " + (error?.message ?? ""));
  }

  return data as {
    id: string;
    tournament_id: string;
    player_id: string;
    status: string | null;
  };
}

async function getTournamentRoundIds(admin: any, tournamentId: string) {
  const { data, error } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (error) {
    throw new Error("Error leyendo rondas del torneo: " + error.message);
  }

  return ((data ?? []) as Array<{ id: string }>).map((x) => x.id);
}

async function getLatestTournamentRound(admin: any, tournamentId: string) {
  const { data, error } = await admin
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_date", { ascending: false, nullsFirst: false })
    .order("round_no", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Error leyendo ronda del torneo: " + error.message);
  }

  return (data ?? null) as
    | {
        id: string;
        round_no: number | null;
        round_date: string | null;
      }
    | null;
}

async function getRoundScoresForPlayerInTournament(
  admin: any,
  params: { tournamentId: string; playerId: string }
) {
  const roundIds = await getTournamentRoundIds(admin, params.tournamentId);
  if (roundIds.length === 0) return [];

  const { data, error } = await admin
    .from("round_scores")
    .select("id, round_id, gross_score, player_id")
    .eq("player_id", params.playerId)
    .in("round_id", roundIds);

  if (error) {
    throw new Error("Error leyendo round_scores del jugador: " + error.message);
  }

  return (data ?? []) as Array<{
    id: string;
    round_id: string | null;
    gross_score: number | null;
    player_id: string | null;
  }>;
}

async function getHoleScoresCountForRoundScoreIds(
  admin: any,
  roundScoreIds: string[]
) {
  if (roundScoreIds.length === 0) return 0;

  const { count, error } = await admin
    .from("hole_scores")
    .select("id", { count: "exact", head: true })
    .in("round_score_id", roundScoreIds);

  if (error) {
    throw new Error("Error leyendo hole_scores: " + error.message);
  }

  return count ?? 0;
}

export async function addEntry(formData: FormData) {
  const supabase = await createClient();
  const admin = await createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const player_id = reqStr(formData, "player_id");
  const handicap_index_input = optNum(formData, "handicap_index");

  await getTournamentData(supabase, tournament_id);

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
    throw new Error(
      "El jugador no tiene handicap_index y no se capturó handicap torneo."
    );
  }

  const cats = await getTournamentCats(supabase, tournament_id);
  const category_id = pickCategoryId({ cats, playerGender, handicap });

  try {
    await validateCategoryCapacity({
      supabase,
      cats,
      categoryId: category_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo inscribir.";

    if (message.startsWith("CAPACITY_FULL|")) {
      redirect(
        buildEntriesRedirect({
          tournamentId: tournament_id,
          tab: "manual",
          bulkStatus: "error",
          bulkMessage: message.replace("CAPACITY_FULL|", ""),
        })
      );
    }

    throw err;
  }

  const { error } = await admin.from("tournament_entries").insert({
    tournament_id,
    player_id,
    handicap_index: handicap,
    category_id,
    status: "confirmed",
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();

    if (msg.includes("duplicate") || msg.includes("unique")) {
      redirect(
        buildEntriesRedirect({
          tournamentId: tournament_id,
          tab: "manual",
          bulkStatus: "warning",
          bulkMessage: "El jugador ya está inscrito en este torneo.",
        })
      );
    }

    throw new Error(error.message);
  }

  revalidatePath("/entries");
  revalidatePath("/players");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function createPlayerAndAddEntry(formData: FormData) {
  const supabase = await createClient();
  const admin = await createAdminClient();

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

  await getTournamentData(supabase, tournament_id);
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

  const playerGender = String(newPlayer.gender ?? "X").toUpperCase() as
    | "M"
    | "F"
    | "X";
  const handicap = Number(newPlayer.handicap_index ?? handicap_index ?? 0);
  const category_id =
    handicap != null && Number.isFinite(handicap)
      ? pickCategoryId({ cats, playerGender, handicap })
      : null;

  try {
    await validateCategoryCapacity({
      supabase,
      cats,
      categoryId: category_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo inscribir.";

    if (message.startsWith("CAPACITY_FULL|")) {
      redirect(
        buildEntriesRedirect({
          tournamentId: tournament_id,
          tab: "manual",
          bulkStatus: "error",
          bulkMessage: message.replace("CAPACITY_FULL|", ""),
        })
      );
    }

    throw err;
  }

  const { error: eErr } = await admin.from("tournament_entries").insert({
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
  const admin = await createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const playerIdsRaw = formData.getAll("player_ids");
  const playerIds = [...new Set(playerIdsRaw.map((x) => String(x)).filter(Boolean))];

  if (playerIds.length === 0) {
    redirect(
      buildEntriesRedirect({
        tournamentId: tournament_id,
        tab: "bulk",
        bulkStatus: "warning",
        bulkMessage: "No seleccionaste jugadores.",
        selectedCount: 0,
        addedCount: 0,
        skippedCount: 0,
      })
    );
  }

  await getTournamentData(supabase, tournament_id);
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
        const playerGender = String(p.gender ?? "X").toUpperCase() as
          | "M"
          | "F"
          | "X";

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
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  try {
    await validateBulkCategoryCapacity({
      supabase,
      cats,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo inscribir.";

    if (message.startsWith("CAPACITY_FULL|")) {
      redirect(
        buildEntriesRedirect({
          tournamentId: tournament_id,
          tab: "bulk",
          bulkStatus: "error",
          bulkMessage: message.replace("CAPACITY_FULL|", ""),
          selectedCount: playerIds.length,
          addedCount: 0,
          skippedCount: playerIds.length,
        })
      );
    }

    throw err;
  }

  const addedCount = rows.length;
  const selectedCount = playerIds.length;
  const skippedCount = Math.max(selectedCount - addedCount, 0);

  if (addedCount === 0) {
    revalidatePath("/entries");
    redirect(
      buildEntriesRedirect({
        tournamentId: tournament_id,
        tab: "bulk",
        bulkStatus: "warning",
        bulkMessage: "Todos los jugadores seleccionados ya estaban inscritos.",
        selectedCount,
        addedCount,
        skippedCount,
      })
    );
  }

  for (const batch of chunkArray(rows, 100)) {
    const { error: insErr } = await admin.from("tournament_entries").insert(batch);

    if (insErr) {
      throw new Error("Error insertando entries seleccionados: " + insErr.message);
    }
  }

  revalidatePath("/entries");
  revalidatePath("/players");

  redirect(
    buildEntriesRedirect({
      tournamentId: tournament_id,
      tab: "bulk",
      bulkStatus: "success",
      bulkMessage:
        skippedCount > 0
          ? `Se inscribieron ${addedCount} jugadores. ${skippedCount} ya estaban inscritos.`
          : `Se inscribieron ${addedCount} jugadores correctamente.`,
      selectedCount,
      addedCount,
      skippedCount,
    })
  );
}

export async function deleteEntry(formData: FormData) {
  const admin = await createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const entry = await getEntryOrThrow(admin, id);

  const roundScores = await getRoundScoresForPlayerInTournament(admin, {
    tournamentId: tournament_id,
    playerId: entry.player_id,
  });

  const roundScoreIds = roundScores.map((x) => x.id);
  const holeScoresCount = await getHoleScoresCountForRoundScoreIds(
    admin,
    roundScoreIds
  );

  if (holeScoresCount > 0) {
    for (const rs of roundScores) {
      const { error: updateErr } = await admin
        .from("round_scores")
        .update({ gross_score: 400 })
        .eq("id", rs.id);

      if (updateErr) {
        throw new Error("Error actualizando round_scores a DQ: " + updateErr.message);
      }
    }

    const { error: entryErr } = await admin
      .from("tournament_entries")
      .update({ status: "dq" })
      .eq("id", entry.id);

    if (entryErr) {
      throw new Error("Error marcando entry como dq: " + entryErr.message);
    }

    revalidatePath("/entries");
    revalidatePath("/leaderboard");
    revalidatePath("/score-entry");
    redirect(`/entries?tournament_id=${tournament_id}&tab=entries`);
  }

  if (roundScoreIds.length > 0) {
    const { error: deleteRoundScoresErr } = await admin
      .from("round_scores")
      .delete()
      .in("id", roundScoreIds);

    if (deleteRoundScoresErr) {
      throw new Error(
        "Error eliminando tarjetas vacías del jugador: " +
          deleteRoundScoresErr.message
      );
    }
  }

  const { error } = await admin
    .from("tournament_entries")
    .delete()
    .eq("id", entry.id);

  if (error) throw new Error(error.message);

  revalidatePath("/entries");
  revalidatePath("/leaderboard");
  revalidatePath("/score-entry");
  redirect(`/entries?tournament_id=${tournament_id}&tab=entries`);
}

export async function withdrawEntry(formData: FormData) {
  const admin = await createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  await getEntryOrThrow(admin, id);

  const { error } = await admin
    .from("tournament_entries")
    .update({ status: "withdrawn" })
    .eq("id", id);

  if (error) throw new Error("Error dando de baja entry: " + error.message);

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}&tab=entries`);
}

export async function disqualifyEntry(formData: FormData) {
  const admin = await createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const entry = await getEntryOrThrow(admin, id);
  const round = await getLatestTournamentRound(admin, tournament_id);

  if (!round) {
    throw new Error("No hay rondas creadas en este torneo para marcar DQ.");
  }

  const { data: existingRoundScore, error: roundScoreErr } = await admin
    .from("round_scores")
    .select("id")
    .eq("player_id", entry.player_id)
    .eq("round_id", round.id)
    .maybeSingle();

  if (roundScoreErr) {
    throw new Error("Error leyendo round_score actual: " + roundScoreErr.message);
  }

  let roundScoreId = existingRoundScore?.id ?? null;

  if (roundScoreId) {
    const { error: updateErr } = await admin
      .from("round_scores")
      .update({ gross_score: 400 })
      .eq("id", roundScoreId);

    if (updateErr) {
      throw new Error("Error actualizando DQ en round_scores: " + updateErr.message);
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("round_scores")
      .insert({
        player_id: entry.player_id,
        round_id: round.id,
        gross_score: 400,
      })
      .select("id")
      .single();

    if (insertErr) {
      throw new Error("Error creando DQ en round_scores: " + insertErr.message);
    }

    roundScoreId = inserted.id;
  }

  const { error: entryErr } = await admin
    .from("tournament_entries")
    .update({ status: "dq" })
    .eq("id", entry.id);

  if (entryErr) {
    throw new Error("Error marcando entry como dq: " + entryErr.message);
  }

  revalidatePath("/entries");
  revalidatePath("/leaderboard");
  revalidatePath("/score-entry");
  redirect(`/entries?tournament_id=${tournament_id}&tab=entries`);
}

export async function restoreEntry(formData: FormData) {
  const admin = await createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const { error } = await admin
    .from("tournament_entries")
    .update({ status: "confirmed" })
    .eq("id", id);

  if (error) {
    throw new Error("Error restaurando entry: " + error.message);
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}&tab=entries`);
}

export async function updateEntryHandicap(formData: FormData) {
  const supabase = await createClient();
  const admin = await createAdminClient();

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

  await validateCategoryCapacity({
    supabase,
    cats,
    categoryId: category_id,
    excludeEntryId: id,
  });

  const { error } = await admin
    .from("tournament_entries")
    .update({ handicap_index: handicap, category_id })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function autoCategorizeEntries(formData: FormData) {
  const supabase = await createClient();
  const admin = await createAdminClient();

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
    const playerGender = String(e.players?.gender ?? "X").toUpperCase() as
      | "M"
      | "F"
      | "X";
    const hEntry = e.handicap_index == null ? null : Number(e.handicap_index);
    const hPlayer =
      e.players?.handicap_index == null ? null : Number(e.players.handicap_index);
    const handicap = hEntry ?? hPlayer;

    if (handicap == null || !Number.isFinite(handicap)) continue;

    const category_id = pickCategoryId({ cats, playerGender, handicap });

    const { error } = await admin
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
  const admin = await createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  const rawLimit = Number(formData.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 30;

  await getTournamentData(supabase, tournament_id);
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
        const playerGender = String(p.gender ?? "X").toUpperCase() as
          | "M"
          | "F"
          | "X";

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
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  await validateBulkCategoryCapacity({
    supabase,
    cats,
    rows,
  });

  if (rows.length > 0) {
    for (const batch of chunkArray(rows, 100)) {
      const { error: insErr } = await admin.from("tournament_entries").insert(batch);
      if (insErr) throw new Error("Error insertando entries: " + insErr.message);
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}

export async function enrollAllPlayersToTournament(formData: FormData) {
  const supabase = await createClient();
  const admin = await createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureEntriesAccess(tournament_id);

  await getTournamentData(supabase, tournament_id);
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
        const playerGender = String(p.gender ?? "X").toUpperCase() as
          | "M"
          | "F"
          | "X";

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
          tournament_id,
          player_id: p.id,
          handicap_index: handicap,
          category_id,
          status: "confirmed",
        };
      }) || [];

  await validateBulkCategoryCapacity({
    supabase,
    cats,
    rows,
  });

  if (rows.length > 0) {
    for (const batch of chunkArray(rows, 100)) {
      const { error: insErr } = await admin.from("tournament_entries").insert(batch);
      if (insErr) throw new Error("Error insertando entries: " + insErr.message);
    }
  }

  revalidatePath("/entries");
  redirect(`/entries?tournament_id=${tournament_id}`);
}
