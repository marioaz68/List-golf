import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { PublicLanguageToggle } from "@/components/i18n/PublicLanguageToggle";

type SearchParams = Promise<{
  club?: string | string[];
  city?: string | string[];
  scope?: string | string[];
  status?: string | string[];
}>;

type TournamentRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  poster_path: string | null;
  club_id: string | null;
  course_id: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type CourseCityRow = {
  id: string;
  city: string | null;
  state: string | null;
};

type TournamentCard = TournamentRow & {
  club_label: string | null;
  course_city: string | null;
};

const CITY_NONE = "__none__";
const ACTIVE_WINDOW_DAYS = 28;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function decodeCityParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const spaced = trimmed.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function parseLocalNoon(dateStr: string): Date {
  const s = dateStr.trim().slice(0, 10);
  return new Date(`${s}T12:00:00`);
}

function todayNoon(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isStarted(row: TournamentRow, today: Date): boolean {
  if (!row.start_date?.trim()) return false;
  return parseLocalNoon(row.start_date) <= today;
}

function isFinished(row: TournamentRow, today: Date): boolean {
  if (!row.start_date?.trim()) return false;
  if (row.end_date?.trim()) {
    return parseLocalNoon(row.end_date) < today;
  }
  const last = addDays(parseLocalNoon(row.start_date), ACTIVE_WINDOW_DAYS);
  return last < today;
}

function isFuture(row: TournamentRow, today: Date): boolean {
  if (!row.start_date?.trim()) return false;
  return parseLocalNoon(row.start_date) > today;
}

function isActive(row: TournamentRow, today: Date): boolean {
  return isStarted(row, today) && !isFinished(row, today);
}

function isHistoric(row: TournamentRow, today: Date): boolean {
  return isFinished(row, today);
}

function matchesScope(row: TournamentRow, scope: string, today: Date): boolean {
  if (!scope) return true;
  if (scope === "active") return isActive(row, today);
  if (scope === "future") return isFuture(row, today);
  if (scope === "historic") return isHistoric(row, today);
  return true;
}

function formatDate(date: string | null, locale: "es" | "en") {
  if (!date) {
    return locale === "en" ? "Date TBD" : "Fecha por definir";
  }

  return new Date(date).toLocaleDateString(locale === "en" ? "en-US" : "es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildPosterUrl(posterPath: string | null) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!posterPath || !baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/tournament-posters/${posterPath}`;
}

function cardStatus(
  row: TournamentRow,
  today: Date,
  copy: (typeof messages)["es"]["publicHome"]
) {
  if (!row.start_date?.trim()) {
    return {
      label: copy.statusTbd,
      className: "bg-slate-600 text-white",
    };
  }

  if (isFuture(row, today)) {
    return {
      label: copy.statusUpcoming,
      className: "bg-cyan-400 text-[#08111f]",
    };
  }

  if (isActive(row, today)) {
    return {
      label: copy.statusActive,
      className: "bg-emerald-500 text-white",
    };
  }

  return {
    label: copy.statusHistoric,
    className: "bg-slate-600 text-white",
  };
}

const selectFieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-white/10 bg-[#0c1728] px-3 py-2 text-sm text-white";

function PublicHomeLoadError({
  h,
  detailMessage,
}: {
  h: (typeof messages)["es"]["publicHome"];
  detailMessage: string;
}) {
  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      <section className="border-b border-white/10 bg-[#08111f]">
        <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-5">
          <h1 className="text-lg font-semibold text-white sm:text-xl">
            {h.loadErrorTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">{h.loadErrorBody}</p>
          <details className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
            <summary className="cursor-pointer text-sm font-semibold text-cyan-300">
              {h.loadErrorTechnical}
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-400">
              {detailMessage}
            </pre>
          </details>
        </div>
      </section>
    </main>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = await getLocale();
  const h = messages[locale].publicHome;

  const params = await searchParams;
  const selectedClub = firstValue(params.club).trim();
  const selectedCityRaw = firstValue(params.city).trim();
  const selectedCity = decodeCityParam(selectedCityRaw);

  const scopeParam = firstValue(params.scope).trim();
  const legacyStatus = firstValue(params.status).trim();
  const selectedScope =
    scopeParam ||
    (legacyStatus === "upcoming"
      ? "future"
      : legacyStatus === "finished"
        ? "historic"
        : "");

  const supabase = await createClient();

  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id,name,start_date,end_date,poster_path,club_id,course_id")
    .eq("is_public", true)
    .eq("is_archived", false);

  if (tournamentsError) {
    return (
      <PublicHomeLoadError h={h} detailMessage={tournamentsError.message} />
    );
  }

  const tournamentRows = (tournamentsData ?? []) as TournamentRow[];

  const clubIds = Array.from(
    new Set(
      tournamentRows
        .map((item) => item.club_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const courseIds = Array.from(
    new Set(
      tournamentRows
        .map((item) => item.course_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let clubsMap = new Map<string, ClubRow>();
  let coursesMap = new Map<string, CourseCityRow>();

  if (clubIds.length > 0) {
    const { data: clubsData, error: clubsError } = await supabase
      .from("clubs")
      .select("id,name,short_name")
      .in("id", clubIds);

    if (clubsError) {
      return <PublicHomeLoadError h={h} detailMessage={clubsError.message} />;
    }

    clubsMap = new Map(
      ((clubsData ?? []) as ClubRow[]).map((clubItem) => [
        clubItem.id,
        clubItem,
      ])
    );
  }

  if (courseIds.length > 0) {
    const { data: coursesData, error: coursesError } = await supabase
      .from("courses")
      .select("id,city,state")
      .in("id", courseIds);

    if (coursesError) {
      return <PublicHomeLoadError h={h} detailMessage={coursesError.message} />;
    }

    coursesMap = new Map(
      ((coursesData ?? []) as CourseCityRow[]).map((c) => [c.id, c])
    );
  }

  const allTournaments: TournamentCard[] = tournamentRows.map((item) => {
    const clubRow = item.club_id ? clubsMap.get(item.club_id) : null;
    const courseRow = item.course_id ? coursesMap.get(item.course_id) : null;
    const city = courseRow?.city?.trim() || null;

    return {
      ...item,
      club_label:
        clubRow?.short_name?.trim() || clubRow?.name?.trim() || null,
      course_city: city,
    };
  });

  const today = todayNoon();

  const tournaments = allTournaments
    .filter((item) => {
      if (selectedClub && item.club_id !== selectedClub) return false;
      if (!matchesScope(item, selectedScope, today)) return false;

      if (selectedCity) {
        if (selectedCity === CITY_NONE) {
          if (item.course_city) return false;
        } else if (item.course_city !== selectedCity) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const aHasPoster = a.poster_path ? 1 : 0;
      const bHasPoster = b.poster_path ? 1 : 0;

      if (aHasPoster !== bHasPoster) {
        return bHasPoster - aHasPoster;
      }

      const aTime = a.start_date
        ? new Date(a.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date
        ? new Date(b.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    });

  const availableClubs = Array.from(
    new Map(
      allTournaments
        .map((item) => {
          if (!item.club_id || !item.club_label) return null;

          return [
            item.club_id,
            {
              id: item.club_id,
              label: item.club_label,
            },
          ] as const;
        })
        .filter(Boolean) as [string, { id: string; label: string }][]
    ).values()
  ).sort((a, b) =>
    a.label.localeCompare(b.label, locale === "en" ? "en" : "es", {
      sensitivity: "base",
    })
  );

  const cityKeys = new Set<string>();
  for (const t of allTournaments) {
    if (t.course_city) cityKeys.add(t.course_city);
  }

  const availableCities = [
    ...Array.from(cityKeys).sort((a, b) =>
      a.localeCompare(b, locale === "en" ? "en" : "es", {
        sensitivity: "base",
      })
    ),
  ];

  const hasUnknownCity = allTournaments.some((t) => !t.course_city);

  const countLabel =
    tournaments.length === 0
      ? h.countNone
      : tournaments.length === 1
        ? h.countOne
        : h.countMany.replace("{n}", String(tournaments.length));

  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      <section className="border-b border-white/10 bg-[#08111f]">
        <div className="mx-auto max-w-[1700px] px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                {h.title}
              </h1>
              <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
                {h.subtitle}
              </p>
              <p className="mt-2 max-w-3xl text-[11px] leading-snug text-slate-500 sm:text-xs">
                {h.scopeHint}
              </p>
            </div>
            <div className="flex shrink-0 justify-end sm:pt-0.5">
              <PublicLanguageToggle locale={locale} />
            </div>
          </div>

          <form
            method="GET"
            action="/"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4 sm:py-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {h.labelScope}
                </span>
                <select
                  name="scope"
                  defaultValue={selectedScope}
                  className={selectFieldClass}
                >
                  <option value="">{h.scopeAll}</option>
                  <option value="active">{h.scopeActive}</option>
                  <option value="future">{h.scopeFuture}</option>
                  <option value="historic">{h.scopeHistoric}</option>
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {h.labelCity}
                </span>
                <select
                  name="city"
                  defaultValue={selectedCityRaw}
                  className={selectFieldClass}
                >
                  <option value="">{h.cityAll}</option>
                  {hasUnknownCity ? (
                    <option value={encodeURIComponent(CITY_NONE)}>
                      {h.cityUnknown}
                    </option>
                  ) : null}
                  {availableCities.map((city) => (
                    <option
                      key={city}
                      value={encodeURIComponent(city)}
                    >
                      {city}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {h.labelClub}
                </span>
                <select
                  name="club"
                  defaultValue={selectedClub}
                  className={selectFieldClass}
                >
                  <option value="">{h.clubAll}</option>
                  {availableClubs.map((clubItem) => (
                    <option key={clubItem.id} value={clubItem.id}>
                      {clubItem.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-[#08111f] transition hover:bg-cyan-300 sm:w-auto sm:min-w-[8.5rem]"
                >
                  {h.apply}
                </button>
                <Link
                  href="/"
                  className="flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 px-4 text-sm transition hover:border-cyan-400/40 hover:bg-white/5 sm:w-auto sm:min-w-[8.5rem]"
                >
                  {h.clear}
                </Link>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-semibold sm:text-left">
                {countLabel}
              </div>
            </div>
          </form>
        </div>
      </section>

      <section id="torneos" className="scroll-mt-4 bg-[#0b1526]">
        <div className="mx-auto max-w-[1700px] px-4 py-5 sm:px-5">
          {tournaments.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-slate-300">
              {h.empty}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {tournaments.map((t) => {
                const posterUrl = buildPosterUrl(t.poster_path);
                const status = cardStatus(t, today, h);
                const cityLine = t.course_city ?? h.cityUnknown;
                const posterAlt =
                  locale === "en"
                    ? `Tournament poster — ${t.name ?? "Untitled"}`
                    : `Poster del torneo — ${t.name ?? "Sin nombre"}`;

                return (
                  <Link
                    key={t.id}
                    href={`/torneos/${t.id}`}
                    className="group block overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-cyan-400/40"
                  >
                    <div className="relative h-[220px] bg-black">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={posterAlt}
                          className="absolute inset-0 h-full w-full bg-black object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
                          {h.noPoster}
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-2.5">
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-300">
                              {t.club_label ?? h.noClub}
                            </div>
                            <div className="mt-0.5 truncate text-[9px] text-slate-400">
                              {cityLine}
                            </div>
                            <div className="mt-1 truncate text-xs font-semibold text-white">
                              {t.name ?? (locale === "en" ? "Tournament" : "Torneo")}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-300">
                              {formatDate(t.start_date, locale)}
                            </div>
                          </div>

                          <div
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${status.className}`}
                          >
                            {status.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
