import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TELEGRAM WEBHOOK UPDATE:", JSON.stringify(body, null, 2));

    const message = body.message;

    if (message) {
      const chatId = String(message.chat?.id ?? "");
      const fromId = String(message.from?.id ?? "");
      const text = String(message.text ?? "");
      const command = normalizeText(text);

      let replyText = "No pude procesar tu mensaje.";

      if (!supabase) {
        replyText = "Error de configuración del servidor.";
      } else if (!fromId) {
        replyText = "No llegó el identificador de Telegram.";
      } else {
        const { data: player, error: playerError } = await supabase
          .from("players")
          .select(
            "id, first_name, last_name, club, telegram_user_id, telegram_chat_id"
          )
          .eq("telegram_user_id", fromId)
          .maybeSingle();

        if (playerError) {
          console.error("TELEGRAM PLAYER LOOKUP ERROR:", playerError);
          replyText = "Ocurrió un error buscando tu jugador.";
        } else if (!player) {
          replyText =
            "Tu cuenta de Telegram no está vinculada a ningún jugador.";
        } else {
          const playerName = [player.first_name, player.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();

          if (command === "HOLA") {
            replyText = `Hola ${playerName || "jugador"}, ya te identifiqué correctamente.`;
          } else if (command === "INICIO") {
            const { data: entry, error: entryError } = await supabase
              .from("tournament_entries")
              .select(
                `
                id,
                tournament_id,
                tournaments (
                  id,
                  name
                )
              `
              )
              .eq("player_id", player.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (entryError) {
              console.error("TELEGRAM ENTRY LOOKUP ERROR:", entryError);
              replyText =
                `Jugador: ${playerName || "(sin nombre)"}\n` +
                `ID jugador: ${player.id}\n` +
                `Club: ${player.club || "(sin club)"}\n` +
                `Estado: cuenta de Telegram vinculada correctamente\n` +
                `Torneo: error buscando inscripción`;
            } else {
              const tournamentRow = Array.isArray(entry?.tournaments)
                ? entry.tournaments[0]
                : entry?.tournaments;

              const tournamentName = tournamentRow?.name ?? "(sin torneo)";
              const entryId = entry?.id ?? null;
              const tournamentId = entry?.tournament_id ?? null;

              let roundLine = `Ronda: sin ronda`;
              let roundDateLine = `Fecha ronda: -`;
              let roundStartTypeLine = `Tipo salida: -`;
              let roundStartTimeLine = `Hora salida: -`;

              let roundId: string | null = null;

              if (tournamentId) {
                const { data: round, error: roundError } = await supabase
                  .from("rounds")
                  .select(
                    "id, round_no, round_date, start_type, start_time, interval_minutes"
                  )
                  .eq("tournament_id", tournamentId)
                  .order("round_no", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (roundError) {
                  console.error("TELEGRAM ROUND LOOKUP ERROR:", roundError);
                  roundLine = "Ronda: error buscando ronda";
                } else if (round) {
                  roundId = round.id;
                  roundLine = `Ronda: ${round.round_no ?? "-"}`;
                  roundDateLine = `Fecha ronda: ${round.round_date ?? "-"}`;
                  roundStartTypeLine = `Tipo salida: ${round.start_type ?? "-"}`;
                  roundStartTimeLine = `Hora salida: ${round.start_time ?? "-"}`;
                }
              }

              let groupLine = `Group ID: sin grupo`;
              let groupPositionLine = `Posición grupo: -`;
              let groupHoleLine = `Hoyo salida grupo: -`;
              let groupTeeTimeLine = `Tee time grupo: -`;

              if (roundId && entryId) {
                const { data: groupMember, error: groupMemberError } =
                  await supabase
                    .from("pairing_group_members")
                    .select("group_id, position, entry_id")
                    .eq("round_id", roundId)
                    .eq("entry_id", entryId)
                    .maybeSingle();

                if (groupMemberError) {
                  console.error(
                    "TELEGRAM GROUP MEMBER LOOKUP ERROR:",
                    groupMemberError
                  );
                  groupLine = "Group ID: error buscando grupo";
                } else if (groupMember?.group_id) {
                  groupLine = `Group ID: ${groupMember.group_id}`;
                  groupPositionLine = `Posición grupo: ${groupMember.position ?? "-"}`;

                  const { data: groupRow, error: groupRowError } = await supabase
                    .from("pairing_groups")
                    .select("id, starting_hole, tee_time")
                    .eq("id", groupMember.group_id)
                    .maybeSingle();

                  if (groupRowError) {
                    console.error("TELEGRAM GROUP LOOKUP ERROR:", groupRowError);
                    groupHoleLine = "Hoyo salida grupo: error";
                  } else if (groupRow) {
                    groupHoleLine = `Hoyo salida grupo: ${groupRow.starting_hole ?? "-"}`;
                    groupTeeTimeLine = `Tee time grupo: ${groupRow.tee_time ?? "-"}`;
                  }
                }
              }

              replyText =
                `Jugador: ${playerName || "(sin nombre)"}\n` +
                `ID jugador: ${player.id}\n` +
                `Club: ${player.club || "(sin club)"}\n` +
                `Estado: cuenta de Telegram vinculada correctamente\n` +
                `Torneo: ${entryId ? tournamentName : "sin inscripción"}\n` +
                `Entry ID: ${entryId || "(sin entry)"}\n` +
                `${roundLine}\n` +
                `${roundDateLine}\n` +
                `${roundStartTypeLine}\n` +
                `${roundStartTimeLine}\n` +
                `${groupLine}\n` +
                `${groupPositionLine}\n` +
                `${groupHoleLine}\n` +
                `${groupTeeTimeLine}`;
            }
          } else {
            replyText =
              `Hola ${playerName || "jugador"}.\n` +
              `Comandos disponibles:\n` +
              `HOLA\n` +
              `INICIO`;
          }
        }
      }

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "telegram webhook",
  });
}