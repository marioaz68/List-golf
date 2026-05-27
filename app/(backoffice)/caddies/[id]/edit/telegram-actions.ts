"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMissingCaddieTelegramColumnsError } from "@/lib/caddies/telegramColumns";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";

function backUrl(caddieId: string, extra?: Record<string, string>) {
  const qs = new URLSearchParams(extra ?? {});
  const q = qs.toString();
  return q ? `/caddies/${caddieId}/edit?${q}` : `/caddies/${caddieId}/edit`;
}

export async function saveCaddieTelegramAction(formData: FormData) {
  const caddieId = String(formData.get("caddie_id") ?? "").trim();
  const clearing = String(formData.get("clear_telegram") ?? "") === "1";

  if (!caddieId) {
    throw new Error("Falta id del caddie");
  }

  const admin = createAdminClient();

  if (clearing) {
    const { error } = await admin
      .from("caddies")
      .update({ telegram_user_id: null, telegram_chat_id: null })
      .eq("id", caddieId);

    if (error) {
      if (isMissingCaddieTelegramColumnsError(error.message)) {
        redirect(
          `${backUrl(caddieId, {
            err: "Falta migración en Supabase: columnas telegram_user_id en caddies.",
          })}`
        );
      }
      redirect(`${backUrl(caddieId, { err: error.message })}`);
    }

    revalidatePath("/caddies");
    revalidatePath(`/caddies/${caddieId}/edit`);
    revalidatePath("/captura-telegram");
    redirect(`${backUrl(caddieId, { saved: "1" })}`);
  }

  const telegramUserIdRaw = String(formData.get("telegram_user_id") ?? "").trim();
  const telegramChatIdRaw = String(formData.get("telegram_chat_id") ?? "").trim();

  if (!telegramUserIdRaw) {
    redirect(
      `${backUrl(caddieId, {
        err: "Escribe el user ID de Telegram o usa «Quitar vínculo».",
      })}`
    );
  }

  if (!/^\d+$/.test(telegramUserIdRaw)) {
    redirect(
      `${backUrl(caddieId, {
        err: "El user ID de Telegram debe ser solo dígitos.",
      })}`
    );
  }

  if (telegramChatIdRaw && !/^\d+$/.test(telegramChatIdRaw)) {
    redirect(
      `${backUrl(caddieId, {
        err: "El chat ID debe ser solo dígitos o vacío.",
      })}`
    );
  }

  const patch = {
    telegram_user_id: telegramUserIdRaw,
    telegram_chat_id:
      telegramChatIdRaw && /^\d+$/.test(telegramChatIdRaw)
        ? telegramChatIdRaw
        : null,
  };

  const { error } = await admin.from("caddies").update(patch).eq("id", caddieId);

  if (error) {
    if (isMissingCaddieTelegramColumnsError(error.message)) {
      redirect(
        `${backUrl(caddieId, {
          err: "Falta migración en Supabase: columnas telegram_user_id en caddies.",
        })}`
      );
    }
    redirect(`${backUrl(caddieId, { err: error.message })}`);
  }

  await admin
    .from("telegram_pending_links")
    .delete()
    .eq("telegram_user_id", telegramUserIdRaw);

  revalidatePath("/caddies");
  revalidatePath(`/caddies/${caddieId}/edit`);
  revalidatePath("/captura-telegram");
  redirect(`${backUrl(caddieId, { saved: "1" })}`);
}

export async function verifyCaddieTelegramAction(formData: FormData) {
  const caddieId = String(formData.get("caddie_id") ?? "").trim();
  if (!caddieId) {
    throw new Error("Falta id del caddie");
  }

  const admin = createAdminClient();

  const { data: caddie, error } = await admin
    .from("caddies")
    .select("id, first_name, last_name, telegram_user_id, telegram_chat_id")
    .eq("id", caddieId)
    .maybeSingle();

  if (error) {
    if (isMissingCaddieTelegramColumnsError(error.message)) {
      redirect(
        `${backUrl(caddieId, {
          err: "Falta migración en Supabase: columnas telegram_user_id en caddies.",
        })}`
      );
    }
    redirect(`${backUrl(caddieId, { err: error.message })}`);
  }

  if (!caddie) {
    redirect(`${backUrl(caddieId, { err: "Caddie no encontrado." })}`);
  }

  const tgUid = String(caddie.telegram_user_id ?? "").trim();
  if (!tgUid) {
    redirect(
      `${backUrl(caddieId, {
        err: "Primero guarda el user ID de Telegram en la ficha.",
      })}`
    );
  }

  const chatId = String(caddie.telegram_chat_id ?? "").trim() || tgUid;
  const name =
    `${caddie.first_name ?? ""} ${caddie.last_name ?? ""}`.trim() || "caddie";

  const ping = [
    `Hola ${name},`,
    "",
    "Verificación List.golf — caddie.",
    "Si ves este mensaje, tu Telegram está vinculado correctamente.",
    "",
    "Cuando el comité te envíe el link de captura de tu grupo, podrás abrirlo desde aquí.",
    "Escribe HOLA cuando quieras.",
  ].join("\n");

  const sent = await sendTelegramMessage({ chatId, text: ping });
  if (!sent.ok) {
    redirect(`${backUrl(caddieId, { err: sent.error })}`);
  }

  if (!caddie.telegram_chat_id?.trim()) {
    await admin
      .from("caddies")
      .update({ telegram_chat_id: chatId })
      .eq("id", caddieId);
  }

  revalidatePath(`/caddies/${caddieId}/edit`);
  redirect(`${backUrl(caddieId, { verified: "1" })}`);
}
