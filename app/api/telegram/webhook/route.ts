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
import { handleRitmoLocationUpdate } from "@/lib/telegram/ritmo/handleLocationUpdate";
import {
  isRitmoStatusCommand,
  buildRitmoStatusReply,
  isRitmoMapCommand,
  buildRitmoMapReplyForUser,
} from "@/lib/telegram/ritmo/commands";
import {
  isMobileCodeCommand,
  buildMobileCodeReply,
} from "@/lib/telegram/ritmo/mobileCode";
import { isCartCommand, buildCartReply } from "@/lib/telegram/fb/cartCommand";
import { isMenuCommand, buildMenuReply } from "@/lib/telegram/fb/menuCommand";
import {
  isMisRondasCommand,
  buildMisRondasReply,
} from "@/lib/telegram/handicap/misRondasCommand";
import {
  isDistancesCommand,
  buildDistancesReply,
} from "@/lib/telegram/distancesCommand";
import {
  isCalibrarCommand,
  buildCalibrarReply,
} from "@/lib/telegram/calibrarCommand";

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
    "Si eres marshal: envía /soy_marshal tu_email@dominio.com",
    "Comandos: ID · HOLA · /start · /soy_marshal email",
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

    // === RITMO DE JUEGO: Live Location ===
    // Si el update trae una ubicación (compartida o live), procesarla y salir.
    if (parsed.location && userId && supabase) {
      const result = await handleRitmoLocationUpdate(supabase, {
        telegramUserId: userId,
        lat: parsed.location.lat,
        lon: parsed.location.lon,
        accuracy: parsed.location.accuracy,
        messageId: parsed.messageId,
        isLiveUpdate: parsed.isEditedMessage,
      });
      if (result.silent) {
        return NextResponse.json({ ok: true, ritmo: "silent_update" });
      }
      if (result.reply) {
        await sendTelegramMessage({
          chatId: chatId || userId,
          text: result.reply,
        });
      }
      return NextResponse.json({ ok: true, ritmo: "processed" });
    }

    // === RITMO DE JUEGO: comando MAPA ===
    // Link al mapa en vivo (/ritmo). Si el usuario es jugador/caddie vinculado,
    // incluye tournament_id de su torneo activo.
    if (isRitmoMapCommand(command) && userId && supabase) {
      const mapReply = await buildRitmoMapReplyForUser(supabase, userId);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: mapReply.text,
        buttons: mapReply.buttons,
      });
      return NextResponse.json({ ok: true, ritmo: "map_link_sent" });
    }

    // === APP NATIVA: comando CODIGO (genera código one-time para la app) ===
    if (isMobileCodeCommand(command) && userId && supabase) {
      const codeReply = await buildMobileCodeReply(supabase, userId);
      await sendTelegramMessage({ chatId: chatId || userId, text: codeReply });
      return NextResponse.json({ ok: true, mobile_code: "sent" });
    }

    // === F&B: comando MENU (Mini App del menú para socios/clientes) ===
    if (text && isMenuCommand(text) && userId) {
      const menuReply = buildMenuReply(userId);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: menuReply.text,
        buttons: menuReply.buttons,
      });
      return NextResponse.json({ ok: true, menu: "link_sent" });
    }

    // === F&B: comando /CARRITO o /BAR (Mini App para operador del carrito bar) ===
    if (text && isCartCommand(text) && userId && supabase) {
      const cartReply = await buildCartReply(supabase, text);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: cartReply.text,
        buttons: cartReply.buttons,
      });
      return NextResponse.json({ ok: true, cart: "menu_sent" });
    }

    // === HANDICAP: /RONDAS o /MISRONDAS — histórico personal del socio ===
    if (text && isMisRondasCommand(text) && userId) {
      const reply = buildMisRondasReply(userId);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: reply.text,
        buttons: reply.buttons,
      });
      return NextResponse.json({ ok: true, mis_rondas: "link_sent" });
    }

    // === CALIBRACIÓN: /CALIBRAR — mini app para mover greens y puntos (admin) ===
    if (text && isCalibrarCommand(text)) {
      const reply = buildCalibrarReply(userId);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: reply.text,
        buttons: reply.buttons,
      });
      return NextResponse.json({ ok: true, calibrar: "link_sent" });
    }

    // === RANGEFINDER: /DISTANCIAS o /YARDAS — mini app con yardas al green ===
    if (text && isDistancesCommand(text)) {
      const reply = buildDistancesReply(userId);
      await sendTelegramMessage({
        chatId: chatId || userId,
        text: reply.text,
        buttons: reply.buttons,
      });
      return NextResponse.json({ ok: true, distances: "link_sent" });
    }

    // === RITMO DE JUEGO: comando RITMO (jugador o caddie del grupo) ===
    // Se resuelve por sí mismo (jugador o caddie), así que va antes de la
    // identificación de jugador para que también funcione con caddies.
    if (isRitmoStatusCommand(command) && userId && supabase) {
      const statusReply = await buildRitmoStatusReply(supabase, userId);
      await sendTelegramMessage({ chatId: chatId || userId, text: statusReply });
      return NextResponse.json({ ok: true, ritmo: "status_sent" });
    }

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
    } else if (
      /^\/?soy_marshal(\s|$)/i.test((text || "").trim()) ||
      /^\/?soymarshal(\s|$)/i.test((text || "").trim())
    ) {
      // Vinculación de marshal a su profile: "/soy_marshal email@dominio.com"
      // El email debe existir en public.profiles y tener rol marshal asignado.
      const match = (text || "").trim().match(/^\/?soy_?marshal\s+(\S+)/i);
      const emailArg = match?.[1]?.trim().toLowerCase() || "";
      if (!emailArg) {
        replyText = [
          "Para vincularte como Marshal envía:",
          "",
          "/soy_marshal tu_email@dominio.com",
          "",
          "Usa el mismo email con el que el comité te dio de alta.",
        ].join("\n");
      } else {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name, is_active")
          .eq("email", emailArg)
          .maybeSingle();

        if (profileError) {
          console.error("TELEGRAM MARSHAL PROFILE LOOKUP:", profileError);
          replyText = "Ocurrió un error buscando tu perfil.";
        } else if (!profile) {
          replyText = `No encontré el email ${emailArg} en List.golf. Pide al comité que te dé de alta primero.`;
        } else if (profile.is_active === false) {
          replyText = "Tu cuenta está inactiva. Contacta al comité.";
        } else {
          const { data: roleRows } = await supabase
            .from("user_club_roles")
            .select("roles:role_id(code), is_active")
            .eq("user_id", profile.id)
            .eq("is_active", true);

          const isMarshal = (roleRows ?? []).some((r: any) => {
            const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
            return role?.code === "marshal";
          });

          if (!isMarshal) {
            replyText =
              "Tu cuenta existe pero no tiene rol Marshal asignado. Pide al comité que te lo asigne y vuelve a intentarlo.";
          } else {
            const updates: Record<string, unknown> = {
              telegram_chat_id: chatId || userId,
            };
            if (username) updates.telegram_username = username;

            const { error: updateError } = await supabase
              .from("profiles")
              .update(updates)
              .eq("id", profile.id);

            if (updateError) {
              console.error("TELEGRAM MARSHAL UPDATE:", updateError);
              replyText =
                "No pude guardar tu chat_id. Intenta otra vez o avisa al comité.";
            } else {
              const name =
                formatPlayerName(profile.first_name, profile.last_name) ||
                emailArg;
              replyText = [
                `✅ Listo ${name}, estás vinculado como Marshal.`,
                "",
                "Recibirás aquí avisos de tarjetas pendientes y enlaces de captura.",
                "",
                "Para entrar a la web usa tu email y la contraseña que te dio el comité.",
              ].join("\n");
              await supabase
                .from("telegram_pending_links")
                .delete()
                .eq("telegram_user_id", userId);
            }
          }
        }
      }
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
          "Comandos: HOLA · ID · MAPA — abre el mapa de ritmo de juego",
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
        } else if (isRitmoStatusCommand(command)) {
          replyText = await buildRitmoStatusReply(supabase, userId);
        } else if (command === "HOLA") {
          replyText = `Hola ${playerName}, ya te identifiqué correctamente.\n\nComandos: ID · RECIBIDO · RECIBIDO PARCIAL · GRUPO · INICIO · RITMO · MAPA`;
        } else {
          replyText =
            `Hola ${playerName}.\n` +
            `Comandos:\n` +
            `HOLA — verificar vínculo\n` +
            `RECIBIDO / RECIBIDO PARCIAL — confirmar kit\n` +
            `GRUPO o INICIO — salida, grupo y captura (tras confirmar kit)\n` +
            `RITMO — ritmo actual de tu grupo (comparte Live Location primero)\n` +
            `MAPA — abrir el mapa de ritmo del campo en vivo`;
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
