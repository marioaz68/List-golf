import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import {
  applyCourseToTournament,
  applyCategoryTemplateToTournament,
  initializeTournament,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name?: string | null;
  club_name?: string | null;
  course_name?: string | null;
  start_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type Course = {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  holes_count: number | null;
};

type TournamentHole = {
  hole_number: number;
  par: number;
  handicap_index: number;
};

type CategoryTemplate = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type RoundRow = {
  round_no: number;
  date: string | null;
  [key: string]: unknown;
};

function firstOf(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function safeText(v: unknown) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s || "—";
}

function normalizeText(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function sameText(a: unknown, b: unknown) {
  return normalizeText(a) === normalizeText(b);
}

function buildAbbr(v: string | null | undefined) {
  const text = String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (!text) return "—";

  const stopWords = new Set([
    "de",
    "del",
    "la",
    "las",
    "los",
    "el",
    "y",
    "and",
    "the",
  ]);

  const words = text
    .split(" ")
    .map((w) => w.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9]/g, ""))
    .filter(Boolean)
    .filter((w) => !stopWords.has(w.toLowerCase()));

  if (words.length === 0) return text.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();

  return words
    .slice(0, 4)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatCourseOption(course: Course) {
  const courseName = String(course.name ?? "").trim();
  const clubName = String(course.club_name ?? "").trim();

  if (!courseName && !clubName) return "Campo sin nombre";

  if (courseName && clubName && sameText(courseName, clubName)) {
    return `${courseName} (${buildAbbr(clubName)})`;
  }

  if (courseName && clubName) {
    return `${courseName} — ${clubName} (${buildAbbr(courseName)})`;
  }

  return `${courseName || clubName} (${buildAbbr(courseName || clubName)})`;
}

function getRoundDate(row: Record<string, unknown>) {
  const candidates = [
    row.date,
    row.round_date,
    row.play_date,
    row.scheduled_date,
    row.event_date,
    row.created_at,
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return null;
}

const pageWrap: React.CSSProperties = {
  padding: "16px 20px 28px",
  display: "grid",
  gap: 14,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  padding: 14,
};

const headerBar: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const titleWrap: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 700,
  color: "#111827",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#6b7280",
};

const rightTools: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  marginLeft: "auto",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.6,
  color: "#374151",
  textTransform: "uppercase",
};

const sectionSubtle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#6b7280",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const formRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#4b5563",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 10px",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 240,
};

const buttonPrimary: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const buttonPrimaryDisabled: React.CSSProperties = {
  ...buttonPrimary,
  opacity: 0.5,
  cursor: "not-allowed",
};

const buttonSecondary: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 8,
};

const infoBox: React.CSSProperties = {
  border: "1px solid #eef2f7",
  background: "#f9fafb",
  borderRadius: 8,
  padding: "8px 10px",
  display: "grid",
  gap: 3,
};

const infoLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.4,
  color: "#6b7280",
  textTransform: "uppercase",
};

const infoValue: React.CSSProperties = {
  fontSize: 13,
  color: "#111827",
  fontWeight: 600,
  lineHeight: 1.2,
};

const holesWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 460,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "#374151",
  padding: "9px 10px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #f3f4f6",
  fontSize: 13,
  color: "#111827",
};

const compactMuted: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const actionLinks: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const currentStateGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const currentStateBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f9fafb",
  padding: "8px 10px",
  display: "grid",
  gap: 4,
};

export default async function TournamentSetupPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const sp = searchParams ? await searchParams : {};
  const selectedTournamentId = firstOf(sp?.tournament_id) ?? "";
  const selectedClubName = firstOf(sp?.club_name) ?? "";
  const selectedInitClubName = firstOf(sp?.init_club_name) ?? "";

  const supabase = await createClient();

  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  if (tournamentsError) {
    throw new Error(`Error leyendo torneos: ${tournamentsError.message}`);
  }

  const tournaments = (tournamentsData ?? []) as Tournament[];

  const { data: coursesData, error: coursesError } = await supabase
    .from("courses")
    .select("id, name, club_name, city, state, country, holes_count")
    .order("club_name")
    .order("name");

  if (coursesError) {
    throw new Error(`Error leyendo campos: ${coursesError.message}`);
  }

  const courses = (coursesData ?? []) as Course[];

  const { data: templatesData, error: templatesError } = await supabase
    .from("category_templates")
    .select("id, name, description, is_active")
    .eq("is_active", true)
    .order("name");

  if (templatesError) {
    throw new Error(`Error leyendo plantillas: ${templatesError.message}`);
  }

  const categoryTemplates = (templatesData ?? []) as CategoryTemplate[];

  const selectedTournament =
    tournaments.find((t) => t.id === selectedTournamentId) ??
    tournaments[0] ??
    null;

  if (selectedTournament?.id) {
    await requireTournamentAccess({
      tournamentId: selectedTournament.id,
      allowedRoles: ["super_admin", "club_admin", "tournament_director"],
    });
  }

  const clubOptions = Array.from(
    new Set(
      courses
        .map((c) => String(c.club_name ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const effectiveCourseClub =
    selectedClubName ||
    String(selectedTournament?.club_name ?? "").trim() ||
    clubOptions[0] ||
    "";

  const effectiveInitClub =
    selectedInitClubName ||
    String(selectedTournament?.club_name ?? "").trim() ||
    clubOptions[0] ||
    "";

  const filteredCourses = effectiveCourseClub
    ? courses.filter(
        (c) => String(c.club_name ?? "").trim() === effectiveCourseClub
      )
    : courses;

  const filteredInitCourses = effectiveInitClub
    ? courses.filter(
        (c) => String(c.club_name ?? "").trim() === effectiveInitClub
      )
    : courses;

  let tournamentHoles: TournamentHole[] = [];
  if (selectedTournament?.id) {
    const { data: holesData, error: holesError } = await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", selectedTournament.id)
      .order("hole_number");

    if (holesError) {
      throw new Error(`Error leyendo tournament_holes: ${holesError.message}`);
    }

    tournamentHoles = (holesData ?? []) as TournamentHole[];
  }

  let selectedTournamentCategoriesCount = 0;
  let selectedTournamentCategories: CategoryRow[] = [];
  if (selectedTournament?.id) {
    const { count, error: catCountError } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", selectedTournament.id);

    if (catCountError) {
      throw new Error(`Error contando categorías: ${catCountError.message}`);
    }

    selectedTournamentCategoriesCount = count ?? 0;

    const { data: categoriesData, error: categoriesError } = await supabase
      .from("categories")
      .select("id, code, name, sort_order")
      .eq("tournament_id", selectedTournament.id)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (categoriesError) {
      throw new Error(`Error leyendo categorías: ${categoriesError.message}`);
    }

    selectedTournamentCategories = (categoriesData ?? []) as CategoryRow[];
  }

  let selectedTournamentRoundsCount = 0;
  let selectedTournamentRounds: RoundRow[] = [];
  if (selectedTournament?.id) {
    const { count, error: roundsCountError } = await supabase
      .from("rounds")
      .select("round_no", { count: "exact", head: true })
      .eq("tournament_id", selectedTournament.id);

    if (roundsCountError) {
      throw new Error(`Error contando rondas: ${roundsCountError.message}`);
    }

    selectedTournamentRoundsCount = count ?? 0;

    const { data: roundsData, error: roundsError } = await supabase
      .from("rounds")
      .select("*")
      .eq("tournament_id", selectedTournament.id)
      .order("round_no", { ascending: true });

    if (roundsError) {
      throw new Error(`Error leyendo rondas: ${roundsError.message}`);
    }

    selectedTournamentRounds = ((roundsData ?? []) as Record<string, unknown>[])
      .map((row) => ({
        ...row,
        round_no: Number(row.round_no ?? 0),
        date: getRoundDate(row),
      }))
      .filter((row) => row.round_no > 0) as RoundRow[];
  }

  const clubSummary = safeText(selectedTournament?.club_name);
  const courseSummary = safeText(selectedTournament?.course_name);
  const abbrSummary = buildAbbr(
    sameText(selectedTournament?.club_name, selectedTournament?.course_name)
      ? String(selectedTournament?.club_name ?? "")
      : String(
          selectedTournament?.course_name ?? selectedTournament?.club_name ?? ""
        )
  );

  const currentCategoriesText =
    selectedTournamentCategories.length > 0
      ? selectedTournamentCategories
          .map((c) => {
            const code = String(c.code ?? "").trim();
            const name = String(c.name ?? "").trim();
            if (code && name) return `${code} - ${name}`;
            return code || name || "Sin nombre";
          })
          .join(" · ")
      : "Sin categorías cargadas";

  const currentRoundsText =
    selectedTournamentRounds.length > 0
      ? selectedTournamentRounds
          .map((r) => `R${r.round_no}${r.date ? ` (${r.date})` : ""}`)
          .join(" · ")
      : "Sin rondas cargadas";

  const currentCourseId =
    filteredCourses.find(
      (c) =>
        sameText(c.name, selectedTournament?.course_name) &&
        sameText(c.club_name, selectedTournament?.club_name)
    )?.id ?? "";

  return (
    <div style={pageWrap}>
      <section style={cardStyle}>
        <div style={headerBar}>
          <div style={titleWrap}>
            <h1 style={titleStyle}>Configuración de torneo</h1>
            <p style={subtitleStyle}>
              Torneos existentes · generar campos, aplicar plantilla y preparar
              operación.
            </p>
          </div>

          <form method="get" style={rightTools}>
            <div style={fieldWrap}>
              <label htmlFor="tournament_id" style={labelStyle}>
                Torneo
              </label>
              <select
                id="tournament_id"
                name="tournament_id"
                defaultValue={selectedTournament?.id ?? ""}
                style={selectStyle}
              >
                <option value="">Selecciona torneo</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {safeText(t.name)}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" style={buttonSecondary}>
              Cambiar
            </button>

            <Link
              href="/tournaments/new"
              style={{
                ...buttonSecondary,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              Nuevo torneo
            </Link>
          </form>
        </div>
      </section>

      {selectedTournament ? (
        <>
          <section style={cardStyle}>
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={sectionTitle}>Resumen del torneo</h2>

                <div style={actionLinks}>
                  <Link
                    href={`/categories?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Categorías
                  </Link>

                  <Link
                    href={`/tee-sets?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Salidas
                  </Link>

                  <Link
                    href={`/rounds?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Rondas
                  </Link>

                  <Link
                    href={`/score-entry?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Captura scores
                  </Link>
                </div>
              </div>

              <div style={infoGrid}>
                <div style={infoBox}>
                  <div style={infoLabel}>Torneo</div>
                  <div style={infoValue}>{safeText(selectedTournament.name)}</div>
                </div>

                <div style={infoBox}>
                  <div style={infoLabel}>Club</div>
                  <div style={infoValue}>{clubSummary}</div>
                </div>

                <div style={infoBox}>
                  <div style={infoLabel}>Campo</div>
                  <div style={infoValue}>{courseSummary}</div>
                </div>

                <div style={infoBox}>
                  <div style={infoLabel}>Abrev.</div>
                  <div style={infoValue}>{abbrSummary}</div>
                </div>

                <div style={infoBox}>
                  <div style={infoLabel}>Inicio</div>
                  <div style={infoValue}>
                    {safeText(selectedTournament.start_date)}
                  </div>
                </div>

                <div style={infoBox}>
                  <div style={infoLabel}>Categorías</div>
                  <div style={infoValue}>{selectedTournamentCategoriesCount}</div>
                </div>
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <h2 style={sectionTitle}>Inicialización rápida</h2>
                <p style={sectionSubtle}>
                  Genera campo del torneo, categorías desde plantilla y rondas
                  base en una sola acción.
                </p>
              </div>

              <div style={currentStateGrid}>
                <div style={currentStateBox}>
                  <div style={infoLabel}>Campo actual</div>
                  <div style={infoValue}>{courseSummary}</div>
                </div>

                <div style={currentStateBox}>
                  <div style={infoLabel}>Categorías actuales</div>
                  <div style={{ ...infoValue, fontSize: 12, fontWeight: 500 }}>
                    {currentCategoriesText}
                  </div>
                </div>

                <div style={currentStateBox}>
                  <div style={infoLabel}>Rondas actuales</div>
                  <div style={{ ...infoValue, fontSize: 12, fontWeight: 500 }}>
                    {currentRoundsText}
                  </div>
                </div>
              </div>

              <form method="get" style={{ display: "grid", gap: 10 }}>
                <input
                  type="hidden"
                  name="tournament_id"
                  value={selectedTournament.id}
                />
                <input
                  type="hidden"
                  name="club_name"
                  value={effectiveCourseClub}
                />

                <div style={formRow}>
                  <div style={{ ...fieldWrap, minWidth: 240 }}>
                    <label htmlFor="init_club_name" style={labelStyle}>
                      Club
                    </label>
                    <select
                      id="init_club_name"
                      name="init_club_name"
                      defaultValue={effectiveInitClub}
                      style={selectStyle}
                    >
                      <option value="">Todos</option>
                      {clubOptions.map((club) => (
                        <option key={club} value={club}>
                          {club}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button type="submit" style={buttonSecondary}>
                    Ver campos
                  </button>
                </div>
              </form>

              <form
                action={initializeTournament}
                style={{ display: "grid", gap: 10 }}
              >
                <input
                  type="hidden"
                  name="tournament_id"
                  value={selectedTournament.id}
                />
                <input
                  type="hidden"
                  name="club_name"
                  value={effectiveCourseClub}
                />
                <input
                  type="hidden"
                  name="init_club_name"
                  value={effectiveInitClub}
                />

                <div style={formRow}>
                  <div style={{ ...fieldWrap, minWidth: 240 }}>
                    <label style={labelStyle}>Club</label>
                    <input
                      value={effectiveInitClub || ""}
                      readOnly
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ ...fieldWrap, minWidth: 320, flex: 1 }}>
                    <label htmlFor="init_course_id" style={labelStyle}>
                      Campo base
                    </label>
                    <select
                      id="init_course_id"
                      name="course_id"
                      defaultValue={currentCourseId}
                      style={selectStyle}
                      required
                    >
                      <option value="">
                        {currentCourseId ? "Cambiar campo base" : "Selecciona campo"}
                      </option>
                      {filteredInitCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {formatCourseOption(course)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ ...fieldWrap, minWidth: 280, flex: 1 }}>
                    <label htmlFor="init_template_id" style={labelStyle}>
                      Modificar categorías
                    </label>
                    <select
                      id="init_template_id"
                      name="template_id"
                      defaultValue=""
                      style={selectStyle}
                    >
                      <option value="">
                        {selectedTournamentCategoriesCount > 0
                          ? "Dejar categorías actuales"
                          : "Selecciona plantilla"}
                      </option>
                      {categoryTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ ...fieldWrap, minWidth: 120 }}>
                    <label htmlFor="rounds_count" style={labelStyle}>
                      Rondas
                    </label>
                    <select
                      id="rounds_count"
                      name="rounds_count"
                      defaultValue={
                        selectedTournamentRoundsCount > 0
                          ? String(selectedTournamentRoundsCount)
                          : "3"
                      }
                      style={{ ...selectStyle, minWidth: 120 }}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>

                  <button type="submit" style={buttonPrimary}>
                    Inicializar torneo
                  </button>
                </div>

                <div style={compactMuted}>
                  Reemplaza <strong>tournament_holes</strong> y{" "}
                  <strong>rounds</strong>. Si eliges plantilla, también reemplaza{" "}
                  <strong>categories</strong>. Si el torneo no tiene fecha de
                  inicio, las rondas se crearán usando la fecha de hoy.
                </div>
              </form>
            </div>
          </section>

          <div style={grid2}>
            <section style={cardStyle}>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <h2 style={sectionTitle}>Campo</h2>
                  <p style={sectionSubtle}>
                    Selecciona club y campo base para generar la tarjeta del
                    torneo en <strong>tournament_holes</strong>.
                  </p>
                </div>

                <form method="get" style={{ display: "grid", gap: 10 }}>
                  <input
                    type="hidden"
                    name="tournament_id"
                    value={selectedTournament.id}
                  />
                  <input
                    type="hidden"
                    name="init_club_name"
                    value={effectiveInitClub}
                  />

                  <div style={formRow}>
                    <div style={{ ...fieldWrap, minWidth: 240 }}>
                      <label htmlFor="club_name" style={labelStyle}>
                        Club
                      </label>
                      <select
                        id="club_name"
                        name="club_name"
                        defaultValue={effectiveCourseClub}
                        style={selectStyle}
                      >
                        <option value="">Todos</option>
                        {clubOptions.map((club) => (
                          <option key={club} value={club}>
                            {club}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button type="submit" style={buttonSecondary}>
                      Ver campos
                    </button>
                  </div>
                </form>

                <form
                  action={applyCourseToTournament}
                  style={{ display: "grid", gap: 10 }}
                >
                  <input
                    type="hidden"
                    name="tournament_id"
                    value={selectedTournament.id}
                  />
                  <input
                    type="hidden"
                    name="club_name"
                    value={effectiveCourseClub}
                  />
                  <input
                    type="hidden"
                    name="init_club_name"
                    value={effectiveInitClub}
                  />

                  <div style={formRow}>
                    <div style={{ ...fieldWrap, minWidth: 240 }}>
                      <label style={labelStyle}>Club</label>
                      <input
                        value={effectiveCourseClub || ""}
                        readOnly
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ ...fieldWrap, minWidth: 320, flex: 1 }}>
                      <label htmlFor="course_id" style={labelStyle}>
                        Campo base
                      </label>
                      <select
                        id="course_id"
                        name="course_id"
                        defaultValue={currentCourseId}
                        style={selectStyle}
                        required
                      >
                        <option value="">
                          {currentCourseId ? "Cambiar campo base" : "Selecciona campo"}
                        </option>
                        {filteredCourses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {formatCourseOption(course)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button type="submit" style={buttonPrimary}>
                      Generar campos del torneo
                    </button>
                  </div>

                  <div style={compactMuted}>
                    Esta acción reemplaza los registros actuales de{" "}
                    <strong>tournament_holes</strong>.
                  </div>
                </form>

                <div style={holesWrap}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 100 }}>HOYO</th>
                        <th style={{ ...thStyle, width: 120 }}>PAR</th>
                        <th style={{ ...thStyle, width: 140 }}>VENTAJA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournamentHoles.length > 0 ? (
                        tournamentHoles.map((row) => (
                          <tr key={row.hole_number}>
                            <td style={tdStyle}>{row.hole_number}</td>
                            <td style={tdStyle}>{row.par}</td>
                            <td style={tdStyle}>{row.handicap_index}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td style={tdStyle} colSpan={3}>
                            Este torneo todavía no tiene campos generados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section style={cardStyle}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <h2 style={sectionTitle}>Categorías</h2>
                  <p style={sectionSubtle}>
                    Aplica una plantilla existente al torneo actual.
                  </p>
                </div>

                <form
                  action={applyCategoryTemplateToTournament}
                  style={{ display: "grid", gap: 10 }}
                >
                  <input
                    type="hidden"
                    name="tournament_id"
                    value={selectedTournament.id}
                  />
                  <input
                    type="hidden"
                    name="club_name"
                    value={effectiveCourseClub}
                  />
                  <input
                    type="hidden"
                    name="init_club_name"
                    value={effectiveInitClub}
                  />

                  <div style={formRow}>
                    <div style={{ ...fieldWrap, minWidth: 320, flex: 1 }}>
                      <label htmlFor="template_id" style={labelStyle}>
                        Modificar categorías
                      </label>
                      <select
                        id="template_id"
                        name="template_id"
                        defaultValue=""
                        style={selectStyle}
                        required
                      >
                        <option value="">
                          {selectedTournamentCategoriesCount > 0
                            ? "Cambiar categorías actuales"
                            : "Selecciona plantilla"}
                        </option>
                        {categoryTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      style={
                        categoryTemplates.length > 0
                          ? buttonPrimary
                          : buttonPrimaryDisabled
                      }
                      disabled={categoryTemplates.length === 0}
                    >
                      Aplicar plantilla
                    </button>
                  </div>

                  <div style={compactMuted}>
                    Categorías actuales: {currentCategoriesText}
                  </div>

                  <div style={compactMuted}>
                    Esta acción elimina primero las categorías actuales del torneo
                    y luego carga las de la plantilla seleccionada.
                  </div>

                  {categoryTemplates.length === 0 && (
                    <div style={compactMuted}>
                      No hay plantillas activas disponibles.
                    </div>
                  )}
                </form>

                <div style={compactMuted}>
                  Después puedes afinar detalles en el módulo de categorías.
                </div>
              </div>
            </section>

            <section style={cardStyle}>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <h2 style={sectionTitle}>Salidas</h2>
                  <p style={sectionSubtle}>
                    Bloque listo para seleccionar salidas y reglas por torneo.
                  </p>
                </div>

                <div style={actionLinks}>
                  <Link
                    href={`/tee-sets?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Abrir salidas
                  </Link>

                  <Link
                    href={`/category-tee-rules?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Reglas de salidas
                  </Link>
                </div>
              </div>
            </section>

            <section style={cardStyle}>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <h2 style={sectionTitle}>Tipo de torneo y rondas</h2>
                  <p style={sectionSubtle}>
                    Desde aquí puedes continuar con parámetros operativos,
                    rondas y reglas complementarias.
                  </p>
                </div>

                <div style={actionLinks}>
                  <Link
                    href={`/rounds?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Abrir rondas
                  </Link>

                  <Link
                    href={`/cut-rules?tournament_id=${selectedTournament.id}`}
                    style={{
                      ...buttonSecondary,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    Cut rules
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <section style={cardStyle}>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            No hay torneos disponibles. Primero crea uno en{" "}
            <strong>/tournaments/new</strong>.
          </p>
        </section>
      )}
    </div>
  );
}