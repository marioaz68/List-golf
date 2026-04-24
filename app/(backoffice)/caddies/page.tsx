import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
  assignCaddieAction,
  deleteCaddieAssignmentAction,
} from "./actions";
import { createAdminClient } from "@/utils/supabase/admin";

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

type PairingGroupRow = {
  id: string;
  round_id: string;
  starting_hole: number | null;
  tee_time: string | null;
};

type PairingGroupMemberRow = {
  group_id: string;
  entry_id: string;
};

type CaddieRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp_phone: string | null;
  whatsapp_phone_e164: string | null;
  email: string | null;
  club_id: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  level: string | null;
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
  pairing_group_id: string | null;
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

const miniButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #1f2937",
  borderRadius: 8,
  background: "#111827",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const dangerButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #b91c1c",
  borderRadius: 8,
  background: "#b91c1c",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

const currentCaddieBoxStyle: React.CSSProperties = {
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "7px 9px",
  display: "grid",
  gap: 3,
  minWidth: 190,
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

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 190,
  height: 32,
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
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

const dotBlue: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#2563eb",
  border: "1px solid #1d4ed8",
  display: "inline-block",
};

const dotRed: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#dc2626",
  border: "1px solid #b91c1c",
  display: "inline-block",
};

const dotGreen: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#16a34a",
  border: "1px solid #15803d",
  display: "inline-block",
};

function getParam(sp: SP, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const onlyDate = value.slice(0, 10);
  const [y, m, d] = onlyDate.split("-");
  if (!y || !m || !d) return onlyDate;
  return `${d}/${m}/${y}`;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return value.slice(0, 5);
}

function displayTournamentName(t: TournamentRow) {
  return t.short_name?.trim() || t.name || "—";
}

function displayCaddieName(c: CaddieRow) {
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return full || "Sin nombre";
}

function displayCaddiePrimary(c: CaddieRow) {
  return c.nickname?.trim() || displayCaddieName(c);
}

function sortCaddiesByName(a: CaddieRow, b: CaddieRow) {
  return displayCaddiePrimary(a).localeCompare(displayCaddiePrimary(b), "es", {
    sensitivity: "base",
  });
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

function assignmentRoundLabel(roundId: string | null, rounds: RoundRow[]) {
  if (!roundId) return "Todas";
  const found = rounds.find((r) => r.id === roundId);
  if (!found) return "—";
  return `R${found.round_no ?? "?"}`;
}

function pairingGroupLabel(
  pairingGroupId: string | null,
  pairingGroups: PairingGroupRow[]
) {
  if (!pairingGroupId) return "—";
  const found = pairingGroups.find((g) => g.id === pairingGroupId);
  if (!found) return "—";

  const hole = found.starting_hole != null ? `H${found.starting_hole}` : "H?";
  const time = found.tee_time ? formatTime(found.tee_time) : "—";

  return `${hole} · ${time}`;
}

function renderLevelDot(level: string | null) {
  if (level === "advanced") {
    return <span style={dotBlue} title="Avanzado" />;
  }

  if (level === "intermediate") {
    return <span style={dotRed} title="Intermedio" />;
  }

  if (level === "beginner") {
    return <span style={dotGreen} title="Principiante" />;
  }

  return <span style={{ color: "#94a3b8" }}>—</span>;
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
  const supabaseAdmin = createAdminClient();

  const [
    tournamentsRes,
    roundsRes,
    pairingGroupsRes,
    pairingGroupMembersRes,
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
      .from("pairing_groups")
      .select("id, round_id, starting_hole, tee_time")
      .order("tee_time", { ascending: true }),
    supabase.from("pairing_group_members").select("group_id, entry_id"),
    supabase
      .from("caddies")
      .select(
        "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, notes, is_active, created_at, level"
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
    supabaseAdmin
      .from("caddie_assignments")
      .select(
        "id, tournament_id, entry_id, caddie_id, round_id, pairing_group_id, role, is_active, notes, created_at"
      )
      .order("created_at", { ascending: false }),
  ]);

  if (tournamentsRes.error) {
    throw new Error(`Error leyendo tournaments: ${tournamentsRes.error.message}`);
  }
  if (roundsRes.error) {
    throw new Error(`Error leyendo rounds: ${roundsRes.error.message}`);
  }
  if (pairingGroupsRes.error) {
    throw new Error(`Error leyendo pairing_groups: ${pairingGroupsRes.error.message}`);
  }
  if (pairingGroupMembersRes.error) {
    throw new Error(
      `Error leyendo pairing_group_members: ${pairingGroupMembersRes.error.message}`
    );
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
  const pairingGroupsAll = (pairingGroupsRes.data ?? []) as PairingGroupRow[];
  const pairingGroupMembersAll = (pairingGroupMembersRes.data ??
    []) as PairingGroupMemberRow[];
  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const entriesAll = (entriesRes.data ?? []) as EntryRow[];
  const assignmentsAll = (assignmentsRes.data ?? []) as CaddieAssignmentRow[];

  const selectedTournamentId = tournaments.some((t) => t.id === tournamentId)
    ? tournamentId
    : "";

  const rounds = selectedTournamentId
    ? roundsAll.filter((r) => r.tournament_id === selectedTournamentId)
    : roundsAll;

  const selectedRoundId = rounds.some((r) => r.id === roundId) ? roundId : "";

  const assignments = assignmentsAll.filter((a) => {
    if (selectedTournamentId && a.tournament_id !== selectedTournamentId) return false;
    if (selectedRoundId && a.round_id !== selectedRoundId) return false;
    return true;
  });

  const activeAssignmentsForView = assignments.filter((a) => a.is_active !== false);

  const caddieMap = new Map(caddies.map((c) => [c.id, c]));
  const entryMap = new Map(entriesAll.map((e) => [e.id, e]));
  const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));

  const activeCaddies = caddies.filter((c) => c.is_active !== false).length;
  const activeAssignments = assignmentsAll.filter((a) => a.is_active !== false).length;

  const groupedConflicts = new Map<string, number>();

  for (const a of assignmentsAll.filter(
    (x) => x.is_active !== false && x.pairing_group_id
  )) {
    const group = pairingGroupsAll.find((g) => g.id === a.pairing_group_id);
    if (!group?.tee_time) continue;
    const key = `${a.caddie_id}_${a.round_id ?? ""}_${group.tee_time}`;
    groupedConflicts.set(key, (groupedConflicts.get(key) ?? 0) + 1);
  }

  const conflictCount = Array.from(groupedConflicts.values()).filter((n) => n > 1).length;

  const currentAssignmentsByEntryRound = new Map<string, CaddieAssignmentRow>();
  for (const a of assignmentsAll.filter((x) => x.is_active !== false)) {
    const key = `${a.entry_id}_${a.round_id ?? ""}`;
    if (!currentAssignmentsByEntryRound.has(key)) {
      currentAssignmentsByEntryRound.set(key, a);
    }
  }

  const assignedCaddieIdsInSelectedRound = new Set(
    assignmentsAll
      .filter(
        (a) =>
          a.is_active !== false &&
          !!selectedRoundId &&
          a.round_id === selectedRoundId &&
          a.caddie_id
      )
      .map((a) => a.caddie_id)
  );

  const assignmentCandidates =
    selectedTournamentId && selectedRoundId
      ? pairingGroupMembersAll
          .map((member) => {
            const group = pairingGroupsAll.find((g) => g.id === member.group_id);
            if (!group || group.round_id !== selectedRoundId) return null;

            const entry = entriesAll.find(
              (e) => e.id === member.entry_id && e.tournament_id === selectedTournamentId
            );
            if (!entry) return null;

            const currentAssignment =
              currentAssignmentsByEntryRound.get(`${entry.id}_${selectedRoundId}`) ?? null;

            return {
              entry,
              group,
              currentAssignment,
              currentCaddie:
                currentAssignment?.caddie_id
                  ? caddieMap.get(currentAssignment.caddie_id) ?? null
                  : null,
            };
          })
          .filter(
            (
              row
            ): row is {
              entry: EntryRow;
              group: PairingGroupRow;
              currentAssignment: CaddieAssignmentRow | null;
              currentCaddie: CaddieRow | null;
            } => !!row
          )
          .sort((a, b) => {
            const aNum = a.entry.player_number ?? 999999;
            const bNum = b.entry.player_number ?? 999999;
            return aNum - bNum;
          })
      : [];

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>CADDIES</h1>
            <p style={subStyle}>Asignación operativa de caddies por torneo y ronda</p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/caddies/new" style={buttonStyle}>
              Alta / Catálogo
            </Link>
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
            <p style={statLabelStyle}>Conflictos grupo</p>
            <p style={statValueStyle}>{conflictCount}</p>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>ASIGNAR CADDIE POR RONDA</h2>
            <p style={subStyle}>
              Los caddies ya usados en esta ronda se ocultan del selector.
            </p>
          </div>
        </div>

        {!selectedTournamentId || !selectedRoundId ? (
          <div style={{ padding: 12, fontSize: 12, color: "#475569" }}>
            Primero selecciona <strong>torneo</strong> y <strong>ronda</strong>.
          </div>
        ) : assignmentCandidates.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: "#475569" }}>
            No hay jugadores con grupo asignado en esa ronda.
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Jugador</th>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Cat</th>
                  <th style={thStyle}>Grupo</th>
                  <th style={thStyle}>Caddie actual</th>
                  <th style={thStyle}>Asignar</th>
                </tr>
              </thead>

              <tbody>
                {assignmentCandidates.map((row) => {
                  const availableCaddies = caddies
                    .filter((c) => {
                      if (c.is_active === false) return false;
                      if (row.currentCaddie?.id === c.id) return true;
                      return !assignedCaddieIdsInSelectedRound.has(c.id);
                    })
                    .sort((a, b) => {
                      if (row.currentCaddie?.id === a.id) return -1;
                      if (row.currentCaddie?.id === b.id) return 1;
                      return sortCaddiesByName(a, b);
                    });

                  return (
                    <tr key={`${row.entry.id}_${row.group.id}`}>
                      <td style={tdStyle}>{displayEntryPlayerName(row.entry)}</td>
                      <td style={tdStyle}>{row.entry.player_number ?? "—"}</td>
                      <td style={tdStyle}>{displayEntryCategory(row.entry)}</td>
                      <td style={tdStyle}>{pairingGroupLabel(row.group.id, pairingGroupsAll)}</td>
                      <td style={tdStyle}>
                        {row.currentCaddie ? (
                          <div style={currentCaddieBoxStyle}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 800,
                              }}
                            >
                              {renderLevelDot(row.currentCaddie.level)}
                              <span>{displayCaddiePrimary(row.currentCaddie)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#475569" }}>
                              Ya asignado · {displayCaddieName(row.currentCaddie)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#64748b" }}>Sin asignar</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <form
                          action={assignCaddieAction}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <input type="hidden" name="tournament_id" value={selectedTournamentId} />
                          <input type="hidden" name="entry_id" value={row.entry.id} />
                          <input type="hidden" name="round_id" value={selectedRoundId} />
                          <input type="hidden" name="pairing_group_id" value={row.group.id} />

                          <select
                            name="caddie_id"
                            defaultValue={row.currentCaddie?.id ?? ""}
                            style={selectStyle}
                          >
                            <option value="">Selecciona caddie</option>
                            {availableCaddies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {row.currentCaddie?.id === c.id ? "ACTUAL · " : ""}
                                {displayCaddiePrimary(c)}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </option>
                            ))}
                          </select>

                          <button type="submit" style={miniButtonStyle}>
                            Guardar
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>ASIGNACIONES</h2>
            <p style={subStyle}>
              Solo se muestran asignaciones activas. Quitar conserva historial.
            </p>
          </div>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Torneo</th>
                <th style={thStyle}>Ronda</th>
                <th style={thStyle}>Grupo</th>
                <th style={thStyle}>Jugador</th>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Cat</th>
                <th style={thStyle}>Caddie</th>
                <th style={thStyle}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {activeAssignmentsForView.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={8}>
                    No hay asignaciones activas para este filtro.
                  </td>
                </tr>
              ) : (
                activeAssignmentsForView.map((a) => {
                  const tournament = tournamentMap.get(a.tournament_id) ?? null;
                  const entry = entryMap.get(a.entry_id) ?? null;
                  const caddie = caddieMap.get(a.caddie_id) ?? null;

                  return (
                    <tr key={a.id}>
                      <td style={tdStyle}>
                        {tournament ? displayTournamentName(tournament) : "—"}
                      </td>
                      <td style={tdStyle}>{assignmentRoundLabel(a.round_id, roundsAll)}</td>
                      <td style={tdStyle}>
                        {pairingGroupLabel(a.pairing_group_id, pairingGroupsAll)}
                      </td>
                      <td style={tdStyle}>{entry ? displayEntryPlayerName(entry) : "—"}</td>
                      <td style={tdStyle}>{entry?.player_number ?? "—"}</td>
                      <td style={tdStyle}>{entry ? displayEntryCategory(entry) : "—"}</td>
                      <td style={tdStyle}>
                        {caddie ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 700,
                              }}
                            >
                              {renderLevelDot(caddie.level)}
                              <span>{displayCaddiePrimary(caddie)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {displayCaddieName(caddie)}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={tdStyle}>
                        <form action={deleteCaddieAssignmentAction}>
                          <input type="hidden" name="assignment_id" value={a.id} />
                          <input
                            type="hidden"
                            name="tournament_id"
                            value={selectedTournamentId}
                          />
                          <input type="hidden" name="round_id" value={selectedRoundId} />

                          <button type="submit" style={dangerButtonStyle}>
                            Quitar
                          </button>
                        </form>
                      </td>
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