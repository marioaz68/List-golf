import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractTelegramMessageUpdate } from "@/lib/telegram/extractUpdate";
import { buildPlayerGroupTelegramReply } from "@/lib/telegram/buildPlayerGroupReply";
import { canAccessGroupInfo } from "@/lib/telegram/kitAccess";
import {
  isGroupInfoCommand,
  isKitPartialReceivedCommand,
  isKitReceivedCommand,
} from "@/lib/telegram/kitMessage";
import {
  confirmKitCompleteForPlayer,
  confirmKitPartialForPlayer,
} from "@/lib/telegram/kitReceive";
import {
  getTelegramBotUsername,
  getTelegramWebhookInfo,
  sendTelegramMessage,
  setTelegramWebhook,
} from "@/lib/telegram/sendMessage";
import { isTelegramIdRequest, parseTelegramCommand } from "@/lib/telegram/parseCommand";
import { resolveTelegramUserId } from "@/lib/telegram/resolveUserId";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SETUP_SECRET = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET?.trim();

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function formatPlayerName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "(sin nombre)";
}

function buildUnlinkedTelegramReply(telegramUserId: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const botUser = getTelegramBotUsername();
  const botLine = botUser
    ? `Bot del torneo: @${botUser}`
    : "Pide al comité el nombre de usuario del bot de Telegram del torneo.";

  const webHint = appUrl
    ? `\nWeb: ${appUrl}\nJugador: Inscripciones → Inscritos → KIT.\nCaddie: Caddies → tu ficha → pegar el ID.`
    : "\nJugador: Inscripciones → Inscritos → KIT.\nCaddie: Caddies → tu ficha → pegar el ID.";

  const idLine = telegramUserId.trim();

  return [
    "⚠️ Tu Telegram no está vinculado en List.golf.",
    "",
    "━━━━ TU ID (cópialo) ━━━━",
    idLine || "ERROR: no se pudo leer tu ID. Escribe a @userinfobot y envía el número al comité.",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "Envía este número al comité (o pégalo tú mismo si tienes acceso).",
    "Si eres caddie, el comité te vincula desde Caddies.",
    "Comandos: ID · HOLA · /start",
    "",
    botLine,
    webHint,
  ].join("\n");
}

function buildTelegramIdOnlyReply(telegramUserId: string) {
  const idLine = telegramUserId.trim();
  return [
    "Tu ID numérico de Telegram:",
    "",
    idLine || "No se pudo leer. Usa @userinfobot en Telegram.",
    "",
    "Cópialo y dáselo al comité (pantalla KIT → Guardar).",
    "Luego escribe HOLA.",
  ].join("\n");
}

async function recordPendingTelegramLink(params: {
  telegramUserId: string;
  telegramChatId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  lastMessage: string;
}) {
  if (!supabase || !params.telegramUserId.trim()) return;

  const { error } = await supabase.from("telegram_pending_links").upsert(
    {
      telegram_user_id: params.telegramUserId.trim(),
      telegram_chat_id: params.telegramChatId.trim() || null,
      first_name: params.firstName,
      last_name: params.lastName,
      username: params.username,
      last_message: params.lastMessage.slice(0, 500),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );

  if (error) {
    console.error("TELEGRAM PENDING LINK UPSERT:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TELEGRAM WEBHOOK UPDATE:", JSON.stringify(body, null, 2));

    const parsed = extractTelegramMessageUpdate(
      body as Record<string, unknown>
    );

    if (!parsed) {
      return NextResponse.json({ ok: true, skipped: "no_message" });
    }

    const { chatId, text, firstName, lastName, username, chatType } = parsed;
    const userId = resolveTelegramUserId({
      fromId: parsed.fromId,
      chatId,
      chatType,
    });
    const command = parseTelegramCommand(text);

    let replyText = "No pude procesar tu mensaje.";

    if (!TELEGRAM_TOKEN?.trim()) {
      replyText = "Error: bot sin token en el servidor (TELEGRAM_BOT_TOKEN).";
    } else if (!supabase) {
      replyText = "Error de configuración del servidor (base de datos).";
    } else if (!userId) {
      replyText =
        "No pude leer tu ID de Telegram. Abre chat privado con el bot (no un grupo) o usa @userinfobot.";
    } else if (isTelegramIdRequest(command)) {
      replyText = buildTelegramIdOnlyReply(userId);
      await recordPendingTelegramLink({
        telegramUserId: userId,
        telegramChatId: chatId,
        firstName,
        lastName,
        username,
        lastMessage: text || command,
      });
    } else {
      const { data: player, error: playerError } = await supabase
        .from("players")
        .select(
          "id, first_name, last_name, club, telegram_user_id, telegram_chat_id"
        )
        .eq("telegram_user_id", userId)
        .maybeSingle();

      // Si no es jugador vinculado, probamos con caddie.
      // Si la columna telegram_user_id aún no existe en caddies, simplemente ignoramos.
      type CaddieMatch = {
        id: string;
        first_name: string | null;
        last_name: string | null;
        telegram_chat_id?: string | null;
      };
      let caddieRow: CaddieMatch | null = null;
      if (!playerError && !player) {
        const caddieLookup = await supabase
          .from("caddies")
          .select("id, first_name, last_name, telegram_chat_id")
          .eq("telegram_user_id", userId)
          .maybeSingle();
        if (!caddieLookup.error && caddieLookup.data) {
          caddieRow = caddieLookup.data as unknown as CaddieMatch;
        }
      }

      if (playerError) {
        console.error("TELEGRAM PLAYER LOOKUP ERROR:", playerError);
        replyText = "Ocurrió un error buscando tu jugador.";
      } else if (!player && caddieRow) {
        // Caddie vinculado: actualizar chat_id si cambió y responder.
        if (
          chatId &&
          (!caddieRow.telegram_chat_id || caddieRow.telegram_chat_id !== chatId)
        ) {
          await supabase
            .from("caddies")
            .update({ telegram_chat_id: chatId })
            .eq("id", caddieRow.id);
        }
        await supabase
          .from("telegram_pending_links")
          .delete()
          .eq("telegram_user_id", userId);

        const caddieName = formatPlayerName(
          caddieRow.first_name,
          caddieRow.last_name
        );
        replyText = [
          `Hola ${caddieName} (caddie), ya te identifiqué.`,
          "",
          "Cuando el comité te asigne grupo recibirás aquí el link de captura por grupo.",
          "",
          "Comandos: HOLA · ID",
        ].join("\n");
      } else if (!player) {
        replyText = buildUnlinkedTelegramReply(userId);
        await recordPendingTelegramLink({
          telegramUserId: userId,
          telegramChatId: chatId,
          firstName,
          lastName,
          username,
          lastMessage: text || command,
        });
      } else {
        await supabase
          .from("telegram_pending_links")
          .delete()
          .eq("telegram_user_id", userId);

        const playerName = formatPlayerName(player.first_name, player.last_name);

        if (chatId && (!player.telegram_chat_id || player.telegram_chat_id !== chatId)) {
          await supabase
            .from("players")
            .update({ telegram_chat_id: chatId })
            .eq("id", player.id);
        }

        if (isKitPartialReceivedCommand(text)) {
          const confirmed = await confirmKitPartialForPlayer(
            supabase,
            player.id,
            chatId
          );
          replyText = confirmed.message;
        } else if (isKitReceivedCommand(text)) {
          const confirmed = await confirmKitCompleteForPlayer(
            supabase,
            player.id,
            chatId
          );
          replyText = confirmed.message;
        } else if (isGroupInfoCommand(command)) {
          const { data: kitEntry } = await supabase
            .from("tournament_entries")
            .select(
              "telegram_kit_received_at, telegram_kit_partial_received_at, telegram_kit_sent_at"
            )
            .eq("player_id", player.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!kitEntry?.telegram_kit_sent_at) {
            replyText =
              "El comité aún no te ha enviado el kit por Telegram. Cuando lo recibas, confirma con RECIBIDO o RECIBIDO PARCIAL.";
          } else if (!canAccessGroupInfo(kitEntry)) {
            replyText =
              "Primero confirma que recibiste el kit:\n• RECIBIDO PARCIAL — si te falta algo\n• RECIBIDO — cuando tengas todo\n\nLuego escribe GRUPO o INICIO.";
          } else {
            replyText = await buildPlayerGroupTelegramReply(supabase, player.id);
          }
        } else if (command === "HOLA") {
          replyText = `Hola ${playerName}, ya te identifiqué correctamente.\n\nComandos: ID · RECIBIDO · RECIBIDO PARCIAL · GRUPO · INICIO`;
        } else {
          replyText =
            `Hola ${playerName}.\n` +
            `Comandos:\n` +
            `HOLA — verificar vínculo\n` +
            `RECIBIDO / RECIBIDO PARCIAL — confirmar kit\n` +
            `GRUPO o INICIO — salida, grupo y captura (tras confirmar kit)`;
        }
      }
    }

    const targetChat = chatId || userId;
    const sent = await sendTelegramMessage({ chatId: targetChat, text: replyText });
    if (!sent.ok) {
      console.error("TELEGRAM SEND MESSAGE FAILED:", sent.error, {
        targetChat,
        userId,
      });
    }

    return NextResponse.json({
      ok: true,
      replied: sent.ok,
      userId: userId || null,
    });
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const diag = url.searchParams.get("diag") === "1";
  const setup = url.searchParams.get("setup") === "1";
  const secret = url.searchParams.get("secret") ?? "";

  if (setup) {
    if (!WEBHOOK_SETUP_SECRET || secret !== WEBHOOK_SETUP_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "https://www.listgolf.club"
    ).replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    const result = await setTelegramWebhook(webhookUrl);
    const info = await getTelegramWebhookInfo();

    return NextResponse.json({
      ok: result.ok,
      webhookUrl,
      setWebhook: result,
      webhookInfo: info.ok ? info.result : info.error,
    });
  }

  if (diag) {
    const info = await getTelegramWebhookInfo();
    return NextResponse.json({
      ok: true,
      hasToken: Boolean(TELEGRAM_TOKEN?.trim()),
      hasSupabase: Boolean(supabase),
      botUsername: getTelegramBotUsername() || null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      webhookInfo: info.ok ? info.result : { error: info.error },
    });
  }

  return NextResponse.json({
    ok: true,
    route: "telegram webhook",
    hint: "Añade ?diag=1 para estado del webhook en Telegram",
  });
}
