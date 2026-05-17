import type { SupabaseClient } from "@supabase/supabase-js";

function formatPlayerName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "(sin nombre)";
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

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

  let roundLine = "Ronda: sin ronda asignada";
  let roundDateLine = "";
  let roundStartTypeLine = "";
  let roundStartTimeLine = "";
  let roundId: string | null = null;

  if (tournamentId) {
    const { data: round } = await supabase
      .from("rounds")
      .select("id, round_no, round_date, start_type, start_time")
      .eq("tournament_id", tournamentId)
      .order("round_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (round) {
      roundId = round.id;
      roundLine = `Ronda: ${round.round_no ?? "-"}`;
      roundDateLine = `Fecha: ${round.round_date ?? "-"}`;
      roundStartTypeLine = `Salida: ${round.start_type ?? "-"}`;
      roundStartTimeLine = `Hora: ${round.start_time ?? "-"}`;
    }
  }

  let groupLine = "Grupo: sin grupo asignado aún";
  let groupPositionLine = "";
  let groupHoleLine = "";
  let groupTeeTimeLine = "";
  let teammatesLine = "Compañeros:\n—";
  let captureLine = "";

  if (roundId && entryId) {
    const { data: groupMember } = await supabase
      .from("pairing_group_members")
      .select("group_id, position")
      .eq("entry_id", entryId)
      .maybeSingle();

    if (groupMember?.group_id) {
      const { data: groupRow } = await supabase
        .from("pairing_groups")
        .select("id, starting_hole, tee_time")
        .eq("id", groupMember.group_id)
        .eq("round_id", roundId)
        .maybeSingle();

      if (groupRow) {
        groupLine = `Grupo #${groupMember.position ?? "?"}`;
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

        const captureUrl = buildScoreEntryHref({
          tournamentId,
          roundId,
          playerNumber,
          name: playerName,
        });
        captureLine = `\nCaptura de tarjeta:\n${captureUrl}`;
      }
    }
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
