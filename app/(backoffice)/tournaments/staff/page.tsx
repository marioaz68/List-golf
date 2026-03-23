import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import {
  assignTournamentRoleAction,
  removeTournamentRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type RoleRow = {
  id: string;
  code: string;
  name: string;
};

type TournamentRoleRow = {
  id: string;
  user_id: string;
  tournament_id: string;
  role_id: string;
  is_active: boolean;
  profiles: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  roles: {
    id: string;
    code: string;
    name: string;
  } | null;
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

const sectionBody: React.CSSProperties = {
  padding: 12,
};

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 12,
  width: "100%",
  background: "#fff",
  color: "#0f172a",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
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
};

const dangerButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  border: "1px solid #fecaca",
  color: "#991b1b",
  background: "#fff7f7",
};

const filterRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 420px) auto",
  gap: 10,
  alignItems: "center",
};

const assignGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 110px",
  gap: 8,
  alignItems: "center",
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
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
};

const roleBadge = (code?: string | null): React.CSSProperties => {
  if (code === "tournament_director") {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 800,
      border: "1px solid #bfdbfe",
      background: "#eff6ff",
      color: "#1d4ed8",
    };
  }

  if (code === "score_capture") {
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

  if (code === "checkin") {
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
    fontWeight: 700,
    border: "1px solid #dbe2ea",
    background: "#f8fafc",
    color: "#334155",
  };
};

function fullName(p: ProfileRow | TournamentRoleRow["profiles"] | null) {
  if (!p) return "Usuario";
  return (
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    p.email ||
    "Sin nombre"
  );
}

export default async function TournamentStaffPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const sp = searchParams ? await searchParams : {};
  const rawTournamentId = Array.isArray(sp.tournament_id)
    ? sp.tournament_id[0]
    : sp.tournament_id;
  const selectedTournamentId = String(rawTournamentId ?? "").trim();

  const supabase = await createClient();

  const [
    { data: tournaments, error: tournamentsError },
    { data: profiles, error: profilesError },
    { data: roles, error: rolesError },
  ] = await Promise.all([
    supabase.from("tournaments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .order("first_name"),
    supabase
      .from("roles")
      .select("id, code, name")
      .in("code", ["tournament_director", "score_capture", "checkin", "viewer"])
      .order("name"),
  ]);

  if (tournamentsError) {
    return <div style={pageWrap}>Error cargando torneos: {tournamentsError.message}</div>;
  }

  if (profilesError) {
    return <div style={pageWrap}>Error cargando usuarios: {profilesError.message}</div>;
  }

  if (rolesError) {
    return <div style={pageWrap}>Error cargando roles: {rolesError.message}</div>;
  }

  const typedTournaments = (tournaments ?? []) as TournamentRow[];
  const typedProfiles = (profiles ?? []) as ProfileRow[];
  const typedRoles = (roles ?? []) as RoleRow[];

  const effectiveTournamentId = selectedTournamentId || typedTournaments[0]?.id || "";

  if (!selectedTournamentId && effectiveTournamentId) {
    redirect(`/tournaments/staff?tournament_id=${effectiveTournamentId}`);
  }

  if (effectiveTournamentId) {
    await requireTournamentAccess({
      tournamentId: effectiveTournamentId,
      allowedRoles: ["super_admin", "club_admin", "tournament_director"],
    });
  }

  const selectedTournament =
    typedTournaments.find((t) => t.id === effectiveTournamentId) ?? null;

  const { data: staffRows, error: staffError } = effectiveTournamentId
    ? await supabase
        .from("user_tournament_roles")
        .select(
          `
          id,
          user_id,
          tournament_id,
          role_id,
          is_active,
          profiles:user_id (
            id,
            first_name,
            last_name,
            email
          ),
          roles:role_id (
            id,
            code,
            name
          )
        `
        )
        .eq("tournament_id", effectiveTournamentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (staffError) {
    return <div style={pageWrap}>Error cargando staff del torneo: {staffError.message}</div>;
  }

  const typedStaffRows = (staffRows ?? []) as TournamentRoleRow[];

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>STAFF DE TORNEOS</h1>
            <p style={subStyle}>Asignación de usuarios y roles por torneo</p>
          </div>

          <Link
            href="/tournaments"
            style={{
              height: 32,
              padding: "0 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#fff",
              color: "#0f172a",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Volver
          </Link>
        </div>

        <div style={sectionBody}>
          <form method="get" style={filterRow}>
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              style={selectStyle}
            >
              <option value="">Selecciona torneo...</option>
              {typedTournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? "Sin nombre"}
                </option>
              ))}
            </select>

            <button type="submit" style={buttonStyle}>
              Cargar
            </button>
          </form>
        </div>
      </div>

      {effectiveTournamentId ? (
        <>
          <div style={cardStyle}>
            <div style={cardHeader}>
              <div>
                <h2 style={titleStyle}>ASIGNAR STAFF</h2>
                <p style={subStyle}>
                  {selectedTournament?.name ?? "Torneo seleccionado"}
                </p>
              </div>
            </div>

            <div style={sectionBody}>
              <form action={assignTournamentRoleAction} style={assignGrid}>
                <input
                  type="hidden"
                  name="tournament_id"
                  value={effectiveTournamentId}
                />

                <select name="user_id" defaultValue="" style={selectStyle} required>
                  <option value="">Usuario...</option>
                  {typedProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)}
                      {p.email ? ` · ${p.email}` : ""}
                    </option>
                  ))}
                </select>

                <select name="role_id" defaultValue="" style={selectStyle} required>
                  <option value="">Rol...</option>
                  {typedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <button type="submit" style={buttonStyle}>
                  Asignar
                </button>
              </form>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={cardHeader}>
              <div>
                <h2 style={titleStyle}>STAFF ASIGNADO</h2>
                <p style={subStyle}>{typedStaffRows.length} registro(s)</p>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Usuario</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Rol</th>
                    <th style={thStyle}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {typedStaffRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={tdStyle}>
                        No hay staff asignado para este torneo.
                      </td>
                    </tr>
                  ) : (
                    typedStaffRows.map((row) => (
                      <tr key={row.id}>
                        <td style={tdStyle}>{fullName(row.profiles)}</td>
                        <td style={tdStyle}>{row.profiles?.email ?? "-"}</td>
                        <td style={tdStyle}>
                          <span style={roleBadge(row.roles?.code)}>
                            {row.roles?.name ?? "Rol"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <form action={removeTournamentRoleAction}>
                            <input type="hidden" name="relation_id" value={row.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={effectiveTournamentId}
                            />
                            <button type="submit" style={dangerButtonStyle}>
                              Quitar
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div style={cardStyle}>
          <div style={sectionBody}>
            Selecciona un torneo para administrar su staff.
          </div>
        </div>
      )}
    </div>
  );
}