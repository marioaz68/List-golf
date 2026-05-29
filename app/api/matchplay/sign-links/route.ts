import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isDerivedMatchId } from "@/lib/matchplay/loadDerivedMatchDetail";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { formatPlayerName } from "@/lib/matchplay/entryHi";

export const dynamic = "force-dynamic";

type SignLink = {
  entry_id: string;
  player_id: string;
  player_label: string;
  team_side: "top" | "bottom";
  role_in_team: "A" | "B";
  scorecard_id: string;
  token: string;
  url: string;
  player_signed_at: string | null;
  marker_signed_at: string | null;
  witness_signed_at: string | null;
  locked: boolean;
};

type ResolvedMatchEntries = {
  tournament_id: string;
  round_id: string;
  top_a_entry_id: string;
  top_b_entry_id: string;
  bottom_a_entry_id: string;
  bottom_b_entry_id: string;
};

async function resolveMatchEntries(
  admin: ReturnType<typeof createAdminClient>,
  matchId: string,
  tournamentId: string | null
): Promise<ResolvedMatchEntries | null> {
  if (isDerivedMatchId(matchId)) {
    if (!tournamentId) return null;
    const derived = await derivePairingGroupMatches(admin, tournamentId);
    const m = derived.matches.find((mm) => mm.id === matchId);
    if (
      !m ||
      !m.round_id ||
      !m.top_a_entry_id ||
      !m.top_b_entry_id ||
      !m.bottom_a_entry_id ||
      !m.bottom_b_entry_id
    ) {
      return null;
    }
    return {
      tournament_id: tournamentId,
      round_id: m.round_id,
      top_a_entry_id: m.top_a_entry_id,
      top_b_entry_id: m.top_b_entry_id,
      bottom_a_entry_id: m.bottom_a_entry_id,
      bottom_b_entry_id: m.bottom_b_entry_id,
    };
  }

  const { data: mp } = await admin
    .from("matchplay_matches")
    .select("id, tournament_id, round_id, top_pair_id, bottom_pair_id")
    .eq("id", matchId)
    .maybeSingle();

  if (
    !mp ||
    !mp.round_id ||
    !mp.top_pair_id ||
    !mp.bottom_pair_id ||
    !mp.tournament_id
  ) {
    return null;
  }

  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id")
    .in("id", [mp.top_pair_id, mp.bottom_pair_id]);

  const top = (pairs ?? []).find((p) => p.id === mp.top_pair_id);
  const bot = (pairs ?? []).find((p) => p.id === mp.bottom_pair_id);

  if (
    !top?.player_a_entry_id ||
    !top?.player_b_entry_id ||
    !bot?.player_a_entry_id ||
    !bot?.player_b_entry_id
  ) {
    return null;
  }

  return {
    tournament_id: mp.tournament_id,
    round_id: mp.round_id,
    top_a_entry_id: top.player_a_entry_id,
    top_b_entry_id: top.player_b_entry_id,
    bottom_a_entry_id: bot.player_a_entry_id,
    bottom_b_entry_id: bot.player_b_entry_id,
  };
}

type ScorecardRow = {
  id: string;
  player_signed_at: string | null;
  marker_signed_at: string | null;
  witness_signed_at: string | null;
  locked_at: string | null;
};

async function getOrCreateScorecardAdmin(
  admin: ReturnType<typeof createAdminClient>,
  tournament_id: string,
  round_id: string,
  entry_id: string
): Promise<ScorecardRow> {
  const { data: existing } = await admin
    .from("scorecards")
    .select("id, player_signed_at, marker_signed_at, witness_signed_at, locked_at")
    .eq("entry_id", entry_id)
    .eq("round_id", round_id)
    .maybeSingle();

  if (existing) return existing as ScorecardRow;

  const { data: created, error } = await admin
    .from("scorecards")
    .insert({
      tournament_id,
      round_id,
      entry_id,
      status: "draft",
    })
    .select("id, player_signed_at, marker_signed_at, witness_signed_at, locked_at")
    .single();

  if (error) {
    throw new Error(`Error creando scorecard: ${error.message}`);
  }
  return created as ScorecardRow;
}

async function getOrCreatePlayerSignatureToken(
  admin: ReturnType<typeof createAdminClient>,
  scorecard_id: string
): Promise<string> {
  const { data: existing } = await admin
    .from("scorecard_signature_requests")
    .select("token, status, expires_at")
    .eq("scorecard_id", scorecard_id)
    .eq("role", "player")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  const row = existing?.[0];
  if (row?.token) {
    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (!exp || exp.getTime() > Date.now() + 60_000) {
      return row.token;
    }
  }

  const token =
    randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await admin
    .from("scorecard_signature_requests")
    .insert({
      scorecard_id,
      role: "player",
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    throw new Error(`Error creando solicitud de firma: ${error.message}`);
  }
  return token;
}

/**
 * Devuelve los 4 enlaces de firma (uno por jugador) para un match cuya
 * competencia terminó (decidido por marcador o al hoyo 18). Cada
 * jugador firma su propia tarjeta de stroke play.
 *
 * GET /api/matchplay/sign-links?match_id=<uuid|derived-*>&tournament_id=<uuid>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = (url.searchParams.get("match_id") ?? "").trim();
  const tournamentId = (url.searchParams.get("tournament_id") ?? "").trim();

  if (!matchId) {
    return NextResponse.json(
      { ok: false, error: "match_id requerido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const entries = await resolveMatchEntries(
    admin,
    matchId,
    tournamentId || null
  );
  if (!entries) {
    return NextResponse.json(
      { ok: false, error: "match no encontrado o sin jugadores asignados" },
      { status: 404 }
    );
  }

  // Solo torneos públicos pueden generar firmas desde la página pública.
  const { data: tournament } = await admin
    .from("tournaments")
    .select("is_public")
    .eq("id", entries.tournament_id)
    .maybeSingle();
  if (!tournament || tournament.is_public === false) {
    return NextResponse.json(
      { ok: false, error: "no disponible" },
      { status: 404 }
    );
  }

  const allEntryIds = [
    entries.top_a_entry_id,
    entries.top_b_entry_id,
    entries.bottom_a_entry_id,
    entries.bottom_b_entry_id,
  ];

  const { data: entryRows } = await admin
    .from("tournament_entries")
    .select("id, player_id, players:players(first_name, last_name)")
    .in("id", allEntryIds);

  type PlayerRef = {
    first_name: string | null;
    last_name: string | null;
  };
  type EntryRow = {
    id: string;
    player_id: string;
    players: PlayerRef | PlayerRef[] | null;
  };

  function entryLabel(e: EntryRow | undefined): string {
    if (!e) return "—";
    const p = Array.isArray(e.players) ? e.players[0] : e.players;
    return formatPlayerName({
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
    });
  }

  const entryMap = new Map<string, EntryRow>(
    ((entryRows ?? []) as EntryRow[]).map((e) => [e.id, e])
  );

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://staging.listgolf.club";

  const plan: Array<{
    entry_id: string;
    team_side: "top" | "bottom";
    role_in_team: "A" | "B";
  }> = [
    { entry_id: entries.top_a_entry_id, team_side: "top", role_in_team: "A" },
    { entry_id: entries.top_b_entry_id, team_side: "top", role_in_team: "B" },
    {
      entry_id: entries.bottom_a_entry_id,
      team_side: "bottom",
      role_in_team: "A",
    },
    {
      entry_id: entries.bottom_b_entry_id,
      team_side: "bottom",
      role_in_team: "B",
    },
  ];

  const links: SignLink[] = [];

  for (const p of plan) {
    const sc = await getOrCreateScorecardAdmin(
      admin,
      entries.tournament_id,
      entries.round_id,
      p.entry_id
    );

    const token = await getOrCreatePlayerSignatureToken(admin, sc.id);

    const entryRow = entryMap.get(p.entry_id);
    links.push({
      entry_id: p.entry_id,
      player_id: entryRow?.player_id ?? "",
      player_label: entryLabel(entryRow),
      team_side: p.team_side,
      role_in_team: p.role_in_team,
      scorecard_id: sc.id,
      token,
      url: `${baseUrl}/sign/scorecard/${token}`,
      player_signed_at: sc.player_signed_at,
      marker_signed_at: sc.marker_signed_at,
      witness_signed_at: sc.witness_signed_at,
      locked: !!sc.locked_at,
    });
  }

  return NextResponse.json({ ok: true, links });
}
