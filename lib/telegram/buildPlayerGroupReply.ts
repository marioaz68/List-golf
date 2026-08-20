import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";
import { resolveDefaultSalidasRoundId } from "@/lib/rounds/resolveDefaultSalidasRound";
import { telegramAppUrl } from "@/lib/telegram/appUrl";

function formatPlayerName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "(sin nombre)";
}

function appBaseUrl() {
  return telegramAppUrl();
}

type RoundRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
  start_type: string | null;
  start_time: string | null;
};

export function buildScoreEntryHref(params: {
  tournamentId: string;
  roundId: string;
  playerNumber: number | null;
  name: string;
}) {
  const sp = new URLSearchParams();
  sp.set("tournament_id", params.tournamentId);
  sp.set("round_id", params.roundId);
  if (params.playerNumber != null) {
    sp.set("q", String(params.playerNumber));
  } else if (params.name.trim()) {
    sp.set("q", params.name.trim());
  }
  return `${appBaseUrl()}/score-entry?${sp.toString()}`;
}

function formatRoundLines(round: RoundRow | null) {
  if (!round) {
    return {
      roundId: null as string | null,
      roundLine: "Ronda: sin ronda asignada",
      roundDateLine: "",
      roundStartTypeLine: "",
      roundStartTimeLine: "",
    };
  }
  return {
    roundId: round.id,
    roundLine: `Ronda: ${round.round_no ?? "-"}`,
    roundDateLine: `Fecha: ${round.round_date ?? "-"}`,
    roundStartTypeLine: `Salida: ${round.start_type ?? "-"}`,
    roundStartTimeLine: `Hora: ${round.start_time ?? "-"}`,
  };
}

/** Datos de grupo / salida + enlace captura para Telegram (INICIO / GRUPO). */
export async function buildPlayerGroupTelegramReply(
  supabase: SupabaseClient,
  playerId: string
): Promise<string> {
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, club")
    .eq("id", playerId)
    .maybeSingle();

  if (playerErr || !player) {
    return "No encontré tu ficha de jugador.";
  }

  const playerName = formatPlayerName(player.first_name, player.last_name);

  const { data: entry, error: entryError } = await supabase
    .from("tournament_entries")
    .select(
      `
      id,
      tournament_id,
      player_number,
      tournaments ( id, name )
    `
    )
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entryError) {
    return `Jugador: ${playerName}\nError buscando inscripción.`;
  }

  if (!entry?.id) {
    return `${playerName}: no tienes inscripción activa en un torneo.`;
  }

  const tournamentRow = Array.isArray(entry.tournaments)
    ? entry.tournaments[0]
    : entry.tournaments;
  const tournamentName = tournamentRow?.name ?? "(sin torneo)";
  const tournamentId = entry.tournament_id;
  const entryId = entry.id;
  const playerNumber =
    entry.player_number != null ? Number(entry.player_number) : null;

  let rounds: RoundRow[] = [];
  if (tournamentId) {
    const { data: roundsRaw } = await supabase
      .from("rounds")
      .select("id, round_no, round_date, start_type, start_time")
      .eq("tournament_id", tournamentId)
      .order("round_no", { ascending: true });
    rounds = (roundsRaw ?? []) as RoundRow[];
  }

  const roundById = new Map(rounds.map((r) => [r.id, r] as const));

  let activeRound: RoundRow | null = null;
  let groupRow: {
    id: string;
    starting_hole: number | null;
    tee_time: string | null;
    group_no: number | null;
  } | null = null;
  let groupMember: { group_id: string; position: number | null } | null = null;

  const { data: memberships } = await supabase
    .from("pairing_group_members")
    .select("group_id, position")
    .eq("entry_id", entryId);

  const memberGroupIds = (memberships ?? [])
    .map((m) => String(m.group_id ?? "").trim())
    .filter(Boolean);

  if (memberGroupIds.length > 0) {
    const { data: memberGroups } = await supabase
      .from("pairing_groups")
      .select("id, round_id, starting_hole, tee_time, group_no")
      .in("id", memberGroupIds);

    let bestRoundNo = Number.POSITIVE_INFINITY;
    for (const g of memberGroups ?? []) {
      const round = roundById.get(String(g.round_id ?? ""));
      if (!round) continue;
      const roundNo = Number(round.round_no ?? 999);
      if (roundNo >= bestRoundNo) continue;
      bestRoundNo = roundNo;
      activeRound = round;
      groupRow = {
        id: String(g.id),
        starting_hole: g.starting_hole,
        tee_time: g.tee_time,
        group_no: g.group_no,
      };
      groupMember =
        (memberships ?? []).find(
          (m) => String(m.group_id) === String(g.id)
        ) ?? null;
    }
  }

  if (!activeRound && tournamentId && rounds.length > 0) {
    const fallbackRoundId = await resolveDefaultSalidasRoundId(
      supabase,
      rounds,
      null
    );
    activeRound = fallbackRoundId
      ? roundById.get(fallbackRoundId) ?? null
      : rounds[0] ?? null;
  }

  const {
    roundId,
    roundLine,
    roundDateLine,
    roundStartTypeLine,
    roundStartTimeLine,
  } = formatRoundLines(activeRound);

  let groupLine = "Grupo: sin grupo asignado aún";
  let groupPositionLine = "";
  let groupHoleLine = "";
  let groupTeeTimeLine = "";
  let teammatesLine = "Compañeros:\n—";
  let captureLine = "";

  if (groupRow && groupMember && roundId) {
    groupLine = `Grupo #${groupRow.group_no ?? groupMember.position ?? "?"}`;
    groupPositionLine = `Posición en el grupo: ${groupMember.position ?? "-"}`;
    groupHoleLine = `Hoyo de salida: ${groupRow.starting_hole ?? "-"}`;
    groupTeeTimeLine = `Tee time: ${groupRow.tee_time ?? "-"}`;

    const { data: members } = await supabase
      .from("pairing_group_members")
      .select(
        `
            position,
            tournament_entries (
              player_number,
              players ( first_name, last_name )
            )
          `
      )
      .eq("group_id", groupRow.id)
      .order("position", { ascending: true });

    if (members && members.length > 0) {
      const lines = members.map((member) => {
        const entryRow = Array.isArray(member.tournament_entries)
          ? member.tournament_entries[0]
          : member.tournament_entries;
        const playerRow = Array.isArray(entryRow?.players)
          ? entryRow.players[0]
          : entryRow?.players;
        const memberName = formatPlayerName(
          playerRow?.first_name ?? null,
          playerRow?.last_name ?? null
        );
        const num = entryRow?.player_number;
        return `${member.position ?? "-"}. ${num != null ? `#${num} ` : ""}${memberName}`;
      });
      teammatesLine = `Compañeros:\n${lines.join("\n")}`;
    }

    const captureUrl = buildGroupCaptureUrl({
      tournamentId,
      roundId,
      groupId: groupRow.id,
      meEntryId: entryId,
    });
    captureLine = `\nCaptura de tarjeta:\n${captureUrl}`;
  }

  if (!captureLine && roundId) {
    const captureUrl = buildScoreEntryHref({
      tournamentId,
      roundId,
      playerNumber,
      name: playerName,
    });
    captureLine = `\nCaptura de tarjeta:\n${captureUrl}`;
  }

  return [
    `Hola ${playerName},`,
    "",
    `Torneo: ${tournamentName}`,
    roundLine,
    roundDateLine,
    roundStartTypeLine,
    roundStartTimeLine,
    "",
    groupLine,
    groupPositionLine,
    groupHoleLine,
    groupTeeTimeLine,
    "",
    teammatesLine,
    captureLine,
  ]
    .filter(Boolean)
    .join("\n");
}
