import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { togglePublic, toggleArchive } from "./actions";
import PosterUploadInline from "./PosterUploadInline";

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
  padding: "16px 20px",
  display: "grid",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 11,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#334155",
  whiteSpace: "nowrap",
};

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

const filtersFormStyle: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 12,
};

const filtersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 10,
  alignItems: "end",
};

const clubFieldStyle: React.CSSProperties = {
  gridColumn: "span 4",
  minWidth: 0,
};

const dateFieldStyle: React.CSSProperties = {
  gridColumn: "span 2",
  minWidth: 0,
};

const buttonGroupWrapStyle: React.CSSProperties = {
  gridColumn: "span 4",
  minWidth: 0,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-start",
};

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
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

const filtersNoteStyle: React.CSSProperties = {
  padding: "0 12px 12px",
  fontSize: 12,
  color: "#475569",
};

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

function uniqueClubOptions(rows: Pick<TournamentRow, "club_name">[]) {
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

  return list.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
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

function visibilityLabel(isPublic: boolean | null, isArchived: boolean | null) {
  if (isArchived) return "Archivado";
  if (isPublic) return "Público";
  return "Oculto";
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

  const club = (getParam(sp, "club") ?? "").trim();
  const from = normalizeDateInput(getParam(sp, "from") ?? "");
  const to = normalizeDateInput(getParam(sp, "to") ?? "");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roles = user ? await getUserRoles(supabase, user.id) : [];
  const isScoreCapture = roles.includes("score_capture");

  let tournamentsQuery = supabase
    .from("tournaments")
    .select(
      "id, name, short_name, status, created_at, start_date, course_name, club_name, is_public, is_archived, poster_path"
    )
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (club) {
    tournamentsQuery = tournamentsQuery.ilike("club_name", `%${club}%`);
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
    clubsFilterRes,
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
    supabase.from("tournaments").select("club_name"),
  ]);

  if (tournamentsRes.error) {
    throw new Error(`Error leyendo torneos: ${tournamentsRes.error.message}`);
  }

  const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
  const courses = (coursesRes.data ?? []) as CourseRow[];
  const clubs = (clubsRes.data ?? []) as ClubRow[];

  const clubOptions = uniqueClubOptions(
    ((clubsFilterRes.data ?? []) as Array<{ club_name: string | null }>).map(
      (row) => ({
        club_name: row.club_name,
      })
    )
  );

  const categoriesByTournament = countByTournament(categoriesRes.data);
  const roundsByTournament = countByTournament(roundsRes.data);
  const teeSetsByTournament = countByTournament(teeSetsRes.data);
  const teeRulesByTournament = countByTournament(teeRulesRes.data);
  const holesByTournament = countByTournament(holesRes.data);
  const staffByTournament = countByTournament(staffRes.data);
  const entriesByTournament = countByTournament(entriesRes.data);

  const hasFilters = Boolean(club || from || to);

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>TORNEOS</h1>
            <p style={subStyle}>Control maestro de operación</p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={ghostButtonStyle}>
              Home pública
            </Link>

            <Link href="/#torneos" style={ghostButtonStyle}>
              Torneos públicos
            </Link>

            {!isScoreCapture ? (
              <Link href="/tournaments/new" style={buttonStyle}>
                Nuevo torneo
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>BUSCADOR / ORDENADOR</h2>
            <p style={subStyle}>
              Filtra por club y por rango de fechas del torneo
            </p>
          </div>
        </div>

        <form method="get" style={filtersFormStyle}>
          <div style={filtersGridStyle}>
            <div style={{ ...fieldWrapStyle, ...clubFieldStyle }}>
              <label htmlFor="club" style={labelStyle}>
                Club
              </label>
              <input
                id="club"
                name="club"
                defaultValue={club}
                placeholder="Escribe club y selecciona sugerencia"
                style={fieldStyle}
                list="club-options"
                autoComplete="off"
              />
              <datalist id="club-options">
                {clubOptions.map((clubName) => (
                  <option key={clubName} value={clubName} />
                ))}
              </datalist>
            </div>

            <div style={{ ...fieldWrapStyle, ...dateFieldStyle }}>
              <label htmlFor="from" style={labelStyle}>
                Fecha desde
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={from}
                style={fieldStyle}
              />
            </div>

            <div style={{ ...fieldWrapStyle, ...dateFieldStyle }}>
              <label htmlFor="to" style={labelStyle}>
                Fecha hasta
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={to}
                style={fieldStyle}
              />
            </div>

            <div style={buttonGroupWrapStyle}>
              <button type="submit" style={buttonStyle}>
                Filtrar
              </button>

              <Link href="/tournaments" style={ghostButtonStyle}>
                Limpiar
              </Link>

              <Link href="/tournaments" style={ghostButtonStyle}>
                Todos por fecha
              </Link>
            </div>
          </div>
        </form>

        <div style={filtersNoteStyle}>
          {hasFilters ? (
            <>
              Mostrando <strong>{tournaments.length}</strong> torneo
              {tournaments.length === 1 ? "" : "s"} filtrado
              {tournaments.length === 1 ? "" : "s"}
              {club ? (
                <>
                  {" "}
                  por club <strong>{club}</strong>
                </>
              ) : null}
              {from ? (
                <>
                  {" "}
                  desde <strong>{formatDate(from)}</strong>
                </>
              ) : null}
              {to ? (
                <>
                  {" "}
                  hasta <strong>{formatDate(to)}</strong>
                </>
              ) : null}
              . Orden: <strong>más reciente a más viejo</strong>.
            </>
          ) : (
            <>
              Mostrando <strong>todos los torneos</strong> ordenados de{" "}
              <strong>más reciente a más viejo</strong>.
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Torneo</th>
                <th style={thStyle}>Estatus</th>
                <th style={thStyle}>Público</th>
                <th style={thStyle}>Club</th>
                <th style={thStyle}>Campo</th>
                <th style={thStyle}>Hoyos</th>
                <th style={thStyle}>Categorías</th>
                <th style={thStyle}>Entries</th>
                <th style={thStyle}>Salidas</th>
                <th style={thStyle}>Reglas</th>
                <th style={thStyle}>Rondas</th>
                <th style={thStyle}>Staff</th>
                <th style={thStyle}>Acciones</th>
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
                            Sin poster
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
                            Club: {displayClubName(t.club_name, clubs)}
                          </p>

                          <p style={subStyle}>
                            Campo: {displayCourseName(t.course_name, courses)}
                          </p>
                        </div>
                      </div>
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
                      <span style={visibilityBadge(isPublic, isArchived)}>
                        {visibilityLabel(isPublic, isArchived)}
                      </span>
                    </td>

                    <td style={tdStyle}>{displayClubName(t.club_name, clubs)}</td>

                    <td style={tdStyle}>
                      {displayCourseName(t.course_name, courses)}
                    </td>

                    <td style={tdStyle}>
                      {countLink(
                        holesByTournament.get(t.id) ?? 0,
                        `/courses?tournament_id=${t.id}`
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
                        entriesByTournament.get(t.id) ?? 0,
                        `/entries?tournament_id=${t.id}`
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

                    <td style={actionCellStyle}>
                      <div style={actionsRowStyle}>
                        {isPublic && !isArchived ? (
                          <Link
                            href={`/torneos/${t.id}`}
                            style={publicButtonStyle}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Pública
                          </Link>
                        ) : null}

                        {!isScoreCapture ? (
                          <Link
                            href={`/tournaments/edit?tournament_id=${t.id}`}
                            style={ghostButtonStyle}
                          >
                            Editar
                          </Link>
                        ) : null}

                        <Link
                          href={`/entries?tournament_id=${t.id}`}
                          style={ghostButtonStyle}
                        >
                          Entries
                        </Link>

                        <Link
                          href={`/score-entry?tournament_id=${t.id}`}
                          style={scoreButtonStyle}
                        >
                          Scores
                        </Link>

                        {!isScoreCapture ? (
                          <>
                            <PosterUploadInline
                              tournamentId={t.id}
                              hasPoster={Boolean(t.poster_path)}
                            />

                            <form
                              action={togglePublic.bind(null, t.id)}
                              style={inlineFormStyle}
                            >
                              <button type="submit" style={miniActionButtonStyle}>
                                {isPublic ? "Ocultar" : "Mostrar"}
                              </button>
                            </form>

                            <form
                              action={toggleArchive.bind(null, t.id)}
                              style={inlineFormStyle}
                            >
                              <button type="submit" style={miniActionButtonStyle}>
                                {isArchived ? "Reactivar" : "Archivar"}
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {tournaments.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={14}>
                    No hay torneos registrados con esos filtros.
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