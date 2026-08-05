import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCourseLayoutForTournament } from "@/lib/matchplay/loadCourseLayout";
import { formatDistanceCm } from "./distanceFormat";
import { playerAcceptUrl } from "./acceptToken";
import { rankClosestToPin } from "./ranking";
import {
  CLOSEST_TO_PIN_MAX_PRIZES,
  type CaptureGroupOption,
  type CaptureGroupPlayer,
  type ClosestToPinHoleBoard,
} from "./types";

export { formatDistanceCm, CLOSEST_TO_PIN_MAX_PRIZES };

function playerName(
  first: string | null | undefined,
  last: string | null | undefined
) {
  return `${String(last ?? "").trim()} ${String(first ?? "").trim()}`.trim() || "Jugador";
}

/** Hoyos par 3 del torneo (tarjeta torneo + fallback campo). */
export async function loadPar3Holes(
  admin: SupabaseClient,
  tournamentId: string
): Promise<number[]> {
  const layout = await loadCourseLayoutForTournament(admin, tournamentId);
  const holes: number[] = [];
  for (let h = 1; h <= 18; h++) {
    const par = layout.parByHole.get(h);
    if (par === 3) holes.push(h);
  }
  // Si no hay tarjeta con pares, usa los par 3 típicos CCQ como último recurso
  // solo si no había ningún par; vacía si hay tarjeta sin par 3.
  if (holes.length === 0 && layout.parByHole.size === 0) {
    return [3, 8, 12, 17];
  }
  return holes;
}

export async function loadTournamentRounds(
  admin: SupabaseClient,
  tournamentId: string
): Promise<
  Array<{
    id: string;
    round_no: number | null;
    round_date: string | null;
    wave: string | null;
    category_id: string | null;
  }>
> {
  const { data } = await admin
    .from("rounds")
    .select("id, round_no, round_date, wave, category_id")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true })
    .order("round_date", { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    round_no: number | null;
    round_date: string | null;
    wave: string | null;
    category_id: string | null;
  }>;
}

export async function loadGroupsForRound(
  admin: SupabaseClient,
  roundId: string
): Promise<CaptureGroupOption[]> {
  const { data: groups } = await admin
    .from("pairing_groups")
    .select("id, group_no, tee_time, starting_hole")
    .eq("round_id", roundId)
    .order("group_no", { ascending: true });

  const list = (groups ?? []) as Array<{
    id: string;
    group_no: number | null;
    tee_time: string | null;
    starting_hole: number | null;
  }>;
  if (list.length === 0) return [];

  const ids = list.map((g) => g.id);
  const { data: members } = await admin
    .from("pairing_group_members")
    .select("group_id")
    .in("group_id", ids);

  const counts = new Map<string, number>();
  for (const m of (members ?? []) as Array<{ group_id: string }>) {
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  }

  return list.map((g) => ({
    id: g.id,
    groupNo: Number(g.group_no ?? 0),
    teeTime: g.tee_time,
    startingHole: g.starting_hole,
    memberCount: counts.get(g.id) ?? 0,
  }));
}

export async function loadGroupPlayersForCapture(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    roundId: string;
    holeNumber: number;
    groupId: string;
  }
): Promise<CaptureGroupPlayer[]> {
  const { data: members } = await admin
    .from("pairing_group_members")
    .select(
      "entry_id, position, tournament_entries(id, player_number, players(first_name, last_name), categories(code))"
    )
    .eq("group_id", params.groupId)
    .order("position", { ascending: true });

  type MemberRow = {
    entry_id: string;
    position: number | null;
    tournament_entries:
      | {
          id: string;
          player_number: number | null;
          players:
            | { first_name: string | null; last_name: string | null }
            | { first_name: string | null; last_name: string | null }[]
            | null;
          categories:
            | { code: string | null }
            | { code: string | null }[]
            | null;
        }
      | {
          id: string;
          player_number: number | null;
          players:
            | { first_name: string | null; last_name: string | null }
            | { first_name: string | null; last_name: string | null }[]
            | null;
          categories:
            | { code: string | null }
            | { code: string | null }[]
            | null;
        }[]
      | null;
  };

  const entryIds: string[] = [];
  const base: CaptureGroupPlayer[] = [];

  for (const m of (members ?? []) as MemberRow[]) {
    const teRaw = m.tournament_entries;
    const te = Array.isArray(teRaw) ? teRaw[0] : teRaw;
    if (!te) continue;
    const plRaw = te.players;
    const pl = Array.isArray(plRaw) ? plRaw[0] : plRaw;
    const catRaw = te.categories;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    entryIds.push(te.id);
    base.push({
      entryId: te.id,
      playerId: null,
      name: playerName(pl?.first_name, pl?.last_name),
      playerNumber: te.player_number,
      categoryCode: cat?.code ?? null,
      distanceCm: null,
      entryRowId: null,
      capturistSigned: false,
      capturistSignerName: null,
      playerAccepted: false,
      playerSignerName: null,
      acceptUrl: null,
    });
  }

  if (entryIds.length === 0) return base;

  const { data: existing } = await admin
    .from("closest_to_pin_entries")
    .select(
      "id, entry_id, distance_cm, signature_payload, signer_name, accept_token, player_accepted_at, player_signer_name"
    )
    .eq("tournament_id", params.tournamentId)
    .eq("round_id", params.roundId)
    .eq("hole_number", params.holeNumber)
    .in("entry_id", entryIds);

  const byEntry = new Map(
    (
      (existing ?? []) as Array<{
        id: string;
        entry_id: string;
        distance_cm: number;
        signature_payload: string | null;
        signer_name: string | null;
        accept_token: string | null;
        player_accepted_at: string | null;
        player_signer_name: string | null;
      }>
    ).map((r) => [r.entry_id, r])
  );

  return base.map((p) => {
    const ex = byEntry.get(p.entryId);
    return {
      ...p,
      distanceCm: ex?.distance_cm ?? null,
      entryRowId: ex?.id ?? null,
      capturistSigned: Boolean(ex?.signature_payload),
      capturistSignerName: ex?.signer_name ?? null,
      playerAccepted: Boolean(ex?.player_accepted_at),
      playerSignerName: ex?.player_signer_name ?? null,
      acceptUrl: ex?.accept_token ? playerAcceptUrl(ex.accept_token) : null,
    };
  });
}

/** Tablero público: top N por cada par 3 de la ronda. */
export async function loadClosestToPinPublicBoard(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    roundId: string;
    maxPlaces?: number;
  }
): Promise<ClosestToPinHoleBoard[]> {
  const maxPlaces = params.maxPlaces ?? CLOSEST_TO_PIN_MAX_PRIZES;
  const par3 = await loadPar3Holes(admin, params.tournamentId);
  if (par3.length === 0) return [];

  const layout = await loadCourseLayoutForTournament(admin, params.tournamentId);

  const { data: rows } = await admin
    .from("closest_to_pin_entries")
    .select(
      "entry_id, hole_number, distance_cm, group_id, signature_payload, signer_name, player_accepted_at, player_signer_name, tournament_entries(player_number, players(first_name, last_name), categories(code))"
    )
    .eq("tournament_id", params.tournamentId)
    .eq("round_id", params.roundId)
    .in("hole_number", par3)
    .order("distance_cm", { ascending: true });

  type Raw = {
    entry_id: string;
    hole_number: number;
    distance_cm: number;
    group_id: string | null;
    signature_payload: string | null;
    signer_name: string | null;
    player_accepted_at: string | null;
    player_signer_name: string | null;
    tournament_entries:
      | {
          player_number: number | null;
          players:
            | { first_name: string | null; last_name: string | null }
            | { first_name: string | null; last_name: string | null }[]
            | null;
          categories:
            | { code: string | null }
            | { code: string | null }[]
            | null;
        }
      | {
          player_number: number | null;
          players:
            | { first_name: string | null; last_name: string | null }
            | { first_name: string | null; last_name: string | null }[]
            | null;
          categories:
            | { code: string | null }
            | { code: string | null }[]
            | null;
        }[]
      | null;
  };

  const groupIds = [
    ...new Set(
      ((rows ?? []) as Raw[])
        .map((r) => r.group_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const groupNoById = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from("pairing_groups")
      .select("id, group_no")
      .in("id", groupIds);
    for (const g of (groups ?? []) as Array<{
      id: string;
      group_no: number | null;
    }>) {
      groupNoById.set(g.id, Number(g.group_no ?? 0));
    }
  }

  const byHole = new Map<
    number,
    Array<{
      entryId: string;
      playerName: string;
      categoryCode: string | null;
      distanceCm: number;
      groupNo: number | null;
      capturistSigned: boolean;
      capturistSignerName: string | null;
      playerAccepted: boolean;
      playerSignerName: string | null;
    }>
  >();

  for (const r of (rows ?? []) as Raw[]) {
    const teRaw = r.tournament_entries;
    const te = Array.isArray(teRaw) ? teRaw[0] : teRaw;
    const plRaw = te?.players;
    const pl = Array.isArray(plRaw) ? plRaw[0] : plRaw;
    const catRaw = te?.categories;
    const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
    const list = byHole.get(r.hole_number) ?? [];
    list.push({
      entryId: r.entry_id,
      playerName: playerName(pl?.first_name, pl?.last_name),
      categoryCode: cat?.code ?? null,
      distanceCm: r.distance_cm,
      groupNo: r.group_id ? groupNoById.get(r.group_id) ?? null : null,
      capturistSigned: Boolean(r.signature_payload),
      capturistSignerName: r.signer_name ?? null,
      playerAccepted: Boolean(r.player_accepted_at),
      playerSignerName: r.player_signer_name ?? null,
    });
    byHole.set(r.hole_number, list);
  }

  return par3.map((holeNumber) => {
    const list = byHole.get(holeNumber) ?? [];
    return {
      holeNumber,
      par: layout.parByHole.get(holeNumber) ?? 3,
      totalEntries: list.length,
      standings: rankClosestToPin(list, maxPlaces),
    };
  });
}
