import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getTelegramBotUrl, getTelegramBotUsername } from "@/lib/telegram/sendMessage";
import CapturaTelegramPanel from "./CapturaTelegramPanel";
import { resolveDefaultSalidasRoundId } from "@/lib/rounds/resolveDefaultSalidasRound";
import {
  loadCapturaGroupRows,
  loadSameDayConsolationMpGroups,
  type CapturaGroupRow,
} from "@/lib/salidas/loadCapturaGroupRows";
import { CONSOLATION_NOTES_PREFIX } from "@/lib/matchplay/consolationMatchPlay";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isConsolationMpNotes(notes: string | null | undefined): boolean {
  return String(notes ?? "")
    .trim()
    .toUpperCase()
    .startsWith(CONSOLATION_NOTES_PREFIX.trim().toUpperCase());
}

export default async function CapturaTelegramPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId = s(sp.tournament_id);
  const roundIdParam = s(sp.round_id);
  const locale = await getLocale();
  const t = messages[locale].capturaTelegram;
  const tNav = messages[locale].sidebar.nav;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const roles = await getUserRoles(supabase, user!.id);
  if (!canAccessModule(roles, "captura-telegram")) {
    return (
      <div className="p-6 text-sm text-red-700">
        No tienes acceso a este módulo.
      </div>
    );
  }

  if (!tournamentId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{t.subtitle}</p>
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.noTournament}
        </p>
        <Link
          href="/tournaments"
          className="mt-4 inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {tNav.tournaments}
        </Link>
      </div>
    );
  }

  const admin = tryCreateAdminClient() ?? supabase;

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();

  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, start_type")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });

  const rounds = (roundsRaw ?? []) as Array<{
    id: string;
    round_no: number | null;
    round_date: string | null;
    start_type: string | null;
  }>;

  if (rounds.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {tournament?.name ? `${tournament.name} · ` : ""}
          {t.subtitle}
        </p>
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.noRound}
        </p>
      </div>
    );
  }

  const roundId =
    (await resolveDefaultSalidasRoundId(admin, rounds, roundIdParam)) ??
    rounds[0]?.id ??
    "";
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no, starting_hole, tee_time, notes")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });

  const mainGroups = (groupsRaw ?? []) as Array<{
    id: string;
    round_id: string;
    group_no: number | null;
    starting_hole: number | null;
    tee_time: string | null;
    notes: string | null;
  }>;

  const extraConsolGroups = await loadSameDayConsolationMpGroups(admin, {
    tournamentId,
    roundDate: round.round_date,
    excludeRoundId: round.id,
  });

  const allGroupsRaw = [...mainGroups, ...extraConsolGroups];
  const assignmentRoundIds = Array.from(
    new Set(allGroupsRaw.map((g) => g.round_id))
  );

  const groupRows: CapturaGroupRow[] = await loadCapturaGroupRows(admin, {
    tournamentId,
    groups: allGroupsRaw,
    assignmentRoundIds,
  });

  groupRows.sort((a, b) => {
    const ta = a.teeTime ?? "";
    const tb = b.teeTime ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.groupNo ?? 0) - (b.groupNo ?? 0);
  });

  const mainGroupRows = groupRows.filter((g) => !isConsolationMpNotes(g.notes));
  const consolGroupRows = groupRows.filter((g) => isConsolationMpNotes(g.notes));

  const totalPlayers = groupRows.reduce((acc, g) => acc + g.members.length, 0);
  const linkedPlayers = groupRows.reduce(
    (acc, g) => acc + g.members.filter((m) => m.telegramLinked).length,
    0
  );
  const totalCaddies = groupRows.reduce((acc, g) => acc + g.caddies.length, 0);
  const linkedCaddies = groupRows.reduce(
    (acc, g) => acc + g.caddies.filter((c) => c.telegramLinked).length,
    0
  );

  return (
    <div className="p-4 sm:p-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.subtitle}</p>
          {tournament?.name ? (
            <p className="mt-1 text-xs text-slate-500">
              {tournament.name} · {tNav.teeSheet}: {t.pickRound} #
              {round.round_no ?? "?"}
              {round.round_date ? ` · ${round.round_date}` : ""}
            </p>
          ) : null}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <label className="flex flex-col text-xs text-slate-600">
            <span className="mb-0.5">{t.pickRound}</span>
            <select
              name="round_id"
              defaultValue={round.id}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  R{r.round_no ?? "?"} · {r.round_date ?? ""} · {r.start_type ?? ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            ↻
          </button>
        </form>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            {t.statGroups}
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {groupRows.length}
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            {t.statPlayersLinked}
          </div>
          <div className="text-2xl font-semibold text-emerald-700">
            {linkedPlayers}
            <span className="ml-1 text-sm font-normal text-slate-500">
              / {totalPlayers}
            </span>
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            {t.statCaddiesLinked}
          </div>
          <div className="text-2xl font-semibold text-sky-700">
            {linkedCaddies}
            <span className="ml-1 text-sm font-normal text-slate-500">
              / {totalCaddies}
            </span>
          </div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Bot
          </div>
          <div className="text-sm text-slate-700">
            {getTelegramBotUsername() ? (
              <a
                href={getTelegramBotUrl() ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline"
              >
                @{getTelegramBotUsername()}
              </a>
            ) : (
              <span className="text-amber-700">Sin bot configurado</span>
            )}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-medium">{t.legendTitle}</div>
        <div className="mt-1 text-xs">{t.legendBody}</div>
        {consolGroupRows.length > 0 ? (
          <div className="mt-2 text-xs text-violet-800">
            También se muestran salidas de{" "}
            <strong>Consolación Match Play</strong> del mismo día (aunque estén
            en otra ronda del calendario).
          </div>
        ) : null}
      </section>

      {groupRows.length === 0 ? (
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.noGroups}
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {mainGroupRows.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">
                Cuadro principal · R{round.round_no ?? "?"}
              </h2>
              <CapturaTelegramPanel
                tournamentId={tournamentId}
                groups={mainGroupRows}
              />
            </section>
          ) : null}
          {consolGroupRows.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-violet-900">
                Consolación Match Play
              </h2>
              <CapturaTelegramPanel
                tournamentId={tournamentId}
                groups={consolGroupRows}
              />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
