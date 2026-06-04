import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";
import { getTelegramBotUrl, getTelegramBotUsername } from "@/lib/telegram/sendMessage";
import CapturaTelegramPanel, {
  type GroupRow,
  type MemberRow,
  type CaddieRow,
} from "./CapturaTelegramPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return [first, last].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ") ||
    "(sin nombre)";
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

  // Cliente admin para evitar problemas de RLS al leer entries/players.
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

  const roundId = roundIdParam || rounds[rounds.length - 1].id;
  const round = rounds.find((r) => r.id === roundId) ?? rounds[rounds.length - 1];

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time, notes")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });

  const groups = (groupsRaw ?? []) as Array<{
    id: string;
    group_no: number | null;
    starting_hole: number | null;
    tee_time: string | null;
    notes: string | null;
  }>;

  const groupIds = groups.map((g) => g.id);

  type MemberRaw = {
    id: string;
    group_id: string;
    position: number | null;
    entry_id: string | null;
    tournament_entries:
      | {
          id: string;
          player_number: number | null;
          players:
            | {
                id: string;
                first_name: string | null;
                last_name: string | null;
                telegram_user_id?: string | null;
                telegram_chat_id?: string | null;
              }
            | null;
        }
      | null;
  };
  let members: MemberRaw[] = [];

  if (groupIds.length > 0) {
    const { data: membersRaw } = await admin
      .from("pairing_group_members")
      .select(
        `
        id, group_id, position, entry_id,
        tournament_entries (
          id, player_number,
          players ( id, first_name, last_name, telegram_user_id, telegram_chat_id )
        )
      `
      )
      .in("group_id", groupIds)
      .order("position", { ascending: true });
    members = (membersRaw ?? []) as unknown as MemberRaw[];
  }

  // Caddies asignados al torneo + ronda + grupo
  type CaddieAssignRow = {
    id: string;
    pairing_group_id: string | null;
    entry_id: string | null;
    caddie_id: string | null;
    is_active: boolean | null;
    role: string | null;
  };
  let assignments: CaddieAssignRow[] = [];
  if (groupIds.length > 0) {
    const { data: assignsRaw } = await admin
      .from("caddie_assignments")
      .select("id, pairing_group_id, entry_id, caddie_id, is_active, role")
      .eq("tournament_id", tournamentId)
      .or(`round_id.eq.${round.id},round_id.is.null`);
    // Emparejamos por entry_id (no por pairing_group_id): las asignaciones
    // suelen guardarse sin pairing_group_id, así que filtrar por él las perdía.
    assignments = ((assignsRaw ?? []) as CaddieAssignRow[]).filter(
      (a) => a.is_active !== false && a.entry_id
    );
  }

  // Cargar caddies referenciados con telegram_user_id si la columna existe
  const caddieIds = Array.from(
    new Set(
      assignments
        .map((a) => a.caddie_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  type CaddieMini = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    telegram?: string | null;
    telegram_username?: string | null;
  };
  const caddieMap = new Map<string, CaddieMini>();
  if (caddieIds.length > 0) {
    // El ID numérico de Telegram del caddie se guarda en la columna `telegram`.
    const { data: caddiesRaw } = await admin
      .from("caddies")
      .select("id, first_name, last_name, telegram, telegram_username")
      .in("id", caddieIds);
    for (const c of (caddiesRaw ?? []) as CaddieMini[]) {
      caddieMap.set(c.id, c);
    }
  }

  // Caddie por inscrito (entry) para mostrarlo junto a cada jugador.
  function caddieTelegramLinked(c: CaddieMini): boolean {
    return /^\d+$/.test(String(c.telegram ?? "").trim());
  }
  const caddieByEntry = new Map<string, { name: string; linked: boolean }>();
  for (const a of assignments) {
    if (!a.entry_id || !a.caddie_id) continue;
    if (caddieByEntry.has(a.entry_id)) continue;
    const c = caddieMap.get(a.caddie_id);
    if (!c) continue;
    caddieByEntry.set(a.entry_id, {
      name: fullName(c.first_name, c.last_name),
      linked: caddieTelegramLinked(c),
    });
  }

  // Dejamos que buildGroupCaptureUrl resuelva la base: ignora localhost en server
  // y cae a VERCEL_PROJECT_PRODUCTION_URL / www.listgolf.club si NEXT_PUBLIC_APP_URL apunta a localhost.

  const groupRows: GroupRow[] = groups.map((g) => {
    const gMembers = members.filter((m) => m.group_id === g.id);
    const memberRows: MemberRow[] = gMembers.map((m) => {
      const entry = Array.isArray(m.tournament_entries)
        ? m.tournament_entries[0]
        : m.tournament_entries;
      const player = entry?.players
        ? Array.isArray(entry.players)
          ? entry.players[0]
          : entry.players
        : null;
      const caddie = m.entry_id ? caddieByEntry.get(m.entry_id) ?? null : null;
      return {
        id: m.id,
        position: m.position,
        playerNumber: entry?.player_number ?? null,
        playerName: fullName(player?.first_name, player?.last_name),
        telegramLinked: Boolean(
          (player?.telegram_chat_id ?? player?.telegram_user_id ?? "").toString().trim()
        ),
        caddieName: caddie?.name ?? null,
        caddieTelegramLinked: caddie?.linked ?? false,
      };
    });

    // Caddies del grupo: por los entry_id de sus integrantes (no por
    // pairing_group_id, que muchas asignaciones no traen).
    const groupEntryIds = new Set(
      gMembers.map((m) => m.entry_id).filter((id): id is string => Boolean(id))
    );
    const gAssigns = assignments.filter(
      (a) => a.entry_id && groupEntryIds.has(a.entry_id)
    );
    const caddieRowsForGroup: CaddieRow[] = gAssigns
      .map((a): CaddieRow | null => {
        if (!a.caddie_id) return null;
        const c = caddieMap.get(a.caddie_id);
        if (!c) return null;
        return {
          id: c.id,
          name: fullName(c.first_name, c.last_name),
          telegramLinked: caddieTelegramLinked(c),
          role: a.role ?? null,
        };
      })
      .filter((x): x is CaddieRow => x !== null);

    // Dedupe caddies por id (un caddie puede estar listado dos veces si tiene varias asignaciones)
    const seen = new Set<string>();
    const uniqCaddies = caddieRowsForGroup.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const captureUrl = buildGroupCaptureUrl({
      tournamentId,
      roundId: round.id,
      groupId: g.id,
    });

    return {
      id: g.id,
      groupNo: g.group_no,
      startingHole: g.starting_hole,
      teeTime: g.tee_time,
      notes: g.notes ?? null,
      members: memberRows,
      caddies: uniqCaddies,
      captureUrl,
    };
  });

  // Estadísticas
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
              {tournament.name} · {tNav.teeSheet}: {t.pickRound} #{round.round_no ?? "?"}
            </p>
          ) : null}
        </div>

        <form
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
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

      {/* Stats */}
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

      {/* Legend */}
      <section className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-medium">{t.legendTitle}</div>
        <div className="mt-1 text-xs">{t.legendBody}</div>
      </section>

      {groupRows.length === 0 ? (
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.noGroups}
        </p>
      ) : (
        <CapturaTelegramPanel
          tournamentId={tournamentId}
          roundId={round.id}
          groups={groupRows}
        />
      )}
    </div>
  );
}
