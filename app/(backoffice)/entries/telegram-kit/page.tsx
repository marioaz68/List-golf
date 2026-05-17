import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import HeaderBar from "@/components/ui/HeaderBar";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { isMissingTelegramKitColumnsError } from "@/lib/entries/telegramKitColumns";
import { getTelegramBotUrl, getTelegramBotUsername } from "@/lib/telegram/sendMessage";
import TelegramKitPanel, {
  type TelegramPendingLinkRow,
} from "./TelegramKitPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerNested = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
};

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export default async function TelegramKitPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = await getLocale();
  const tk = messages[locale].entries.telegramKit;

  const tournamentId =
    typeof params.tournament_id === "string" ? params.tournament_id.trim() : "";
  const playerId =
    typeof params.player_id === "string" ? params.player_id.trim() : "";

  if (!tournamentId || !playerId) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4 text-black">
        <HeaderBar title={tk.title} />
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {tk.missingParams}
        </p>
        <Link href="/entries" className="text-sm text-blue-700 underline">
          {tk.backToEntries}
        </Link>
      </main>
    );
  }

  await requireTournamentAccess({
    tournamentId,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
      "checkin",
      "score_capture",
      "entries_operator",
      "caddie_manager",
    ],
  });

  const supabase = await createClient();

  const { data: tournamentRow, error: tErr } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr || !tournamentRow) {
    redirect("/entries");
  }

  const entrySelectWithKit = `
      id,
      telegram_kit_sent_at,
      telegram_kit_received_at,
      telegram_kit_partial_received_at,
      telegram_kit_pending_items,
      players:players (
        id,
        first_name,
        last_name,
        telegram_user_id,
        telegram_chat_id
      )
    `;

  const entrySelectBase = `
      id,
      players:players (
        id,
        first_name,
        last_name,
        telegram_user_id,
        telegram_chat_id
      )
    `;

  let kitTrackingAvailable = true;

  let entryRes = await supabase
    .from("tournament_entries")
    .select(entrySelectWithKit)
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (entryRes.error && isMissingTelegramKitColumnsError(entryRes.error)) {
    kitTrackingAvailable = false;
    entryRes = await supabase
      .from("tournament_entries")
      .select(entrySelectBase)
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .maybeSingle();
  }

  const { data: entryRow, error: eErr } = entryRes;

  if (eErr || !entryRow?.id) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4 text-black">
        <HeaderBar title={tk.title} />
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {tk.notEnrolled}
        </p>
        <Link
          href={`/entries?tournament_id=${encodeURIComponent(tournamentId)}&tab=entries`}
          className="text-sm text-blue-700 underline"
        >
          {tk.backToEntries}
        </Link>
      </main>
    );
  }

  const player = oneOrNull(entryRow.players as PlayerNested | PlayerNested[] | null);
  if (!player || player.id !== playerId) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4 text-black">
        <HeaderBar title={tk.title} />
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {tk.notEnrolled}
        </p>
        <Link
          href={`/entries?tournament_id=${encodeURIComponent(tournamentId)}&tab=entries`}
          className="text-sm text-blue-700 underline"
        >
          {tk.backToEntries}
        </Link>
      </main>
    );
  }

  const playerName =
    `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "—";
  const tournamentName = tournamentRow.name?.trim() || "—";

  const savedFlag =
    typeof params.saved === "string" ? params.saved === "1" : false;
  const verifiedFlag =
    typeof params.verified === "string" ? params.verified === "1" : false;
  const kitSentFlag =
    typeof params.kit_sent === "string" ? params.kit_sent === "1" : false;
  const errMsg =
    typeof params.err === "string" && params.err.trim() ? params.err.trim() : "";

  const botUser = getTelegramBotUsername();
  const botUrl = getTelegramBotUrl();
  const linked = Boolean(player.telegram_user_id?.trim());

  const kitSentAt =
    typeof entryRow.telegram_kit_sent_at === "string"
      ? entryRow.telegram_kit_sent_at
      : null;
  const kitReceivedAt =
    typeof entryRow.telegram_kit_received_at === "string"
      ? entryRow.telegram_kit_received_at
      : null;
  const kitPartialAt =
    typeof entryRow.telegram_kit_partial_received_at === "string"
      ? entryRow.telegram_kit_partial_received_at
      : null;
  const kitPendingItems =
    typeof entryRow.telegram_kit_pending_items === "string"
      ? entryRow.telegram_kit_pending_items
      : null;

  const kitColumnsMissing = !kitTrackingAvailable;

  let pendingLinks: TelegramPendingLinkRow[] = [];
  try {
    const admin = await createAdminClient();
    const { data: pendingRows } = await admin
      .from("telegram_pending_links")
      .select(
        "telegram_user_id, telegram_chat_id, first_name, last_name, username, last_seen_at"
      )
      .order("last_seen_at", { ascending: false })
      .limit(25);
    pendingLinks = (pendingRows ?? []) as TelegramPendingLinkRow[];
  } catch {
    pendingLinks = [];
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 text-black">
      <HeaderBar title={tk.title} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/entries?tournament_id=${encodeURIComponent(tournamentId)}&tab=entries`}
          className="text-blue-700 underline"
        >
          {tk.backToEntries}
        </Link>
      </div>

      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-semibold text-gray-700">{tk.tournamentLabel}: </span>
            <span>{tournamentName}</span>
          </div>
          <div className="mt-1">
            <span className="font-semibold text-gray-700">{tk.playerLabel}: </span>
            <span>{playerName}</span>
          </div>
        </div>

        {savedFlag ? (
          <p className="mt-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
            {tk.saved}
          </p>
        ) : null}

        {verifiedFlag ? (
          <p className="mt-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
            {tk.verified}
          </p>
        ) : null}

        {kitSentFlag ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {tk.kitSent}
          </p>
        ) : null}

        {errMsg ? (
          <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {errMsg}
          </p>
        ) : null}

        {kitColumnsMissing ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Falta migración en Supabase: columnas telegram_kit_sent_at y
            telegram_kit_received_at en tournament_entries. El vínculo Telegram
            funciona; envío/confirmación de kit requiere ejecutar la migración.
          </p>
        ) : null}
      </section>

      <TelegramKitPanel
        tk={tk}
        tournamentId={tournamentId}
        playerId={playerId}
        playerName={playerName}
        tournamentName={tournamentName}
        botUser={botUser}
        botUrl={botUrl}
        linked={linked}
        telegramUserId={player.telegram_user_id?.trim() ?? ""}
        telegramChatId={player.telegram_chat_id?.trim() ?? ""}
        kitSentAt={kitSentAt}
        kitReceivedAt={kitReceivedAt}
        kitPartialAt={kitPartialAt}
        kitPendingItems={kitPendingItems}
        pendingLinks={pendingLinks}
      />
    </main>
  );
}
