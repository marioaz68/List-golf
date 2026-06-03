import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { togglePublic, toggleArchive, deleteTournament } from "./actions";
import DeleteTournamentButton from "./DeleteTournamentButton";
import PosterUploadInline from "./PosterUploadInline";
import SubmitButton from "@/components/ui/SubmitButton";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import {
  backofficeTableStickyScrollRounded,
  cardStyleAllowTableSticky,
  thStyleWithSticky,
} from "@/lib/ui/backofficeTableSticky";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  status: string | null;
  created_at: string | null;
  start_date: string | null;
  course_name: string | null;
  club_name: string | null;
  is_public: boolean | null;
  is_archived: boolean | null;
  poster_path: string | null;
};

type CourseRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type CountRow = {
  id?: string;
  tournament_id: string;
};

const pageWrap: React.CSSProperties = {
  padding: "clamp(10px, 2.5vw, 16px) clamp(12px, 3vw, 20px)",
  display: "grid",
  gap: 12,
  maxWidth: "100%",
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const tableCardStyle = cardStyleAllowTableSticky(cardStyle);

const cardHeader: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: 0,
  color: "#0f172a",
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  margin: "2px 0 0 0",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle = thStyleWithSticky({
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 11,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#334155",
  whiteSpace: "nowrap",
});

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
};

const buttonStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #1f2937",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const ghostButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const scoreButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  height: 28,
  padding: "0 10px",
  fontSize: 11,
};

const publicButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #0ea5e9",
  borderRadius: 8,
  background: "#eff6ff",
  color: "#075985",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const auctionButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #c2410c",
  borderRadius: 8,
  background: "#fff7ed",
  color: "#9a3412",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const miniActionButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const inlineFormStyle: React.CSSProperties = {
  display: "inline-flex",
  margin: 0,
};

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "nowrap",
  whiteSpace: "nowrap",
};

const actionCellStyle: React.CSSProperties = {
  ...tdStyle,
  whiteSpace: "nowrap",
  minWidth: 580,
};

const nameLinkStyle: React.CSSProperties = {
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 700,
  display: "inline-block",
  lineHeight: 1.25,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  minWidth: 0,
};

const filtersFormStyle: React.CSSProperties = {
  padding: "10px 12px",
  display: "grid",
  gap: 10,
  maxWidth: "100%",
  boxSizing: "border-box",
};

/** Fila única que envuelve en móvil sin columnas microscópicas (evita el grid 12-col). */
const filtersRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 10px",
  alignItems: "flex-end",
  maxWidth: "100%",
};

const clubFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  flex: "1 1 12rem",
  minWidth: 0,
  maxWidth: "min(100%, 22rem)",
};

const dateFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  flex: "0 1 9.25rem",
  width: "min(100%, 9.25rem)",
  minWidth: "min(100%, 8.5rem)",
  maxWidth: "100%",
};

const dateInputStyle: React.CSSProperties = {
  ...fieldStyle,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

const buttonGroupWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  flex: "0 1 auto",
  minWidth: 0,
  marginLeft: "auto",
};

const filtersNoteStyle: React.CSSProperties = {
  padding: "0 12px 12px",
  fontSize: 12,
  color: "#475569",
  lineHeight: 1.45,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

/** Compacta solo en viewport estrecho; los inline styles del form ganan sin esto. */
const tournamentsFilterExtraCss = `
#tournaments-list-filters .tournaments-date-range {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 22px;
  flex: 0 1 auto;
  min-width: 0;
  box-sizing: border-box;
}
@media (min-width: 768px) {
  #tournaments-list-filters .tournaments-date-range {
    gap: 12px 30px;
  }
}
@media (max-width: 767px) {
  #tournaments-list-filters .tournaments-date-range {
    width: 100%;
    gap: 12px 18px !important;
  }
  #tournaments-list-filters .tournaments-date-field {
    flex: 0 1 6.75rem !important;
    width: min(100%, 6.75rem) !important;
    min-width: min(100%, 6.25rem) !important;
    max-width: min(100%, 7rem) !important;
    gap: 4px !important;
  }
  #tournaments-list-filters .tournaments-date-field > label {
    font-size: 10px !important;
    letter-spacing: 0.2px !important;
  }
  #tournaments-list-filters .tournaments-date-input {
    height: 30px !important;
    font-size: 11px !important;
    padding: 0 6px !important;
    border-radius: 6px !important;
  }
}
`;

function getParam(sp: SP, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const onlyDate = value.slice(0, 10);
  const [y, m, d] = onlyDate.split("-");

  if (!y || !m || !d) return onlyDate;

  return `${d}/${m}/${y}`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueClubOptions(
  rows: Pick<TournamentRow, "club_name">[],
  sortLocale: string
) {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const row of rows) {
    const raw = row.club_name?.trim();
    if (!raw) continue;

    const key = normalizeText(raw);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    list.push(raw);
  }

  return list.sort((a, b) => a.localeCompare(b, sortLocale, { sensitivity: "base" }));
}

/** Alinea el valor del query con un club anfitrión conocido (lista cerrada). */
function canonicalClubFilter(requested: string, hostClubNames: string[]): string {
  const t = requested.trim();
  if (!t) return "";
  for (const o of hostClubNames) {
    if (o === t) return o;
    if (normalizeText(o) === normalizeText(t)) return o;
  }
  return "";
}

const statusBadge = (status: string | null): React.CSSProperties => {
  const s = (status ?? "").toLowerCase();

  if (s === "active" || s === "activo") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4",
      color: "#166534",
    };
  }

  if (s === "draft" || s === "borrador") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #fde68a",
      background: "#fffbeb",
      color: "#a16207",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    padding: "0 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    border: "1px solid #dbe2ea",
    background: "#f8fafc",
    color: "#334155",
  };
};

function visibilityBadge(
  isPublic: boolean | null,
  isArchived: boolean | null
): React.CSSProperties {
  if (isArchived) {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #cbd5e1",
      background: "#f1f5f9",
      color: "#475569",
    };
  }

  if (isPublic) {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #bbf7d0",
      background: "#f0fdf4",
      color: "#166534",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    padding: "0 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
  };
}

function visibilityLabel(
  isPublic: boolean | null,
  isArchived: boolean | null,
  v: { archived: string; public: string; hidden: string }
) {
  if (isArchived) return v.archived;
  if (isPublic) return v.public;
  return v.hidden;
}

function countLinkStyle(n: number): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    minWidth: 44,
    padding: "0 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: n > 0 ? "1px solid #bbf7d0" : "1px solid #fecaca",
    background: n > 0 ? "#f0fdf4" : "#fef2f2",
    color: n > 0 ? "#166534" : "#991b1b",
    textDecoration: "none",
  };
}

function countByTournament(rows: CountRow[] | null | undefined) {
  const map = new Map<string, number>();

  for (const row of rows ?? []) {
    map.set(row.tournament_id, (map.get(row.tournament_id) ?? 0) + 1);
  }

  return map;
}

function countLink(n: number, href: string) {
  return (
    <Link href={href} style={countLinkStyle(n)}>
      {n}
    </Link>
  );
}

function displayCourseName(courseName: string | null, courses: CourseRow[]) {
  if (!courseName) return "—";

  const match = courses.find(
    (c) => normalizeText(c.name) === normalizeText(courseName)
  );

  if (!match) return courseName;

  return match.short_name?.trim() || match.name || courseName;
}

function displayTournamentName(t: TournamentRow) {
  return t.short_name?.trim() || t.name || "—";
}

function displayClubName(clubName: string | null, clubs: ClubRow[]) {
  if (!clubName) return "—";

  const match = clubs.find(
    (c) => normalizeText(c.name) === normalizeText(clubName)
  );

  if (!match) return clubName;

  return match.short_name?.trim() || match.name || clubName;
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const tm = messages[locale].tournaments;
  const nav = messages[locale].sidebar.nav;
  const sortLocale = locale === "en" ? "en" : "es";

  const clubFromUrl = (getParam(sp, "club") ?? "").trim();
  const from = normalizeDateInput(getParam(sp, "from") ?? "");
  const to = normalizeDateInput(getParam(sp, "to") ?? "");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roles = user ? await getUserRoles(supabase, user.id) : [];
  // Un administrador/director puede tener además un rol de captura asignado a
  // algún torneo. En ese caso NO debe verse como capturista de solo lectura:
  // los permisos de admin tienen prioridad sobre la vista de captura.
  const hasAdminRole =
    roles.includes("super_admin") ||
    roles.includes("club_admin") ||
    roles.includes("tournament_director");
  const isScoreCapture = !hasAdminRole && roles.includes("score_capture");

  const { data: hostClubRows, error: hostClubErr } = await supabase
    .from("tournaments")
    .select("club_name")
    .not("club_name", "is", null);

  if (hostClubErr) {
    throw new Error(`Error leyendo clubes anfitriones: ${hostClubErr.message}`);
  }

  const clubOptions = uniqueClubOptions(
    (hostClubRows ?? []) as Pick<TournamentRow, "club_name">[],
    sortLocale
  );
  const club = canonicalClubFilter(clubFromUrl, clubOptions);

  let tournamentsQuery = supabase
    .from("tournaments")
    .select(
      "id, name, short_name, status, created_at, start_date, course_name, club_name, is_public, is_archived, poster_path"
    )
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (club) {
    tournamentsQuery = tournamentsQuery.ilike("club_name", club);
  }

  if (from) {
    tournamentsQuery = tournamentsQuery.gte("start_date", from);
  }

  if (to) {
    tournamentsQuery = tournamentsQuery.lte("start_date", to);
  }

  const [
    tournamentsRes,
    coursesRes,
    clubsRes,
    categoriesRes,
    roundsRes,
    teeSetsRes,
    teeRulesRes,
    holesRes,
    staffRes,
    entriesRes,
    convocatoriaRes,
    competitionRulesRes,
    cutRulesRes,
    prizeRulesRes,
  ] = await Promise.all([
    tournamentsQuery,
    supabase.from("courses").select("id, name, short_name"),
    supabase.from("clubs").select("id, name, short_name"),
    supabase.from("categories").select("id, tournament_id"),
    supabase.from("rounds").select("id, tournament_id"),
    supabase.from("tee_sets").select("id, tournament_id"),
    supabase.from("category_tee_rules").select("id, tournament_id"),
    supabase.from("tournament_holes").select("id, tournament_id"),
    supabase
      .from("user_tournament_roles")
      .select("id, tournament_id")
      .eq("is_active", true),
    supabase.from("tournament_entries").select("id, tournament_id"),
    supabase.from("tournament_convocatoria").select("tournament_id"),
    supabase
      .from("category_competition_rules")
      .select("id, tournament_id"),
    supabase
      .from("round_advancement_rules")
      .select("id, tournament_id"),
    supabase.from("category_prize_rules").select("id, tournament_id"),
  ]);

  if (tournamentsRes.error) {
    throw new Error(`Error leyendo torneos: ${tournamentsRes.error.message}`);
  }

  const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
  const courses = (coursesRes.data ?? []) as CourseRow[];
  const clubs = (clubsRes.data ?? []) as ClubRow[];

  const categoriesByTournament = countByTournament(categoriesRes.data);
  const roundsByTournament = countByTournament(roundsRes.data);
  const teeSetsByTournament = countByTournament(teeSetsRes.data);
  const teeRulesByTournament = countByTournament(teeRulesRes.data);
  const holesByTournament = countByTournament(holesRes.data);
  const staffByTournament = countByTournament(staffRes.data);
  const entriesByTournament = countByTournament(entriesRes.data);
  const convocatoriaByTournament = countByTournament(convocatoriaRes.data);
  const competitionRulesByTournament = countByTournament(
    competitionRulesRes.data
  );
  const cutRulesByTournament = countByTournament(cutRulesRes.data);
  const prizeRulesByTournament = countByTournament(prizeRulesRes.data);

  const matchPlayAuctionTournaments = new Set<string>();
  try {
    const { data: mpRules } = await supabase
      .from("tournament_matchplay_rules")
      .select("tournament_id, match_type, auction_enabled");
    for (const row of (mpRules ?? []) as Array<{
      tournament_id: string;
      match_type: string | null;
      auction_enabled: boolean | null;
    }>) {
      if (row.match_type === "pairs" && row.auction_enabled !== false) {
        matchPlayAuctionTournaments.add(row.tournament_id);
      }
    }
  } catch {
    // tournament_matchplay_rules puede no existir todavía (migración pendiente)
  }

  const hasFilters = Boolean(club || from || to);

  return (
    <div style={pageWrap}>
      <style dangerouslySetInnerHTML={{ __html: tournamentsFilterExtraCss }} />
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>{tm.title}</h1>
            <p style={subStyle}>{tm.subtitle}</p>
            {!isScoreCapture ? (
              <p
                style={{
                  ...subStyle,
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                  color: "#166534",
                  fontWeight: 600,
                }}
              >
                Columna «Público» (junto al nombre del torneo): botón verde
                publicar u ocultar en la página pública.
              </p>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={ghostButtonStyle}>
              {tm.linkPublicHome}
            </Link>

            <Link href="/#torneos" style={ghostButtonStyle}>
              {tm.linkPublicTournaments}
            </Link>

            {!isScoreCapture ? (
              <Link href="/tournaments/new" style={buttonStyle}>
                {tm.newTournament}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>{tm.searchHeading}</h2>
            <p style={subStyle}>{tm.searchHint}</p>
          </div>
        </div>

        <form id="tournaments-list-filters" method="get" style={filtersFormStyle}>
          <div style={filtersRowStyle}>
            <div style={clubFieldStyle}>
              <label htmlFor="club" style={labelStyle}>
                {tm.labelClub}
              </label>
              <select id="club" name="club" defaultValue={club} style={fieldStyle}>
                <option value="">{tm.clubSelectAll}</option>
                {clubOptions.map((clubName) => (
                  <option key={clubName} value={clubName}>
                    {displayClubName(clubName, clubs)}
                  </option>
                ))}
              </select>
            </div>

            <div className="tournaments-date-range">
            <div className="tournaments-date-field" style={dateFieldStyle}>
              <label htmlFor="from" style={labelStyle}>
                {tm.labelDateFrom}
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={from}
                className="tournaments-date-input"
                style={dateInputStyle}
              />
            </div>

            <div className="tournaments-date-field" style={dateFieldStyle}>
              <label htmlFor="to" style={labelStyle}>
                {tm.labelDateTo}
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={to}
                className="tournaments-date-input"
                style={dateInputStyle}
              />
            </div>
            </div>

            <div style={buttonGroupWrapStyle}>
              <button type="submit" style={buttonStyle}>
                {tm.filter}
              </button>

              <Link href="/tournaments" style={ghostButtonStyle}>
                {tm.clear}
              </Link>

              <Link href="/tournaments" style={ghostButtonStyle}>
                {tm.allByDate}
              </Link>
            </div>
          </div>
        </form>

        <div style={filtersNoteStyle}>
          {hasFilters ? (
            <>
              {tm.filterShowing}{" "}
              <strong>{tournaments.length}</strong>{" "}
              {tournaments.length === 1 ? tm.tournamentOne : tm.tournamentMany}{" "}
              {tournaments.length === 1 ? tm.filteredOne : tm.filteredMany}
              {club ? (
                <>
                  {" "}
                  {tm.byClub} <strong>{club}</strong>
                </>
              ) : null}
              {from ? (
                <>
                  {" "}
                  {tm.wordFrom} <strong>{formatDate(from)}</strong>
                </>
              ) : null}
              {to ? (
                <>
                  {" "}
                  {tm.wordTo} <strong>{formatDate(to)}</strong>
                </>
              ) : null}
              . {tm.orderPrefix}{" "}
              <strong>{tm.orderNewestFirst}</strong>.
            </>
          ) : (
            <>
              {tm.filterAllIntro}{" "}
              <strong>{tm.filterAllTournaments}</strong> {tm.filterAllOrdered}{" "}
              <strong>{tm.orderNewestFirst}</strong>.
            </>
          )}
        </div>
      </div>

      <div style={tableCardStyle}>
        <div style={backofficeTableStickyScrollRounded}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{tm.thDate}</th>
                <th style={thStyle}>{tm.thTournament}</th>
                <th style={thStyle}>{tm.thPublic}</th>
                <th style={thStyle}>{tm.thStatus}</th>
                <th style={thStyle}>{tm.thConvocatoria}</th>
                <th style={thStyle}>{tm.thCategories}</th>
                <th style={thStyle}>{tm.thCompetition}</th>
                <th style={thStyle}>{tm.thCuts}</th>
                <th style={thStyle}>{tm.thPrizes}</th>
                <th style={thStyle}>{tm.thHoles}</th>
                <th style={thStyle}>{tm.thTeeSets}</th>
                <th style={thStyle}>{tm.thRules}</th>
                <th style={thStyle}>{tm.thRounds}</th>
                <th style={thStyle}>{tm.thStaff}</th>
                <th style={thStyle}>{tm.colEntries}</th>
                <th style={thStyle}>{tm.thActions}</th>
              </tr>
            </thead>

            <tbody>
              {tournaments.map((t) => {
                const isPublic = t.is_public ?? true;
                const isArchived = t.is_archived ?? false;

                const posterUrl = t.poster_path
                  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tournament-posters/${t.poster_path}`
                  : null;

                return (
                  <tr key={t.id}>
                    <td style={tdStyle}>
                      {formatDate(t.start_date ?? t.created_at)}
                    </td>

                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                          minWidth: 0,
                        }}
                      >
                        {posterUrl ? (
                          <div
                            style={{
                              width: 112,
                              height: 160,
                              flexShrink: 0,
                              overflow: "hidden",
                              borderRadius: 16,
                              border: "1px solid #dbe2ea",
                              background: "#f8fafc",
                              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
                            }}
                          >
                            <img
                              src={posterUrl}
                              alt={displayTournamentName(t)}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 112,
                              height: 160,
                              flexShrink: 0,
                              overflow: "hidden",
                              borderRadius: 16,
                              border: "1px dashed #cbd5e1",
                              background: "#f8fafc",
                              color: "#64748b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              padding: 8,
                            }}
                          >
                            {tm.noPoster}
                          </div>
                        )}

                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={
                              isScoreCapture
                                ? `/entries?tournament_id=${t.id}`
                                : `/tournaments/edit?tournament_id=${t.id}`
                            }
                            style={nameLinkStyle}
                          >
                            {displayTournamentName(t)}
                          </Link>

                          <p style={subStyle}>
                            {tm.clubLine} {displayClubName(t.club_name, clubs)}
                          </p>

                          <p style={subStyle}>
                            {tm.courseLine} {displayCourseName(t.course_name, courses)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {isScoreCapture ? (
                        <span style={visibilityBadge(isPublic, isArchived)}>
                          {visibilityLabel(isPublic, isArchived, tm.visibility)}
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "stretch",
                            gap: 6,
                            minWidth: 180,
                          }}
                        >
                          <span
                            style={{
                              ...visibilityBadge(isPublic, isArchived),
                              alignSelf: "flex-start",
                            }}
                          >
                            {isPublic && !isArchived ? "👁 " : null}
                            {!isPublic && !isArchived ? "🚫 " : null}
                            {visibilityLabel(
                              isPublic,
                              isArchived,
                              tm.visibility
                            )}
                          </span>
                          {isArchived ? (
                            <span
                              style={{
                                fontSize: 10,
                                color: "#64748b",
                                lineHeight: 1.3,
                              }}
                            >
                              {tm.showArchivedHint}
                            </span>
                          ) : (
                            <form
                              action={togglePublic.bind(null, t.id)}
                              style={inlineFormStyle}
                            >
                              <SubmitButton
                                pendingText={tm.updating}
                                className={
                                  isPublic
                                    ? "inline-flex w-full items-center justify-center gap-1.5 whitespace-normal rounded-lg border-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 shadow-sm hover:bg-rose-100"
                                    : "inline-flex w-full items-center justify-center gap-1.5 whitespace-normal rounded-lg border-2 border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                                }
                              >
                                {isPublic ? `🔒 ${tm.hide}` : `🌐 ${tm.show}`}
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={tdStyle}>
                      {isScoreCapture ? (
                        <span style={statusBadge(t.status)}>
                          {t.status ?? "—"}
                        </span>
                      ) : (
                        <Link
                          href={`/tournaments/edit?tournament_id=${t.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <span style={statusBadge(t.status)}>
                            {t.status ?? "—"}
                          </span>
                        </Link>
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        convocatoriaByTournament.get(t.id) ?? 0,
                        `/convocatoria?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        categoriesByTournament.get(t.id) ?? 0,
                        `/categories?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        competitionRulesByTournament.get(t.id) ?? 0,
                        `/competition-rules?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        cutRulesByTournament.get(t.id) ?? 0,
                        `/cut-rules?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        prizeRulesByTournament.get(t.id) ?? 0,
                        `/prize-rules?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        holesByTournament.get(t.id) ?? 0,
                        `/courses?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        teeSetsByTournament.get(t.id) ?? 0,
                        `/tee-sets?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        teeRulesByTournament.get(t.id) ?? 0,
                        `/category-tee-rules?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        roundsByTournament.get(t.id) ?? 0,
                        `/rounds?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        staffByTournament.get(t.id) ?? 0,
                        `/tournaments/staff?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        entriesByTournament.get(t.id) ?? 0,
                        `/entries?tournament_id=${t.id}`
                      )}
                    </td>

                    <td style={actionCellStyle}>
                      <div style={actionsRowStyle}>
                        {!isScoreCapture && !isArchived ? (
                          <form
                            action={togglePublic.bind(null, t.id)}
                            style={inlineFormStyle}
                          >
                            <SubmitButton
                              pendingText={tm.updating}
                              className={
                                isPublic
                                  ? "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-rose-400 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-800"
                                  : "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-emerald-500 bg-emerald-600 px-2.5 text-[11px] font-bold text-white"
                              }
                            >
                              {isPublic ? `🔒 ${tm.hide}` : `🌐 ${tm.show}`}
                            </SubmitButton>
                          </form>
                        ) : null}

                        {isPublic && !isArchived ? (
                          <Link
                            href={`/torneos/${t.id}`}
                            style={publicButtonStyle}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tm.btnPublic}
                          </Link>
                        ) : null}

                        {!isScoreCapture ? (
                          <Link
                            href={`/tournaments/edit?tournament_id=${t.id}`}
                            style={ghostButtonStyle}
                          >
                            {tm.edit}
                          </Link>
                        ) : null}

                        <Link
                          href={`/entries?tournament_id=${t.id}`}
                          style={ghostButtonStyle}
                        >
                          {nav.entries}
                        </Link>

                        {matchPlayAuctionTournaments.has(t.id) ? (
                          <Link
                            href={`/matchplay/auction?tournament_id=${t.id}`}
                            style={auctionButtonStyle}
                            title="Hoja de subasta · captura de posturas y orden"
                          >
                            🎙 Subasta
                          </Link>
                        ) : null}

                        <Link
                          href={`/score-entry?tournament_id=${t.id}`}
                          style={scoreButtonStyle}
                        >
                          {tm.scores}
                        </Link>

                        {!isScoreCapture ? (
                          <>
                            <PosterUploadInline
                              tournamentId={t.id}
                              hasPoster={Boolean(t.poster_path)}
                            />

                            <form
                              action={toggleArchive.bind(null, t.id)}
                              style={inlineFormStyle}
                            >
                              <SubmitButton
                                pendingText={tm.updating}
                                className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-900"
                              >
                                {isArchived ? tm.reactivate : tm.archive}
                              </SubmitButton>
                            </form>

                            {(entriesByTournament.get(t.id) ?? 0) === 0 ? (
                              <DeleteTournamentButton
                                tournamentId={t.id}
                                tournamentName={displayTournamentName(t)}
                                action={deleteTournament}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {tournaments.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={16}>
                    {tm.emptyWithFilters}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}