"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { validateTeamFormation } from "@/lib/matchplay/validateTeam";
import {
  capMatchPlayPairHandicaps,
  syncPairEntriesCategory,
} from "@/lib/matchplay/capPairToCategory";
import { effectiveEntryHi, formatPlayerName } from "@/lib/matchplay/entryHi";
import { generateSingleElimBracket } from "@/lib/matchplay/generateSingleElimBracket";
import { sortTeamsForSeeding } from "@/lib/matchplay/sortTeamsForSeeding";
import type {
  MatchPlayHandicapAllowance,
  MatchPlaySeedingMethod,
} from "@/lib/matchplay/types";

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
  if (!Number.isFinite(n)) return null;
  return n;
}

async function ensureAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

function redirectMatchPlay(
  tournament_id: string,
  params: Record<string, string> = {}
): never {
  const q = new URLSearchParams({ tournament_id, ...params });
  redirect(`/matchplay?${q.toString()}`);
}

async function assertEntryNotAssigned(
  admin: ReturnType<typeof createAdminClient>,
  tournament_id: string,
  entryIds: string[],
  excludeTeamId?: string
) {
  for (const entryId of entryIds) {
    let q = admin
      .from("matchplay_pair_teams")
      .select("id")
      .eq("tournament_id", tournament_id)
      .eq("is_active", true)
      .or(
        `player_a_entry_id.eq.${entryId},player_b_entry_id.eq.${entryId}`
      );

    if (excludeTeamId) {
      q = q.neq("id", excludeTeamId);
    }

    const { data } = await q.limit(1);
    if (data?.length) {
      throw new Error("Uno de los jugadores ya está asignado a otro equipo.");
    }
  }
}

export async function createMatchPlayTeam(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const data = await loadMatchPlayTeamsData(tournament_id);
  const match_type = data.rules?.match_type ?? "pairs";

  const player_a_entry_id = reqStr(formData, "player_a_entry_id");
  const player_b_entry_id = optStr(formData, "player_b_entry_id");
  let category_id = optStr(formData, "category_id");
  const team_name = optStr(formData, "team_name");
  const seed = optNum(formData, "seed");

  const player_a = data.entries.find((e) => e.id === player_a_entry_id);
  if (!player_a) {
    redirectMatchPlay(tournament_id, {
      team_status: "error",
      team_message: "Inscrito A no encontrado.",
    });
  }

  const player_b = player_b_entry_id
    ? data.entries.find((e) => e.id === player_b_entry_id)
    : null;

  if (!category_id && data.categories.length === 1) {
    category_id = data.categories[0].id;
  }

  const { data: categoryRow } = category_id
    ? await admin
        .from("categories")
        .select("code, name, handicap_min, handicap_max")
        .eq("id", category_id)
        .eq("tournament_id", tournament_id)
        .maybeSingle()
    : { data: null };

  const categorySnapshot = categoryRow
    ? {
        code: categoryRow.code ?? null,
        name: categoryRow.name ?? null,
        handicap_min:
          categoryRow.handicap_min != null
            ? Number(categoryRow.handicap_min)
            : null,
        handicap_max:
          categoryRow.handicap_max != null
            ? Number(categoryRow.handicap_max)
            : null,
      }
    : null;

  await assertEntryNotAssigned(admin, tournament_id, [
    player_a_entry_id,
    ...(player_b_entry_id ? [player_b_entry_id] : []),
  ]);

  const capMessages: string[] = [];
  let combined_hi = 0;

  if (match_type === "pairs" && player_b && category_id) {
    await syncPairEntriesCategory(admin, {
      entryIds: [player_a_entry_id, player_b_entry_id!],
      categoryId: category_id,
    });

    const cap = await capMatchPlayPairHandicaps(admin, {
      entryAId: player_a_entry_id,
      entryBId: player_b_entry_id!,
      hiA: effectiveEntryHi(player_a),
      hiB: effectiveEntryHi(player_b),
      category: categorySnapshot,
    });
    combined_hi = cap.combined_hi;
    capMessages.push(...cap.messages);

    player_a.handicap_index = cap.hiA;
    player_b.handicap_index = cap.hiB;
  }

  const validation = validateTeamFormation({
    match_type,
    player_a,
    player_b,
    rules: data.rules,
    category: categorySnapshot,
    existingTeamCount: data.teams.length,
  });

  if (!validation.ok) {
    redirectMatchPlay(tournament_id, {
      team_status: "error",
      team_message: validation.message,
    });
  }

  if (match_type !== "pairs" || !player_b) {
    combined_hi = validation.combined_hi;
  }

  const defaultName =
    match_type === "pairs" && player_b
      ? `${formatPlayerName(player_a.player)} / ${formatPlayerName(player_b.player)}`
      : formatPlayerName(player_a.player);

  const { error } = await admin.from("matchplay_pair_teams").insert({
    tournament_id,
    category_id,
    player_a_entry_id,
    player_b_entry_id:
      match_type === "pairs" ? player_b_entry_id : null,
    team_name: team_name ?? defaultName,
    combined_hi,
    seed,
    is_active: true,
  });

  if (error) {
    if (/uq_matchplay_team_entry|duplicate|unique/i.test(error.message)) {
      redirectMatchPlay(tournament_id, {
        team_status: "error",
        team_message: "Ese jugador ya está en otro equipo.",
      });
    }
    throw new Error(error.message);
  }

  revalidatePath("/matchplay");
  revalidatePath("/entries");
  const okMsg =
    capMessages.length > 0
      ? `Equipo creado. ${capMessages.join(" ")}`
      : "Equipo creado.";
  redirectMatchPlay(tournament_id, { team_status: "ok", team_message: okMsg });
}

export async function updateMatchPlayTeam(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const team_id = reqStr(formData, "team_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const seed = optNum(formData, "seed");
  const team_name = optStr(formData, "team_name");
  const category_id = optStr(formData, "category_id");

  const { data: team, error: teamErr } = await admin
    .from("matchplay_pair_teams")
    .select(
      "player_a_entry_id, player_b_entry_id, entry_a:tournament_entries!matchplay_pair_teams_player_a_entry_id_fkey(handicap_index), entry_b:tournament_entries!matchplay_pair_teams_player_b_entry_id_fkey(handicap_index)"
    )
    .eq("id", team_id)
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (teamErr) throw new Error(teamErr.message);

  const capMessages: string[] = [];
  let combined_hi: number | null = null;

  const entryA = Array.isArray(team?.entry_a) ? team?.entry_a[0] : team?.entry_a;
  const entryB = Array.isArray(team?.entry_b) ? team?.entry_b[0] : team?.entry_b;

  if (
    category_id &&
    team?.player_a_entry_id &&
    team?.player_b_entry_id &&
    entryA &&
    entryB
  ) {
    const { data: categoryRow } = await admin
      .from("categories")
      .select("code, name, handicap_min, handicap_max")
      .eq("id", category_id)
      .eq("tournament_id", tournament_id)
      .maybeSingle();

    await syncPairEntriesCategory(admin, {
      entryIds: [team.player_a_entry_id, team.player_b_entry_id],
      categoryId: category_id,
    });

    const cap = await capMatchPlayPairHandicaps(admin, {
      entryAId: team.player_a_entry_id,
      entryBId: team.player_b_entry_id,
      hiA: Number(entryA.handicap_index ?? 0),
      hiB: Number(entryB.handicap_index ?? 0),
      category: categoryRow
        ? {
            code: categoryRow.code,
            name: categoryRow.name,
            handicap_min:
              categoryRow.handicap_min != null
                ? Number(categoryRow.handicap_min)
                : null,
            handicap_max:
              categoryRow.handicap_max != null
                ? Number(categoryRow.handicap_max)
                : null,
          }
        : null,
    });
    combined_hi = cap.combined_hi;
    capMessages.push(...cap.messages);
  }

  const { error } = await admin
    .from("matchplay_pair_teams")
    .update({
      seed,
      team_name,
      category_id,
      ...(combined_hi != null ? { combined_hi } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", team_id)
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  revalidatePath("/entries");
  const okMsg =
    capMessages.length > 0
      ? `Equipo actualizado. ${capMessages.join(" ")}`
      : "Equipo actualizado.";
  redirectMatchPlay(tournament_id, { team_status: "ok", team_message: okMsg });
}

export async function recapMatchPlayTeams(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();

  const { data: teams, error: teamsErr } = await admin
    .from("matchplay_pair_teams")
    .select(
      "id, player_a_entry_id, player_b_entry_id, category_id, " +
        "entry_a:tournament_entries!matchplay_pair_teams_player_a_entry_id_fkey(id, category_id, handicap_index), " +
        "entry_b:tournament_entries!matchplay_pair_teams_player_b_entry_id_fkey(id, category_id, handicap_index)"
    )
    .eq("tournament_id", tournament_id)
    .eq("is_active", true);

  if (teamsErr) throw new Error(teamsErr.message);

  const { data: catsRows } = await admin
    .from("categories")
    .select("id, code, name, handicap_min, handicap_max")
    .eq("tournament_id", tournament_id);

  const catsById = new Map<string, any>(
    (catsRows ?? []).map((c) => [c.id, c])
  );

  const allMessages: string[] = [];
  let adjustedTeams = 0;
  let syncedEntries = 0;

  type EntryShape = {
    id?: string;
    category_id?: string | null;
    handicap_index?: number | string | null;
  };
  type TeamShape = {
    id: string;
    player_a_entry_id: string | null;
    player_b_entry_id: string | null;
    category_id: string | null;
    entry_a?: EntryShape | EntryShape[] | null;
    entry_b?: EntryShape | EntryShape[] | null;
  };

  for (const team of (teams ?? []) as unknown as TeamShape[]) {
    const entryA: EntryShape | undefined = Array.isArray(team.entry_a)
      ? team.entry_a[0]
      : team.entry_a ?? undefined;
    const entryB: EntryShape | undefined = Array.isArray(team.entry_b)
      ? team.entry_b[0]
      : team.entry_b ?? undefined;
    if (!entryA?.id || !entryB?.id || !team.category_id) continue;

    const cat = catsById.get(team.category_id);
    if (!cat) continue;

    if (
      entryA.category_id !== team.category_id ||
      entryB.category_id !== team.category_id
    ) {
      await syncPairEntriesCategory(admin, {
        entryIds: [entryA.id, entryB.id],
        categoryId: team.category_id,
      });
      syncedEntries += 1;
    }

    const cap = await capMatchPlayPairHandicaps(admin, {
      entryAId: entryA.id,
      entryBId: entryB.id,
      hiA: Number(entryA.handicap_index ?? 0),
      hiB: Number(entryB.handicap_index ?? 0),
      category: {
        code: cat.code,
        name: cat.name,
        handicap_min: cat.handicap_min != null ? Number(cat.handicap_min) : null,
        handicap_max: cat.handicap_max != null ? Number(cat.handicap_max) : null,
      },
    });

    if (cap.messages.length > 0) {
      adjustedTeams += 1;
      allMessages.push(...cap.messages);
    }

    await admin
      .from("matchplay_pair_teams")
      .update({
        combined_hi: cap.combined_hi,
        updated_at: new Date().toISOString(),
      })
      .eq("id", team.id);
  }

  revalidatePath("/matchplay");
  revalidatePath("/entries");

  const okMsg =
    adjustedTeams === 0 && syncedEntries === 0
      ? "Topes verificados: ninguna pareja excede el máximo de su categoría."
      : `Topes ajustados en ${adjustedTeams} pareja(s). ${
          syncedEntries > 0 ? `Categoría sincronizada en ${syncedEntries} equipo(s).` : ""
        } ${allMessages.slice(0, 3).join(" ")}`;
  redirectMatchPlay(tournament_id, { team_status: "ok", team_message: okMsg });
}

export async function deleteMatchPlayTeam(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const team_id = reqStr(formData, "team_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("matchplay_pair_teams")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", team_id)
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, { team_status: "ok", team_message: "Equipo eliminado." });
}

/** Individual: crea un equipo por cada inscrito sin asignar. */
export async function syncIndividualTeamsFromEntries(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const data = await loadMatchPlayTeamsData(tournament_id);

  if (data.rules?.match_type !== "individual") {
    redirectMatchPlay(tournament_id, {
      team_status: "error",
      team_message: "Solo aplica en torneos match play individual.",
    });
  }

  const unassigned = data.entries.filter((e) => !data.assignedEntryIds.has(e.id));
  if (!unassigned.length) {
    redirectMatchPlay(tournament_id, {
      team_status: "warning",
      team_message: "Todos los inscritos ya tienen equipo.",
    });
  }

  const maxTeams = data.rules?.max_teams;
  let created = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const entry of unassigned) {
    if (
      maxTeams !== null &&
      maxTeams !== undefined &&
      data.teams.length + created >= maxTeams
    ) {
      break;
    }

    const validation = validateTeamFormation({
      match_type: "individual",
      player_a: entry,
      rules: data.rules,
      existingTeamCount: data.teams.length + created,
    });

    if (!validation.ok) continue;

    rows.push({
      tournament_id,
      category_id: entry.category_id,
      player_a_entry_id: entry.id,
      player_b_entry_id: null,
      team_name: formatPlayerName(entry.player),
      combined_hi: validation.combined_hi,
      seed: null,
      is_active: true,
    });
    created++;
  }

  if (rows.length) {
    const { error } = await admin.from("matchplay_pair_teams").insert(rows);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    team_status: "ok",
    team_message: `${created} equipo(s) creado(s) desde inscritos.`,
  });
}

/**
 * Aplica el % USGA (Section 6.1) elegido como handicap_allowance del torneo.
 * No toca posturas; sólo cambia la regla para que strokes en cada match usen
 * el % USGA recomendado.
 */
export async function applyUsgaAllowanceFromTable(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const match_play_pct = optNum(formData, "match_play_pct");
  const allowance_value = String(
    formData.get("allowance_value") ?? "custom"
  ) as MatchPlayHandicapAllowance;
  await ensureAccess(tournament_id);

  const admin = createAdminClient();

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  const cfg = (rules?.config_json ?? {}) as Record<string, unknown>;
  cfg.handicap_allowance = allowance_value;
  cfg.handicap_allowance_custom_pct = match_play_pct;

  const { error } = await admin
    .from("tournament_matchplay_rules")
    .update({
      handicap_allowance: allowance_value,
      handicap_allowance_pct: match_play_pct,
      config_json: cfg,
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  revalidatePath("/convocatoria");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: `Allowance USGA aplicado: ${match_play_pct}%.`,
  });
}

/**
 * Reasigna seeds 1..N según postura de subasta (mayor postura = seed 1).
 * No regenera el cuadro: para verlo aplicado en el bracket, "Regenerar cuadro".
 */
export async function applyAuctionSeeding(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const data = await loadMatchPlayTeamsData(tournament_id);

  if (data.teams.length < 2) {
    redirectMatchPlay(tournament_id, {
      bracket_status: "error",
      bracket_message: "Necesitas al menos 2 equipos para sembrar por subasta.",
    });
  }

  const ordered = sortTeamsForSeeding(data.teams, "auction");
  let i = 1;
  for (const t of ordered) {
    await admin
      .from("matchplay_pair_teams")
      .update({ seed: i, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("tournament_id", tournament_id);
    i++;
  }

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: `Siembra aplicada por subasta a ${ordered.length} equipos.`,
  });
}

export async function updateTeamAuctionBid(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const team_id = reqStr(formData, "team_id");
  const auction_bid = optNum(formData, "auction_bid");
  const has_order = formData.has("auction_order");
  const auction_order = optNum(formData, "auction_order");
  await ensureAccess(tournament_id);

  const update: Record<string, unknown> = {
    auction_bid,
    updated_at: new Date().toISOString(),
  };
  if (has_order) update.auction_order = auction_order;

  const admin = createAdminClient();
  const { error } = await admin
    .from("matchplay_pair_teams")
    .update(update)
    .eq("id", team_id)
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: "Postura de subasta guardada.",
  });
}

/**
 * Guarda la hoja completa de subasta: arreglos paralelos `team_id`,
 * `auction_order` y `auction_bid`. Hace UPDATE por fila (Supabase no
 * permite UPDATE multi-fila con valores distintos en una sola query).
 */
export async function saveAuctionSheet(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const ids = formData.getAll("team_id").map((v) => String(v));
  const orders = formData.getAll("auction_order").map((v) => String(v));
  const bids = formData.getAll("auction_bid").map((v) => String(v));

  if (ids.length === 0) {
    redirectMatchPlay(tournament_id, {
      bracket_status: "error",
      bracket_message: "No hay equipos para guardar.",
    });
  }

  if (ids.length !== orders.length || ids.length !== bids.length) {
    redirectMatchPlay(tournament_id, {
      bracket_status: "error",
      bracket_message: "Hoja de subasta inconsistente.",
    });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  let saved = 0;
  for (let i = 0; i < ids.length; i++) {
    const orderRaw = orders[i].trim();
    const bidRaw = bids[i].trim();
    const auction_order = orderRaw ? Number(orderRaw) : null;
    const auction_bid = bidRaw ? Number(bidRaw) : null;

    const update: Record<string, unknown> = {
      updated_at: now,
      auction_order:
        auction_order !== null && Number.isFinite(auction_order)
          ? auction_order
          : null,
      auction_bid:
        auction_bid !== null && Number.isFinite(auction_bid)
          ? auction_bid
          : null,
    };

    const { error } = await admin
      .from("matchplay_pair_teams")
      .update(update)
      .eq("id", ids[i])
      .eq("tournament_id", tournament_id);
    if (error) throw new Error(error.message);
    saved++;
  }

  revalidatePath("/matchplay");
  revalidatePath("/matchplay/auction");
  redirect(
    `/matchplay/auction?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(
      `Hoja guardada (${saved} equipos).`
    )}`
  );
}

/**
 * Adjudica la postura de un equipo en la subasta en vivo.
 * Si no recibe `auction_order`, asigna el siguiente disponible
 * (max(auction_order) + 1 dentro del torneo).
 */
export async function awardAuctionBid(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const team_id = reqStr(formData, "team_id");
  const bid = optNum(formData, "auction_bid");
  const explicit_order = optNum(formData, "auction_order");
  const redirect_to = optStr(formData, "redirect_to");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();

  let auction_order = explicit_order;
  if (auction_order == null) {
    const { data: maxRow } = await admin
      .from("matchplay_pair_teams")
      .select("auction_order")
      .eq("tournament_id", tournament_id)
      .not("auction_order", "is", null)
      .order("auction_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    auction_order = (maxRow?.auction_order ?? 0) + 1;
  }

  const { error } = await admin
    .from("matchplay_pair_teams")
    .update({
      auction_bid: bid,
      auction_order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", team_id)
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  revalidatePath("/matchplay/auction");
  revalidatePath("/matchplay/auction/show");
  revalidatePath("/matchplay/auction/raffle");

  const awardMsg = `Adjudicado #${auction_order} en ${
    bid != null ? `$${bid.toLocaleString("es-MX")}` : "—"
  }.`;

  if (redirect_to === "show") {
    redirect(
      `/matchplay/auction/show?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(
        awardMsg
      )}`
    );
  }
  if (redirect_to === "raffle") {
    redirect(
      `/matchplay/auction/raffle?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(
        awardMsg
      )}`
    );
  }
  if (redirect_to === "sheet") {
    redirect(
      `/matchplay/auction?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(
        "Postura adjudicada."
      )}`
    );
  }
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: "Postura adjudicada.",
  });
}

/**
 * Limpia toda la subasta (auction_order y auction_bid) para reiniciar la
 * dinámica en vivo. No toca los seeds aplicados.
 */
export async function resetAuctionData(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const redirect_to = optStr(formData, "redirect_to");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("matchplay_pair_teams")
    .update({
      auction_bid: null,
      auction_order: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  revalidatePath("/matchplay/auction");
  revalidatePath("/matchplay/auction/show");
  revalidatePath("/matchplay/auction/raffle");

  const resetMsg = "Subasta reiniciada.";
  const target =
    redirect_to === "show"
      ? `/matchplay/auction/show?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(resetMsg)}`
      : redirect_to === "raffle"
        ? `/matchplay/auction/raffle?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(resetMsg)}`
        : redirect_to === "sheet"
          ? `/matchplay/auction?tournament_id=${tournament_id}&status=ok&message=${encodeURIComponent(resetMsg)}`
          : `/matchplay?tournament_id=${tournament_id}&bracket_status=ok&bracket_message=${encodeURIComponent(resetMsg)}`;
  redirect(target);
}

/**
 * Renumera auction_order = 1..N en el orden actual de la tabla
 * (primero los que ya tienen orden, luego los que no, por seed/nombre).
 * Útil para inicializar la lista antes de empezar la subasta.
 */
export async function reorderAuctionSequence(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const { data: teams } = await admin
    .from("matchplay_pair_teams")
    .select("id, auction_order, seed, team_name")
    .eq("tournament_id", tournament_id)
    .eq("is_active", true);

  const list = (teams ?? []).slice().sort((a, b) => {
    const oa = a.auction_order ?? Number.POSITIVE_INFINITY;
    const ob = b.auction_order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    const sa = a.seed ?? 9999;
    const sb = b.seed ?? 9999;
    if (sa !== sb) return sa - sb;
    return (a.team_name ?? "").localeCompare(b.team_name ?? "");
  });

  let i = 1;
  for (const t of list) {
    await admin
      .from("matchplay_pair_teams")
      .update({ auction_order: i, updated_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("tournament_id", tournament_id);
    i++;
  }

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: `Orden de subasta renumerado 1..${list.length}.`,
  });
}

export async function generateMatchPlayBracket(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const data = await loadMatchPlayTeamsData(tournament_id);

  if (data.teams.length < 2) {
    redirectMatchPlay(tournament_id, {
      bracket_status: "error",
      bracket_message: "Necesitas al menos 2 equipos antes de generar el cuadro.",
    });
  }

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("seeding_method, bracket_main_pairs, max_pairs_per_category")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  const seeding_method = (rulesRow?.seeding_method ??
    "hi_combined") as MatchPlaySeedingMethod;
  const maxSize =
    rulesRow?.bracket_main_pairs ??
    rulesRow?.max_pairs_per_category ??
    64;

  let generated: ReturnType<typeof generateSingleElimBracket>;
  try {
    generated = generateSingleElimBracket({
      teams: data.teams,
      seeding_method,
      max_bracket_size: maxSize,
    });
  } catch (err) {
    redirectMatchPlay(tournament_id, {
      bracket_status: "error",
      bracket_message:
        err instanceof Error ? err.message : "No se pudo generar el cuadro.",
    });
  }

  const { data: existingBrackets } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournament_id);

  if (existingBrackets?.length) {
    const ids = existingBrackets.map((b) => b.id);
    await admin.from("matchplay_brackets").delete().in("id", ids);
  }

  for (const s of generated.seedAssignments) {
    await admin
      .from("matchplay_pair_teams")
      .update({ seed: s.seed, updated_at: new Date().toISOString() })
      .eq("id", s.team_id);
  }

  const category_id = data.categories[0]?.id ?? null;

  const { data: bracket, error: bracketErr } = await admin
    .from("matchplay_brackets")
    .insert({
      tournament_id,
      category_id,
      name: "Principal",
      bracket_type: "single_elim",
      status: "draft",
      config_json: {
        bracket_size: generated.bracketSize,
        round_count: generated.roundCount,
        seeding_method,
        team_count: generated.teamCount,
        bye_count: generated.byeCount,
        draw: "standard",
      },
    })
    .select("id")
    .single();

  if (bracketErr) throw new Error(bracketErr.message);

  const insertRows = generated.matches.map((m) => ({
    tournament_id,
    bracket_id: bracket.id,
    round_no: m.round_no,
    position_no: m.position_no,
    top_pair_id: m.top_pair_id,
    bottom_pair_id: m.bottom_pair_id,
    winner_pair_id: m.winner_pair_id,
    status: m.status,
    result_text: m.result_text,
  }));

  const { data: inserted, error: matchErr } = await admin
    .from("matchplay_matches")
    .insert(insertRows)
    .select("id, round_no, position_no");

  if (matchErr) throw new Error(matchErr.message);

  const idByKey = new Map<string, string>();
  for (const row of inserted ?? []) {
    idByKey.set(`r${row.round_no}-p${row.position_no - 1}`, row.id);
  }

  for (const m of generated.matches) {
    if (!m._next_key) continue;
    const id = idByKey.get(m._key);
    const nextId = idByKey.get(m._next_key);
    if (id && nextId) {
      await admin
        .from("matchplay_matches")
        .update({ next_match_id: nextId })
        .eq("id", id);
    }
  }

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: `Cuadro generado: ${generated.teamCount} equipos, ${generated.bracketSize} plazas, ${generated.byeCount} BYE(s). Draw 1-16 / 8-9 / 4-13…`,
  });
}

export async function publishMatchPlayBracket(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("matchplay_brackets")
    .update({
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", tournament_id)
    .eq("status", "draft");

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: "Cuadro publicado.",
  });
}

export async function deleteMatchPlayBracket(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("matchplay_brackets")
    .delete()
    .eq("tournament_id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/matchplay");
  redirectMatchPlay(tournament_id, {
    bracket_status: "ok",
    bracket_message: "Cuadro eliminado. Puedes regenerarlo.",
  });
}

type LowHighHoleInput = {
  hole_no: number;
  top_player_a_strokes: number | null;
  top_player_b_strokes: number | null;
  bottom_player_a_strokes: number | null;
  bottom_player_b_strokes: number | null;
};

function redirectMatchScore(
  tournament_id: string,
  match_id: string,
  params: Record<string, string> = {}
): never {
  const q = new URLSearchParams({
    tournament_id,
    match_id,
    ...params,
  });
  redirect(`/matchplay/score?${q.toString()}`);
}

export async function saveLowHighMatchScores(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const match_id = reqStr(formData, "match_id");
  await ensureAccess(tournament_id);

  const finalize = String(formData.get("finalize") ?? "") === "1";
  let holesInput: LowHighHoleInput[] = [];

  try {
    const raw = String(formData.get("holes_json") ?? "[]");
    const parsed = JSON.parse(raw) as LowHighHoleInput[];
    if (!Array.isArray(parsed)) throw new Error("JSON inválido");
    holesInput = parsed;
  } catch {
    redirectMatchScore(tournament_id, match_id, {
      score_status: "error",
      score_message: "Datos de hoyos inválidos.",
    });
  }

  const { loadMatchForScoring } = await import(
    "@/lib/matchplay/loadMatchForScoring"
  );
  const {
    scoreLowHighHole,
    aggregateLowHighTotals,
    decideLowHighWinner,
    formatLowHighMatchStatus,
  } = await import("@/lib/matchplay/scoring/lowHigh");

  const match = await loadMatchForScoring(match_id);
  if (!match || match.tournament_id !== tournament_id) {
    redirectMatchScore(tournament_id, match_id, {
      score_status: "error",
      score_message: "Partido no encontrado o no es Bola Baja + Alta.",
    });
  }

  const admin = createAdminClient();
  const hiTuple: [number, number, number, number] = [
    match.top_players[0].hi,
    match.top_players[1].hi,
    match.bottom_players[0].hi,
    match.bottom_players[1].hi,
  ];

  let topRunning = 0;
  let bottomRunning = 0;
  const scoredHoles: Array<{ top_points: number; bottom_points: number }> = [];

  for (let i = 1; i <= match.holes_in_match; i++) {
    const input = holesInput.find((h) => h.hole_no === i);
    const row = match.holes[i - 1];
    const gross = {
      top_a: input?.top_player_a_strokes ?? row.top_player_a_strokes,
      top_b: input?.top_player_b_strokes ?? row.top_player_b_strokes,
      bottom_a: input?.bottom_player_a_strokes ?? row.bottom_player_a_strokes,
      bottom_b: input?.bottom_player_b_strokes ?? row.bottom_player_b_strokes,
    };

    if (
      gross.top_a == null ||
      gross.top_b == null ||
      gross.bottom_a == null ||
      gross.bottom_b == null
    ) {
      await admin
        .from("matchplay_hole_results")
        .delete()
        .eq("match_id", match_id)
        .eq("hole_no", i);
      continue;
    }

    const result = scoreLowHighHole({
      hole_no: i,
      gross,
      hi: hiTuple,
      allowance_pct: match.allowance_pct,
      strokeIndexByHole: match.stroke_index_by_hole,
      top_total_before: topRunning,
      bottom_total_before: bottomRunning,
      holes_in_match: match.holes_in_match,
    });

    if (!result) continue;

    topRunning += result.top_points;
    bottomRunning += result.bottom_points;
    scoredHoles.push({
      top_points: result.top_points,
      bottom_points: result.bottom_points,
    });

    const { error: upsertErr } = await admin.from("matchplay_hole_results").upsert(
      {
        match_id,
        hole_no: i,
        scoring_format: "low_high",
        top_player_a_strokes: gross.top_a,
        top_player_b_strokes: gross.top_b,
        bottom_player_a_strokes: gross.bottom_a,
        bottom_player_b_strokes: gross.bottom_b,
        top_points: result.top_points,
        bottom_points: result.bottom_points,
        top_strokes: null,
        bottom_strokes: null,
        hole_winner:
          result.top_points > result.bottom_points
            ? "top"
            : result.bottom_points > result.top_points
              ? "bottom"
              : "halved",
        match_status_after: result.match_status_after,
        detail_json: { breakdown: result.breakdown },
      },
      { onConflict: "match_id,hole_no" }
    );

    if (upsertErr) {
      redirectMatchScore(tournament_id, match_id, {
        score_status: "error",
        score_message: upsertErr.message,
      });
    }
  }

  const totals = aggregateLowHighTotals(scoredHoles);
  const statusText = formatLowHighMatchStatus(
    totals.top,
    totals.bottom,
    scoredHoles.length,
    match.holes_in_match
  );

  const matchUpdate: Record<string, unknown> = {
    status: scoredHoles.length > 0 ? "in_progress" : "scheduled",
    result_text: scoredHoles.length > 0 ? statusText : null,
    holes_played: scoredHoles.length,
    updated_at: new Date().toISOString(),
  };

  if (finalize && scoredHoles.length > 0) {
    const side = decideLowHighWinner(totals.top, totals.bottom);
    if (side === "top" && match.top_pair_id) {
      matchUpdate.winner_pair_id = match.top_pair_id;
      matchUpdate.status = "completed";
      matchUpdate.result_text = `${statusText} — gana ${match.top_label}`;
    } else if (side === "bottom" && match.bottom_pair_id) {
      matchUpdate.winner_pair_id = match.bottom_pair_id;
      matchUpdate.status = "completed";
      matchUpdate.result_text = `${statusText} — gana ${match.bottom_label}`;
    } else if (side === "halved") {
      matchUpdate.winner_pair_id = null;
      matchUpdate.status = "completed";
      matchUpdate.result_text = `${statusText} — empate`;
    } else {
      matchUpdate.status = "in_progress";
      matchUpdate.result_text = `${statusText} — sin ganador aún`;
    }
  }

  const { error: matchErr } = await admin
    .from("matchplay_matches")
    .update(matchUpdate)
    .eq("id", match_id);

  if (matchErr) {
    redirectMatchScore(tournament_id, match_id, {
      score_status: "error",
      score_message: matchErr.message,
    });
  }

  let advanceNote = "";
  const winnerId =
    typeof matchUpdate.winner_pair_id === "string"
      ? matchUpdate.winner_pair_id
      : null;

  if (finalize && winnerId && matchUpdate.status === "completed") {
    const { advanceWinnerInBracket } = await import(
      "@/lib/matchplay/advanceWinner"
    );
    const adv = await advanceWinnerInBracket(admin, {
      match_id,
      winner_pair_id: winnerId,
    });
    advanceNote = adv.advanced ? ` ${adv.message}` : "";
  }

  revalidatePath("/matchplay");
  revalidatePath("/matchplay/score");
  revalidatePath(`/torneos/${tournament_id}`);
  redirectMatchScore(tournament_id, match_id, {
    score_status: "ok",
    score_message: finalize
      ? `Partido guardado y cerrado.${advanceNote}`
      : `Guardado: ${statusText}`,
  });
}
