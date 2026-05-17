import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import HeaderBar from "@/components/ui/HeaderBar";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import TelegramKitContentEditor from "./TelegramKitContentEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_GREETING = "Hola {player_name},";
const DEFAULT_BODY =
  "Tu kit del torneo «{tournament_name}»:\n\n• Estás inscrito y vinculado a List.golf por Telegram.\n• Tras confirmar el kit, escribe GRUPO o INICIO para ver tu salida y enlace de captura.\n• Mantén activas las notificaciones de este chat.";
const DEFAULT_FOOTER =
  "Cuando hayas recibido el kit:\n• RECIBIDO — recibí todo\n• RECIBIDO PARCIAL — recibí algo pero aún me falta material del comité";

export default async function TelegramKitContentPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = await getLocale();
  const t = messages[locale].entries.telegramKitContent;

  const tournamentId =
    typeof params.tournament_id === "string" ? params.tournament_id.trim() : "";

  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .order("created_at", { ascending: false });

  const list = tournaments ?? [];

  if (!tournamentId && list[0]?.id) {
    redirect(
      `/entries/telegram-kit-content?tournament_id=${encodeURIComponent(list[0].id)}`
    );
  }

  if (!tournamentId) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 text-black">
        <HeaderBar title={t.title} />
        <p className="text-sm text-gray-600">{t.noTournaments}</p>
      </main>
    );
  }

  await requireTournamentAccess({
    tournamentId,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
      "entries_operator",
    ],
  });

  const tournament = list.find((x) => x.id === tournamentId);
  const { data: contentRow } = await supabase
    .from("tournament_telegram_kit_content")
    .select("greeting_line, body_lines, footer_line")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const saved = params.saved === "1";
  const errMsg =
    typeof params.err === "string" && params.err.trim() ? params.err.trim() : "";

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 text-black">
      <HeaderBar title={t.title} />

      <Link href="/entries" className="text-sm text-blue-700 underline">
        {t.backEntries}
      </Link>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-white p-3"
      >
        <label className="text-xs font-medium text-gray-700">
          {t.tournament}
          <select
            name="tournament_id"
            defaultValue={tournamentId}
            className="mt-1 block min-w-[220px] rounded border border-gray-300 px-2 py-1.5 text-sm text-black"
          >
            {list.map((tor) => (
              <option key={tor.id} value={tor.id}>
                {tor.name ?? tor.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-gray-500 bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white"
        >
          {t.loadTournament}
        </button>
      </form>

      <p className="text-sm text-gray-700">
        {t.editing}: <strong>{tournament?.name ?? tournamentId}</strong>
      </p>

      {saved ? (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          {t.saved}
        </p>
      ) : null}
      {errMsg ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {errMsg}
        </p>
      ) : null}

      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <TelegramKitContentEditor
          tournamentId={tournamentId}
          greetingLine={contentRow?.greeting_line ?? DEFAULT_GREETING}
          bodyLines={contentRow?.body_lines ?? DEFAULT_BODY}
          footerLine={contentRow?.footer_line ?? DEFAULT_FOOTER}
          labels={{
            greeting: t.greeting,
            body: t.body,
            footer: t.footer,
            placeholders: t.placeholders,
            save: t.save,
          }}
        />
      </section>
    </main>
  );
}
