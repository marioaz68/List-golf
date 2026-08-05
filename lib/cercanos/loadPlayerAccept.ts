import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDistanceCm } from "./distanceFormat";

export type PlayerAcceptView = {
  token: string;
  entryRowId: string;
  tournamentId: string;
  tournamentName: string;
  roundId: string;
  holeNumber: number;
  distanceCm: number;
  distanceLabel: string;
  playerName: string;
  categoryCode: string | null;
  capturistSigned: boolean;
  playerAccepted: boolean;
  playerAcceptedAt: string | null;
  playerSignerName: string | null;
  expired: boolean;
  expiresAt: string | null;
};

function nameOf(
  first: string | null | undefined,
  last: string | null | undefined
) {
  return `${String(last ?? "").trim()} ${String(first ?? "").trim()}`.trim() || "Jugador";
}

export async function loadPlayerAcceptByToken(
  admin: SupabaseClient,
  token: string
): Promise<PlayerAcceptView | null> {
  const t = String(token ?? "").trim();
  if (!t || t.length < 16) return null;

  const { data: row } = await admin
    .from("closest_to_pin_entries")
    .select(
      "id, tournament_id, round_id, hole_number, distance_cm, signature_payload, accept_token, accept_token_expires_at, player_accepted_at, player_signer_name, tournament_entries(players(first_name, last_name), categories(code)), tournaments(name)"
    )
    .eq("accept_token", t)
    .maybeSingle();

  if (!row) return null;

  type R = {
    id: string;
    tournament_id: string;
    round_id: string;
    hole_number: number;
    distance_cm: number;
    signature_payload: string | null;
    accept_token: string;
    accept_token_expires_at: string | null;
    player_accepted_at: string | null;
    player_signer_name: string | null;
    tournament_entries:
      | {
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
    tournaments:
      | { name: string | null }
      | { name: string | null }[]
      | null;
  };

  const r = row as R;
  const teRaw = r.tournament_entries;
  const te = Array.isArray(teRaw) ? teRaw[0] : teRaw;
  const plRaw = te?.players;
  const pl = Array.isArray(plRaw) ? plRaw[0] : plRaw;
  const catRaw = te?.categories;
  const cat = Array.isArray(catRaw) ? catRaw[0] : catRaw;
  const tourRaw = r.tournaments;
  const tour = Array.isArray(tourRaw) ? tourRaw[0] : tourRaw;

  const exp = r.accept_token_expires_at
    ? new Date(r.accept_token_expires_at).getTime()
    : null;
  const expired = exp != null ? exp < Date.now() : false;

  return {
    token: r.accept_token,
    entryRowId: r.id,
    tournamentId: r.tournament_id,
    tournamentName: tour?.name?.trim() || "Torneo",
    roundId: r.round_id,
    holeNumber: r.hole_number,
    distanceCm: r.distance_cm,
    distanceLabel: formatDistanceCm(r.distance_cm),
    playerName: nameOf(pl?.first_name, pl?.last_name),
    categoryCode: cat?.code ?? null,
    capturistSigned: Boolean(r.signature_payload),
    playerAccepted: Boolean(r.player_accepted_at),
    playerAcceptedAt: r.player_accepted_at,
    playerSignerName: r.player_signer_name,
    expired,
    expiresAt: r.accept_token_expires_at,
  };
}
