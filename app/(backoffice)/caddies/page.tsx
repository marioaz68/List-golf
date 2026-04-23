import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  start_date: string | null;
  club_name: string | null;
};

type RoundRow = {
  id: string;
  tournament_id: string;
  round_no: number | null;
  round_date: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type CaddieRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  whatsapp_phone_e164: string | null;
  email: string | null;
  club_id: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type EntryPlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type EntryCategoryRow = {
  code: string | null;
  name: string | null;
};

type EntryRow = {
  id: string;
  tournament_id: string;
  player_number: number | null;
  status: string | null;
  players: EntryPlayerRow | EntryPlayerRow[] | null;
  categories: EntryCategoryRow | EntryCategoryRow[] | null;
};

type CaddieAssignmentRow = {
  id: string;
  tournament_id: string;
  entry_id: string;
  caddie_id: string;
  round_id: string | null;
  role: string | null;
  is_active: boolean | null;
  notes: string | null;
  created_at: string | null;
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

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
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

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  padding: 12,
};

const statCardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#ffffff",
  padding: 12,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  margin: 0,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0f172a",
  margin: "6px 0 0 0",
};

const okBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  minWidth: 44,
  padding: "0 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
};

const warnBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 24,
  minWidth: 44,
  padding: "0 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
};

function getParam(sp: SP, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const onlyDate = value.slice(0, 10);
  const [y, m, d] = onlyDate.split("-");
  if (!y || !m || !d) return onlyDate;
  return `${d}/${m}/${y}`;
}

function displayTournamentName(t: TournamentRow) {
  return t.short_name?.trim() || t.name || "—";
}

function displayClubName(clubId: string | null, clubs: ClubRow[]) {
  if (!clubId) return "—";
  const found = clubs.find((c) => c.id === clubId);
  if (!found) return "—";
  return found.short_name?.trim() || found.name || "—";
}

function displayCaddieName(c: CaddieRow) {
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return full || "Sin nombre";
}

function displayEntryPlayerName(entry: EntryRow) {
  const player = oneOrNull(entry.players);
  const full = `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
  return full || "Jugador sin nombre";
}

function displayEntryCategory(entry: EntryRow) {
  const category = oneOrNull(entry.categories);
  return category?.code ?? category?.name ?? "—";
}

function assignmentRoundLabel(
  roundId: string | null,
  rounds: RoundRow[]
) {
  if (!roundId) return "Todas";
  const found = rounds.find((r) => r.id === roundId);
  if (!found) return "—";
  return `R${found.round_no ?? "?"}`;
}

export default async function CaddiesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournamentId = String(getParam(sp, "tournament_id") ?? "").trim();
  const roundId = String(getParam(sp, "round_id") ?? "").trim();

  const supabase = await createClient();

  const [
    tournamentsRes,
    roundsRes,
    clubsRes,
    caddiesRes,
    entriesRes,
    assignmentsRes,
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, short_name, start_date, club_name")
      .order("start_date", { ascending: false }),
    supabase
      .from("rounds")
      .select("id, tournament_id, round_no, round_date")
      .order("round_no", { ascending: true }),
    supabase
      .from("clubs")
      .select("id, name, short_name")
      .order("name", { ascending: true }),
    supabase
      .from("caddies")
      .select(
        "id, first_name, last_name, phone, whatsapp_phone, whatsapp_phone_e164, email, club_id, notes, is_active, created_at"
      )
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),
    supabase
      .from("tournament_entries")
      .select(`
        id,
        tournament_id,
        player_number,
        status,
        players (
          id,
          first_name,
          last_name
        ),
        categories (
          code,
          name
        )
      `)
      .order("player_number", { ascending: true, nullsFirst: false }),
    supabase
      .from("caddie_assignments")
      .select(
        "id, tournament_id, entry_id, caddie_id, round_id, role, is_active, notes, created_at"
      )
      .order("created_at", { ascending: false }),
  ]);

  if (tournamentsRes.error) {
    throw new Error(`Error leyendo tournaments: ${tournamentsRes.error.message}`);
  }

  if (roundsRes.error) {
    throw new Error(`Error leyendo rounds: ${roundsRes.error.message}`);
  }

  if (clubsRes.error) {
    throw new Error(`Error leyendo clubs: ${clubsRes.error.message}`);
  }

  if (caddiesRes.error) {
    throw new Error(`Error leyendo caddies: ${caddiesRes.error.message}`);
  }

  if (entriesRes.error) {
    throw new Error(`Error leyendo tournament_entries: ${entriesRes.error.message}`);
  }

  if (assignmentsRes.error) {
    throw new Error(`Error leyendo caddie_assignments: ${assignmentsRes.error.message}`);
  }

  const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
  const roundsAll = (roundsRes.data ?? []) as RoundRow[];
  const clubs = (clubsRes.data ?? []) as ClubRow[];
  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const entriesAll = (entriesRes.data ?? []) as EntryRow[];
  const assignmentsAll = (assignmentsRes.data ?? []) as CaddieAssignmentRow[];

  const selectedTournamentId =
    tournaments.some((t) => t.id === tournamentId)
      ? tournamentId
      : "";

  const rounds = selectedTournamentId
    ? roundsAll.filter((r) => r.tournament_id === selectedTournamentId)
    : roundsAll;

  const selectedRoundId =
    rounds.some((r) => r.id === roundId)
      ? roundId
      : "";

  const entries = selectedTournamentId
    ? entriesAll.filter((e) => e.tournament_id === selectedTournamentId)
    : entriesAll;

  const assignments = assignmentsAll.filter((a) => {
    if (selectedTournamentId && a.tournament_id !== selectedTournamentId) {
      return false;
    }
    if (selectedRoundId && a.round_id !== selectedRoundId) {
      return false;
    }
    return true;
  });

  const caddieMap = new Map(caddies.map((c) => [c.id, c]));
  const entryMap = new Map(entriesAll.map((e) => [e.id, e]));
  const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));

  const activeCaddies = caddies.filter((c) => c.is_active !== false).length;
  const inactiveCaddies = Math.max(caddies.length - activeCaddies, 0);
  const activeAssignments = assignmentsAll.filter((a) => a.is_active !== false).length;
  const inactiveAssignments = Math.max(assignmentsAll.length - activeAssignments, 0);

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>CADDIES</h1>
            <p style={subStyle}>
              Catálogo y asignación operativa de caddies por torneo
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/tournaments" style={ghostButtonStyle}>
              Torneos
            </Link>

            <Link href="/entries" style={ghostButtonStyle}>
              Entries
            </Link>

            <Link href="/score-entry" style={ghostButtonStyle}>
              Score Entry
            </Link>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>FILTROS</h2>
            <p style={subStyle}>Filtra asignaciones por torneo y ronda</p>
          </div>
        </div>

        <form method="get" style={filtersFormStyle}>
          <div style={filtersGridStyle}>
            <div style={{ ...fieldWrapStyle, gridColumn: "span 5" }}>
              <label htmlFor="tournament_id" style={labelStyle}>
                Torneo
              </label>

              <select
                id="tournament_id"
                name="tournament_id"
                defaultValue={selectedTournamentId}
                style={fieldStyle}
              >
                <option value="">Todos los torneos</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {displayTournamentName(t)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="round_id" style={labelStyle}>
                Ronda
              </label>

              <select
                id="round_id"
                name="round_id"
                defaultValue={selectedRoundId}
                style={fieldStyle}
              >
                <option value="">Todas</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    R{r.round_no ?? "?"}
                    {r.round_date ? ` · ${formatDate(r.round_date)}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                gridColumn: "span 4",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button type="submit" style={buttonStyle}>
                Filtrar
              </button>

              <Link href="/caddies" style={ghostButtonStyle}>
                Limpiar
              </Link>
            </div>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <div style={statsGridStyle}>
          <div style={statCardStyle}>
            <p style={statLabelStyle}>Caddies totales</p>
            <p style={statValueStyle}>{caddies.length}</p>
          </div>

          <div style={statCardStyle}>
            <p style={statLabelStyle}>Caddies activos</p>
            <p style={statValueStyle}>{activeCaddies}</p>
          </div>

          <div style={statCardStyle}>
            <p style={statLabelStyle}>Asignaciones activas</p>
            <p style={statValueStyle}>{activeAssignments}</p>
          </div>

          <div style={statCardStyle}>
            <p style={statLabelStyle}>Asignaciones inactivas</p>
            <p style={statValueStyle}>{inactiveAssignments}</p>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>CATÁLOGO DE CADDIES</h2>
            <p style={subStyle}>
              Vista base del padrón de caddies registrados
            </p>
          </div>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Activo</th>
                <th style={thStyle}>Teléfono</th>
                <th style={thStyle}>WhatsApp</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Club</th>
                <th style={thStyle}>Notas</th>
              </tr>
            </thead>

            <tbody>
              {caddies.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7}>
                    No hay caddies registrados.
                  </td>
                </tr>
              ) : (
                caddies.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontWeight: 700 }}>{displayCaddieName(c)}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{c.id}</div>
                      </div>
                    </td>

                    <td style={tdStyle}>
                      <span style={c.is_active !== false ? okBadge : warnBadge}>
                        {c.is_active !== false ? "Sí" : "No"}
                      </span>
                    </td>

                    <td style={tdStyle}>{c.phone ?? "—"}</td>
                    <td style={tdStyle}>
                      {c.whatsapp_phone_e164 ?? c.whatsapp_phone ?? "—"}
                    </td>
                    <td style={tdStyle}>{c.email ?? "—"}</td>
                    <td style={tdStyle}>{displayClubName(c.club_id, clubs)}</td>
                    <td style={tdStyle}>{c.notes?.trim() || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>ASIGNACIONES</h2>
            <p style={subStyle}>
              Caddie asignado a jugador inscrito por torneo y ronda
            </p>
          </div>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Torneo</th>
                <th style={thStyle}>Ronda</th>
                <th style={thStyle}>Jugador</th>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Cat</th>
                <th style={thStyle}>Caddie</th>
                <th style={thStyle}>Rol</th>
                <th style={thStyle}>Activo</th>
                <th style={thStyle}>Notas</th>
              </tr>
            </thead>

            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={9}>
                    No hay asignaciones para este filtro.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => {
                  const tournament = tournamentMap.get(a.tournament_id) ?? null;
                  const entry = entryMap.get(a.entry_id) ?? null;
                  const caddie = caddieMap.get(a.caddie_id) ?? null;

                  return (
                    <tr key={a.id}>
                      <td style={tdStyle}>
                        {tournament ? displayTournamentName(tournament) : "—"}
                      </td>

                      <td style={tdStyle}>
                        {assignmentRoundLabel(a.round_id, roundsAll)}
                      </td>

                      <td style={tdStyle}>
                        {entry ? displayEntryPlayerName(entry) : "—"}
                      </td>

                      <td style={tdStyle}>{entry?.player_number ?? "—"}</td>

                      <td style={tdStyle}>
                        {entry ? displayEntryCategory(entry) : "—"}
                      </td>

                      <td style={tdStyle}>
                        {caddie ? displayCaddieName(caddie) : "—"}
                      </td>

                      <td style={tdStyle}>{a.role ?? "marker"}</td>

                      <td style={tdStyle}>
                        <span style={a.is_active !== false ? okBadge : warnBadge}>
                          {a.is_active !== false ? "Sí" : "No"}
                        </span>
                      </td>

                      <td style={tdStyle}>{a.notes?.trim() || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}