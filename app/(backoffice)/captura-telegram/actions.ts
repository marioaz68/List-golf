"use server";

import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";

export type SendResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; error: string };

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return [first, last].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ") ||
    "(sin nombre)";
}

async function ensureCanUseModule(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "captura-telegram")) {
    return { ok: false, error: "Sin permisos." };
  }
  return { ok: true, userId: user.id };
}

type Recipient = {
  chatId: string;
  name: string;
  role: "player" | "caddie";
  greeting: string;
};

async function loadGroupRecipients(args: {
  tournamentId: string;
  roundId: string;
  groupId: string;
}): Promise<{
  recipients: Recipient[];
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
}> {
  const admin = tryCreateAdminClient();
  if (!admin) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }

  const { data: tournament } = await admin
    .from("tournaments")
    .select("name")
    .eq("id", args.tournamentId)
    .maybeSingle();

  const { data: group } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time")
    .eq("id", args.groupId)
    .eq("round_id", args.roundId)
    .maybeSingle();

  const groupRow = group
    ? (group as {
        id: string;
        group_no: number | null;
        starting_hole: number | null;
        tee_time: string | null;
      })
    : null;

  const recipients: Recipient[] = [];

  // Jugadores del grupo
  const { data: members } = await admin
    .from("pairing_group_members")
    .select(
      `
      id, position,
      tournament_entries (
        player_number,
        players ( id, first_name, last_name, telegram_user_id, telegram_chat_id )
      )
    `
    )
    .eq("group_id", args.groupId)
    .order("position", { ascending: true });

  type MemberRaw = {
    id: string;
    position: number | null;
    tournament_entries:
      | {
          player_number: number | null;
          players:
            | {
                first_name: string | null;
                last_name: string | null;
                telegram_user_id?: string | null;
                telegram_chat_id?: string | null;
              }
            | null;
        }
      | null;
  };
  for (const m of (members ?? []) as unknown as MemberRaw[]) {
    const entry = Array.isArray(m.tournament_entries)
      ? m.tournament_entries[0]
      : m.tournament_entries;
    const player = entry?.players
      ? Array.isArray(entry.players)
        ? entry.players[0]
        : entry.players
      : null;
    if (!player) continue;
    const chatId = String(player.telegram_chat_id ?? player.telegram_user_id ?? "").trim();
    if (!chatId) continue;
    const name = fullName(player.first_name, player.last_name);
    recipients.push({
      chatId,
      name,
      role: "player",
      greeting: `Hola ${name}`,
    });
  }

  // Caddies asignados al grupo (intentar leer columnas Telegram; si no existen, no hay destinatarios caddie)
  let caddieAssigns: Array<{
    caddie_id: string | null;
  }> = [];
  const { data: assignsRaw } = await admin
    .from("caddie_assignments")
    .select("caddie_id, pairing_group_id, is_active, round_id")
    .eq("tournament_id", args.tournamentId)
    .eq("pairing_group_id", args.groupId);
  caddieAssigns = ((assignsRaw ?? []) as Array<{
    caddie_id: string | null;
    pairing_group_id: string | null;
    is_active: boolean | null;
    round_id: string | null;
  }>)
    .filter(
      (a) => a.is_active !== false && (a.round_id == null || a.round_id === args.roundId)
    )
    .map((a) => ({ caddie_id: a.caddie_id }));

  const caddieIds = Array.from(
    new Set(
      caddieAssigns
        .map((a) => a.caddie_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (caddieIds.length > 0) {
    const tryWithTg = await admin
      .from("caddies")
      .select("id, first_name, last_name, telegram_user_id, telegram_chat_id")
      .in("id", caddieIds);
    if (!tryWithTg.error && tryWithTg.data) {
      for (const c of tryWithTg.data as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        telegram_user_id?: string | null;
        telegram_chat_id?: string | null;
      }>) {
        const chatId = String(c.telegram_chat_id ?? c.telegram_user_id ?? "").trim();
        if (!chatId) continue;
        const name = fullName(c.first_name, c.last_name);
        recipients.push({
          chatId,
          name,
          role: "caddie",
          greeting: `Hola ${name} (caddie)`,
        });
      }
    }
    // Si falla por columnas faltantes, simplemente no hay caddies destinatarios todavía.
  }

  // Dedupe por chatId (si jugador y caddie son el mismo chat)
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    if (seen.has(r.chatId)) return false;
    seen.add(r.chatId);
    return true;
  });

  return {
    recipients: unique,
    groupNo: groupRow?.group_no ?? null,
    startingHole: groupRow?.starting_hole ?? null,
    teeTime: groupRow?.tee_time ?? null,
    tournamentName: tournament?.name ?? null,
  };
}

function buildMessage(args: {
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
  url: string;
  greeting: string;
}): string {
  const lines: string[] = [];
  lines.push(`${args.greeting},`);
  lines.push("");
  lines.push("📋 Captura por grupo");
  if (args.tournamentName) lines.push(`Torneo: ${args.tournamentName}`);
  lines.push(`Grupo #${args.groupNo ?? "?"}`);
  if (args.startingHole != null) lines.push(`Hoyo de salida: ${args.startingHole}`);
  if (args.teeTime) lines.push(`Tee time: ${args.teeTime}`);
  lines.push("");
  lines.push(
    "Cualquiera del grupo (jugador o caddie) puede capturar y todos verán los cambios en tiempo real."
  );
  lines.push("");
  lines.push("Captura de tarjeta:");
  lines.push(args.url);
  return lines.join("\n");
}

export async function sendCaptureLinkToGroupAction(
  formData: FormData
): Promise<SendResult> {
  const access = await ensureCanUseModule();
  if (!access.ok) return { ok: false, error: access.error };

  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const roundId = String(formData.get("round_id") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();
  if (!tournamentId || !roundId || !groupId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  try {
    const data = await loadGroupRecipients({ tournamentId, roundId, groupId });
    if (data.recipients.length === 0) {
      return { ok: true, sent: 0, failed: 0 };
    }
    const url = buildGroupCaptureUrl({ tournamentId, roundId, groupId });
    let sent = 0;
    let failed = 0;
    for (const r of data.recipients) {
      const text = buildMessage({
        groupNo: data.groupNo,
        startingHole: data.startingHole,
        teeTime: data.teeTime,
        tournamentName: data.tournamentName,
        url,
        greeting: r.greeting,
      });
      const res = await sendTelegramMessage({ chatId: r.chatId, text });
      if (res.ok) sent += 1;
      else failed += 1;
    }
    return { ok: true, sent, failed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}

export async function sendCaptureLinkToAllGroupsAction(
  formData: FormData
): Promise<SendResult> {
  const access = await ensureCanUseModule();
  if (!access.ok) return { ok: false, error: access.error };

  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const roundId = String(formData.get("round_id") ?? "").trim();
  if (!tournamentId || !roundId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  try {
    const admin = tryCreateAdminClient();
    if (!admin) {
      return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY." };
    }
    const { data: groups } = await admin
      .from("pairing_groups")
      .select("id")
      .eq("round_id", roundId)
      .order("group_no", { ascending: true });

    let sent = 0;
    let failed = 0;
    for (const g of (groups ?? []) as Array<{ id: string }>) {
      const fd = new FormData();
      fd.set("tournament_id", tournamentId);
      fd.set("round_id", roundId);
      fd.set("group_id", g.id);
      const r = await sendCaptureLinkToGroupAction(fd);
      if (r.ok) {
        sent += r.sent;
        failed += r.failed;
      } else {
        failed += 1;
      }
    }
    return { ok: true, sent, failed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}
