import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAndTrackTelegramMessage } from "@/lib/telegram/outbox";
import { buildMarshalMiniAppUrl } from "@/lib/marshal/marshalMiniAppUrl";
import { listMarshalsForTournament } from "@/lib/marshal/resolveMarshal";

export type MarshalDayNotifyResult = {
  sent: number;
  failed: number;
  skipped: number;
};

function buildDayStartText(args: {
  marshalName: string;
  tournamentName: string;
  roundNo: number | null;
  roundDate: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Buenos días ${args.marshalName},`);
  lines.push("");
  lines.push("⛳ Hoy hay torneo en el club.");
  lines.push(`Torneo: ${args.tournamentName}`);
  if (args.roundNo != null) lines.push(`Ronda: R${args.roundNo}`);
  if (args.roundDate) lines.push(`Fecha: ${args.roundDate}`);
  lines.push("");
  lines.push(
    "Abre el panel marshal para ver capturas retrasadas, ritmo del campo y resultados en vivo:"
  );
  return lines.join("\n");
}

/** Avisa a marshals del torneo que hoy arranca la ronda (mini app marshal). */
export async function notifyMarshalsRoundDayStart(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundId: string;
    roundNo?: number | null;
    roundDate?: string | null;
    tournamentName?: string | null;
  }
): Promise<MarshalDayNotifyResult> {
  const result: MarshalDayNotifyResult = { sent: 0, failed: 0, skipped: 0 };
  const tournamentId = String(args.tournamentId ?? "").trim();
  const roundId = String(args.roundId ?? "").trim();
  if (!tournamentId || !roundId) return result;

  let tournamentName = String(args.tournamentName ?? "").trim();
  let roundNo = args.roundNo ?? null;
  let roundDate = args.roundDate ?? null;

  if (!tournamentName || roundNo == null || !roundDate) {
    const [{ data: t }, { data: r }] = await Promise.all([
      admin.from("tournaments").select("name").eq("id", tournamentId).maybeSingle(),
      admin.from("rounds").select("round_no, round_date").eq("id", roundId).maybeSingle(),
    ]);
    if (!tournamentName) {
      tournamentName = String(t?.name ?? "").trim() || "Torneo";
    }
    if (roundNo == null && typeof r?.round_no === "number") roundNo = r.round_no;
    if (!roundDate) roundDate = r?.round_date ?? null;
  }

  const marshals = await listMarshalsForTournament(admin, tournamentId);
  if (marshals.length === 0) return result;

  for (const m of marshals) {
    const url = buildMarshalMiniAppUrl({
      telegramChatId: m.chatId,
      tournamentId,
    });
    const res = await sendAndTrackTelegramMessage(admin, {
      tournamentId,
      chatId: m.chatId,
      text: buildDayStartText({
        marshalName: m.name,
        tournamentName,
        roundNo,
        roundDate,
      }),
      buttons: [[{ text: "📋 Panel marshal", url }]],
      disablePreview: true,
      kind: "marshal_day_start",
      roundId,
    });
    if (res.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}
