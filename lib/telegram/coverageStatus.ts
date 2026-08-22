import type {
  TelegramLinkStatus,
} from "@/lib/telegram/linkToken";
import {
  classifyTelegramLinkStatus,
  telegramStatusLabel,
} from "@/lib/telegram/linkToken";

export type TelegramCoveragePerson = {
  role: "player" | "caddie";
  id: string;
  name: string;
  phone: string | null;
  status: TelegramLinkStatus;
  statusLabel: string;
  groupNo: number | null;
  teeTime: string | null;
  /** Para copiar deep link (player_id o caddie_id). */
  subjectId: string;
};

export function phoneForWhatsApp(
  phone: string | null | undefined,
  whatsapp?: string | null | undefined
): string | null {
  const raw = String(whatsapp ?? phone ?? "").trim();
  return raw || null;
}

export function coverageFromTelegramFields(params: {
  role: "player" | "caddie";
  id: string;
  name: string;
  phone?: string | null;
  whatsappPhone?: string | null;
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
  telegram?: string | null;
  telegram_chat_invalid_at?: string | null;
  groupNo?: number | null;
  teeTime?: string | null;
}): TelegramCoveragePerson {
  const status = classifyTelegramLinkStatus({
    telegram_user_id: params.telegram_user_id,
    telegram_chat_id: params.telegram_chat_id,
    telegram: params.telegram,
    telegram_chat_invalid_at: params.telegram_chat_invalid_at,
  });
  return {
    role: params.role,
    id: params.id,
    name: params.name || (params.role === "caddie" ? "Caddie" : "Jugador"),
    phone: phoneForWhatsApp(params.phone, params.whatsappPhone),
    status,
    statusLabel: telegramStatusLabel(status),
    groupNo: params.groupNo ?? null,
    teeTime: params.teeTime ?? null,
    subjectId: params.id,
  };
}

export function unreachableOnly(
  people: TelegramCoveragePerson[]
): TelegramCoveragePerson[] {
  return people.filter((p) => p.status !== "linked");
}

export function statusChipClass(status: TelegramLinkStatus): string {
  switch (status) {
    case "linked":
      return "bg-emerald-100 text-emerald-800 ring-emerald-300";
    case "invalid":
      return "bg-red-100 text-red-800 ring-red-300";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-300";
  }
}

export function statusChipTitle(status: TelegramLinkStatus): string {
  switch (status) {
    case "linked":
      return "Telegram vinculado — recibirá aviso";
    case "invalid":
      return "Chat inválido (no encontrado o bot bloqueado) — no recibirá aviso";
    default:
      return "Sin Telegram vinculado — no recibirá aviso";
  }
}
