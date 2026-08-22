import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";
import { refreshLiveGroupSalida } from "@/lib/telegram/refreshLiveGroupSalida";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";

export type CaptureLinkSendOutcome = {
  name: string;
  role: "player" | "caddie";
  status: "sent" | "failed" | "skipped";
  detail?: string | null;
};

export type CaptureLinkSendResult = {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  outcomes: CaptureLinkSendOutcome[];
  error?: string;
};

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return (
    [first, last]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ") || "(sin nombre)"
  );
}

type Recipient = {
  chatId: string;
  name: string;
  role: "player" | "caddie";
  greeting: string;
  entryId?: string | null;
  caddieId?: string | null;
};

async function loadGroupRecipients(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundId: string;
    groupId: string;
  }
): Promise<{
  recipients: Recipient[];
  skipped: { name: string; role: "player" | "caddie" }[];
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
}> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("name")
    .eq("id", args.tournamentId)
    .maybeSingle();

  const refreshed = await refreshLiveGroupSalida(admin, {
    groupId: args.groupId,
    roundId: args.roundId,
  });
  const groupRow = refreshed
    ? {
        group_no: refreshed.live.groupNo,
        starting_hole: refreshed.live.startingHole,
        tee_time: refreshed.live.teeTime,
      }
    : null;

  const recipients: Recipient[] = [];
  const skipped: { name: string; role: "player" | "caddie" }[] = [];

  const { data: members } = await admin
    .from("pairing_group_members")
    .select(
      `
      id, position, entry_id,
      tournament_entries (
        id, player_number,
        players ( id, first_name, last_name, telegram_user_id, telegram_chat_id )
      )
    `
    )
    .eq("group_id", args.groupId)
    .order("position", { ascending: true });

  type MemberRaw = {
    entry_id: string | null;
    tournament_entries:
      | {
          id: string | null;
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

  const groupEntryIds: string[] = [];
  for (const m of (members ?? []) as unknown as MemberRaw[]) {
    const entry = Array.isArray(m.tournament_entries)
      ? m.tournament_entries[0]
      : m.tournament_entries;
    const player = entry?.players
      ? Array.isArray(entry.players)
        ? entry.players[0]
        : entry.players
      : null;
    const entryId = String(m.entry_id ?? entry?.id ?? "").trim();
    if (entryId) groupEntryIds.push(entryId);
    if (!player) continue;
    const name = fullName(player.first_name, player.last_name);
    const chatId = String(
      player.telegram_chat_id ?? player.telegram_user_id ?? ""
    ).trim();
    if (!chatId) {
      skipped.push({ name, role: "player" });
      continue;
    }
    recipients.push({
      chatId,
      name,
      role: "player",
      greeting: `Hola ${name}`,
      entryId: entryId || null,
    });
  }

  if (groupEntryIds.length > 0) {
    const { data: assignsRaw } = await admin
      .from("caddie_assignments")
      .select("caddie_id, entry_id, is_active, round_id")
      .eq("tournament_id", args.tournamentId)
      .in("entry_id", groupEntryIds);
    const caddieIds = Array.from(
      new Set(
        ((assignsRaw ?? []) as Array<{
          caddie_id: string | null;
          entry_id: string | null;
          is_active: boolean | null;
          round_id: string | null;
        }>)
          .filter(
            (a) =>
              a.is_active !== false &&
              (a.round_id == null || a.round_id === args.roundId)
          )
          .map((a) => a.caddie_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (caddieIds.length > 0) {
      const { data: caddiesRaw } = await admin
        .from("caddies")
        .select("id, first_name, last_name, telegram")
        .in("id", caddieIds);
      for (const c of (caddiesRaw ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        telegram?: string | null;
      }>) {
        const name = fullName(c.first_name, c.last_name);
        const chatId = String(c.telegram ?? "").trim();
        if (!/^\d+$/.test(chatId)) {
          skipped.push({ name, role: "caddie" });
          continue;
        }
        recipients.push({
          chatId,
          name,
          role: "caddie",
          greeting: `Hola ${name} (caddie)`,
          caddieId: c.id,
        });
      }
    }
  }

  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    const key = `${r.chatId}|${r.role}|${r.entryId ?? ""}|${r.caddieId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    recipients: unique,
    skipped,
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
  greeting: string;
}): string {
  const lines: string[] = [];
  lines.push(`${args.greeting},`);
  lines.push("");
  lines.push("📋 Captura por grupo");
  if (args.tournamentName) lines.push(`Torneo: ${args.tournamentName}`);
  lines.push(`Grupo #${args.groupNo ?? "?"}`);
  if (args.startingHole != null) {
    lines.push(`Hoyo de salida: ${args.startingHole}`);
  }
  if (args.teeTime) lines.push(`Tee time: ${args.teeTime}`);
  lines.push("");
  lines.push(
    "Cualquiera del grupo (jugador o caddie) puede capturar y todos verán los cambios en tiempo real."
  );
  lines.push("");
  lines.push("Toca el botón para abrir la tarjeta:");
  return lines.join("\n");
}

/** Envía links de captura por Telegram a jugadores y caddies del grupo. */
export async function sendCaptureLinksToGroup(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundId: string;
    groupId: string;
  }
): Promise<CaptureLinkSendResult> {
  try {
    const data = await loadGroupRecipients(admin, args);
    const outcomes: CaptureLinkSendOutcome[] = [];
    let sent = 0;
    let failed = 0;

    for (const r of data.recipients) {
      const personalUrl = buildGroupCaptureUrl({
        tournamentId: args.tournamentId,
        roundId: args.roundId,
        groupId: args.groupId,
        meEntryId: r.role === "player" ? (r.entryId ?? null) : null,
        caddieId: r.role === "caddie" ? (r.caddieId ?? null) : null,
      });
      const text = buildMessage({
        groupNo: data.groupNo,
        startingHole: data.startingHole,
        teeTime: data.teeTime,
        tournamentName: data.tournamentName,
        greeting: r.greeting,
      });
      const buttonLabel = `📝 Capturar Grupo ${data.groupNo ?? ""}`.trim();
      const res = await sendTelegramMessage({
        chatId: r.chatId,
        text,
        buttons: [[{ text: buttonLabel, url: personalUrl }]],
        disablePreview: true,
      });
      if (res.ok) {
        sent += 1;
        outcomes.push({ name: r.name, role: r.role, status: "sent" });
      } else {
        failed += 1;
        outcomes.push({
          name: r.name,
          role: r.role,
          status: "failed",
          detail: res.error ?? null,
        });
      }
    }

    for (const s of data.skipped) {
      outcomes.push({ name: s.name, role: s.role, status: "skipped" });
    }

    return {
      ok: true,
      sent,
      failed,
      skipped: data.skipped.length,
      outcomes,
    };
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      outcomes: [],
      error: err instanceof Error ? err.message : "Error desconocido.",
    };
  }
}
