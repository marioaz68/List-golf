import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
  updateProfileAction,
  assignUserClubRoleAction,
  removeUserClubRoleAction,
  assignUserTournamentRoleAction,
  removeUserTournamentRoleAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
};

type ClubRoleRow = {
  id: string;
  user_id: string;
  club_id: string;
  role_id: string;
  is_active: boolean | null;
  roles: { code: string | null; name: string | null } | null;
};

type TournamentRoleRow = {
  id: string;
  user_id: string;
  tournament_id: string;
  role_id: string;
  is_active: boolean | null;
  roles: { code: string | null; name: string | null } | null;
};

type RoleOption = {
  id: string;
  code: string | null;
  name: string | null;
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
  verticalAlign: "top",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 120,
  height: 30,
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 150,
  height: 30,
  padding: "0 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 12,
  background: "#fff",
  color: "#0f172a",
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

const ghostMiniButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
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

function fullName(u: UserRow) {
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return name || "Sin nombre";
}

function extractRoleCode(roleValue: any): string | null {
  if (!roleValue) return null;
  if (Array.isArray(roleValue)) return roleValue[0]?.code ?? null;
  return roleValue.code ?? null;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const tournamentId = String(sp.tournament_id ?? "").trim();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <div style={pageWrap}>
        <div style={cardStyle}>
          <div style={{ padding: 12, color: "#991b1b", fontSize: 12 }}>
            No autenticado.
          </div>
        </div>
      </div>
    );
  }

  let tournamentName: string | null = null;
  let contextClubId: string | null = null;

  if (tournamentId) {
    const { data: tournamentData } = await supabase
      .from("tournaments")
      .select("id, name, club_id")
      .eq("id", tournamentId)
      .single();

    tournamentName = tournamentData?.name ?? null;
    contextClubId = tournamentData?.club_id ?? null;
  }

  const { data: globalRoles } = await supabase
    .from("user_global_roles")
    .select("roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin =
    (globalRoles ?? []).some((r: any) => extractRoleCode(r.roles) === "super_admin");

  const { data: clubRolesForCurrentUser } = await supabase
    .from("user_club_roles")
    .select("club_id, roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedClubIds = new Set<string>(
    (clubRolesForCurrentUser ?? [])
      .filter((r: any) => extractRoleCode(r.roles) === "club_admin")
      .map((r: any) => r.club_id)
      .filter(Boolean)
  );

  const isClubAdmin = allowedClubIds.size > 0;

  const { data: tournamentRolesForCurrentUser } = await supabase
    .from("user_tournament_roles")
    .select("tournament_id, roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedTournamentIds = new Set<string>(
    (tournamentRolesForCurrentUser ?? [])
      .filter((r: any) => extractRoleCode(r.roles) === "tournament_director")
      .map((r: any) => r.tournament_id)
      .filter(Boolean)
  );

  const isTournamentDirector = allowedTournamentIds.size > 0;

  const canManageThisPage =
    isSuperAdmin ||
    isClubAdmin ||
    (tournamentId ? allowedTournamentIds.has(tournamentId) : false);

  if (!canManageThisPage) {
    return (
      <div style={pageWrap}>
        <div style={cardStyle}>
          <div style={{ padding: 12, color: "#991b1b", fontSize: 12 }}>
            No tienes permisos para administrar usuarios en este contexto.
          </div>
        </div>
      </div>
    );
  }

  let visibleUserIds: string[] | null = null;

  if (isSuperAdmin) {
    visibleUserIds = null;
  } else {
    const userIdSet = new Set<string>();
    userIdSet.add(user.id);

    if (allowedClubIds.size > 0) {
      const clubIds = Array.from(allowedClubIds);

      const { data: scopedClubUsers } = await supabase
        .from("user_club_roles")
        .select("user_id, club_id")
        .in("club_id", clubIds)
        .eq("is_active", true);

      for (const row of scopedClubUsers ?? []) {
        if (row.user_id) userIdSet.add(row.user_id);
      }

      const { data: clubTournaments } = await supabase
        .from("tournaments")
        .select("id, club_id")
        .in("club_id", clubIds);

      const clubTournamentIds = (clubTournaments ?? [])
        .map((t: any) => t.id)
        .filter(Boolean);

      if (clubTournamentIds.length > 0) {
        const { data: scopedTournamentUsers } = await supabase
          .from("user_tournament_roles")
          .select("user_id, tournament_id")
          .in("tournament_id", clubTournamentIds)
          .eq("is_active", true);

        for (const row of scopedTournamentUsers ?? []) {
          if (row.user_id) userIdSet.add(row.user_id);
        }
      }
    }

    if (tournamentId && allowedTournamentIds.has(tournamentId)) {
      const { data: scopedTournamentUsers } = await supabase
        .from("user_tournament_roles")
        .select("user_id")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true);

      for (const row of scopedTournamentUsers ?? []) {
        if (row.user_id) userIdSet.add(row.user_id);
      }
    }

    visibleUserIds = Array.from(userIdSet);
  }

  let profilesQuery = supabase
    .from("profiles")
    .select("id, email, first_name, last_name, is_active")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (visibleUserIds && visibleUserIds.length === 0) {
    profilesQuery = supabase
      .from("profiles")
      .select("id, email, first_name, last_name, is_active")
      .eq("id", "__none__");
  } else if (visibleUserIds) {
    profilesQuery = profilesQuery.in("id", visibleUserIds);
  }

  const { data: users, error: usersError } = await profilesQuery;

  const userIds = (users ?? []).map((u: any) => u.id);

  const { data: visibleGlobalRoleRows } = userIds.length
    ? await supabase
        .from("user_global_roles")
        .select("user_id, roles:role_id(code)")
        .in("user_id", userIds)
        .eq("is_active", true)
    : { data: [] as any[] };

  const { data: visibleClubRoleRowsForFilter } = userIds.length
    ? await supabase
        .from("user_club_roles")
        .select("user_id, club_id, roles:role_id(code)")
        .in("user_id", userIds)
        .eq("is_active", true)
    : { data: [] as any[] };

  const { data: visibleTournamentRoleRowsForFilter } = userIds.length
    ? await supabase
        .from("user_tournament_roles")
        .select("user_id, tournament_id, roles:role_id(code)")
        .in("user_id", userIds)
        .eq("is_active", true)
    : { data: [] as any[] };

  const roleMap = new Map<
    string,
    {
      global: Set<string>;
      club: Set<string>;
      tournament: Set<string>;
    }
  >();

  function ensureRoleBucket(id: string) {
    let bucket = roleMap.get(id);
    if (!bucket) {
      bucket = {
        global: new Set<string>(),
        club: new Set<string>(),
        tournament: new Set<string>(),
      };
      roleMap.set(id, bucket);
    }
    return bucket;
  }

  for (const row of visibleGlobalRoleRows ?? []) {
    const code = extractRoleCode((row as any).roles);
    if ((row as any).user_id && code) {
      ensureRoleBucket((row as any).user_id).global.add(code);
    }
  }

  for (const row of visibleClubRoleRowsForFilter ?? []) {
    const code = extractRoleCode((row as any).roles);
    if ((row as any).user_id && code) {
      ensureRoleBucket((row as any).user_id).club.add(code);
    }
  }

  for (const row of visibleTournamentRoleRowsForFilter ?? []) {
    const code = extractRoleCode((row as any).roles);
    if ((row as any).user_id && code) {
      ensureRoleBucket((row as any).user_id).tournament.add(code);
    }
  }

  const filteredUsers: UserRow[] = isSuperAdmin
    ? (users ?? [])
    : isClubAdmin
      ? (users ?? []).filter((u: UserRow) => {
          if (u.id === user.id) return true;

          const roles = roleMap.get(u.id);
          if (!roles) return false;

          const isTargetSuperAdmin = roles.global.has("super_admin");
          const isTargetClubAdmin = roles.club.has("club_admin");

          return !isTargetSuperAdmin && !isTargetClubAdmin;
        })
      : (users ?? []).filter((u: UserRow) => {
          if (u.id === user.id) return true;

          if (!tournamentId) return false;

          const roles = roleMap.get(u.id);
          if (!roles) return false;

          const isTargetSuperAdmin = roles.global.has("super_admin");
          const isTargetClubAdmin = roles.club.has("club_admin");
          const isTargetTournamentDirector = roles.tournament.has("tournament_director");

          return !isTargetSuperAdmin && !isTargetClubAdmin && !isTargetTournamentDirector;
        });

  const filteredUserIds = filteredUsers.map((u) => u.id);

  const { data: clubRoleRows } = filteredUserIds.length
    ? await supabase
        .from("user_club_roles")
        .select("id, user_id, club_id, role_id, is_active, roles(name, code)")
        .in("user_id", filteredUserIds)
        .eq("is_active", true)
    : { data: [] as ClubRoleRow[] };

  const { data: tournamentRoleRows } = filteredUserIds.length
    ? await supabase
        .from("user_tournament_roles")
        .select("id, user_id, tournament_id, role_id, is_active, roles(name, code)")
        .in("user_id", filteredUserIds)
        .eq("is_active", true)
    : { data: [] as TournamentRoleRow[] };

  const clubRolesByUser = new Map<string, ClubRoleRow[]>();
  const tournamentRolesByUser = new Map<string, TournamentRoleRow[]>();

  for (const row of (clubRoleRows ?? []) as any[]) {
    const list = clubRolesByUser.get(row.user_id) ?? [];
    list.push(row);
    clubRolesByUser.set(row.user_id, list);
  }

  for (const row of (tournamentRoleRows ?? []) as any[]) {
    const list = tournamentRolesByUser.get(row.user_id) ?? [];
    list.push(row);
    tournamentRolesByUser.set(row.user_id, list);
  }

  const canAssignClubRoles = isSuperAdmin;
  const canAssignTournamentRoles = isSuperAdmin || isClubAdmin || isTournamentDirector;

  const clubRoleCodes = isSuperAdmin ? ["club_admin"] : [];
  const tournamentRoleCodes = isSuperAdmin
    ? ["tournament_director", "score_capture", "checkin", "viewer"]
    : isClubAdmin
      ? ["tournament_director", "score_capture", "checkin", "viewer"]
      : ["score_capture", "checkin", "viewer"];

  const { data: clubRoleOptions } = clubRoleCodes.length
    ? await supabase
        .from("roles")
        .select("id, code, name")
        .in("code", clubRoleCodes)
        .order("name", { ascending: true })
    : { data: [] as RoleOption[] };

  const { data: tournamentRoleOptions } = tournamentRoleCodes.length
    ? await supabase
        .from("roles")
        .select("id, code, name")
        .in("code", tournamentRoleCodes)
        .order("name", { ascending: true })
    : { data: [] as RoleOption[] };

  const newUserHref = tournamentId
    ? `/users/new?tournament_id=${tournamentId}`
    : "/users/new";

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>USUARIOS</h1>
            <p style={subStyle}>
              {tournamentId
                ? `Administración de usuarios${tournamentName ? ` · ${tournamentName}` : ""}`
                : isSuperAdmin
                  ? "Administración de usuarios del sistema"
                  : "Administración de usuarios por alcance"}
            </p>
          </div>

          <Link href={newUserHref} style={buttonStyle}>
            Nuevo usuario
          </Link>
        </div>

        {usersError ? (
          <div style={{ padding: 12, color: "#991b1b", fontSize: 12 }}>
            Error cargando usuarios: {usersError.message}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Usuario</th>
                  <th style={thStyle}>Datos</th>
                  <th style={thStyle}>Activo</th>
                  <th style={thStyle}>Permisos club</th>
                  <th style={thStyle}>Permisos torneo</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={tdStyle}>
                      No hay usuarios visibles para este contexto.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u: UserRow) => {
                    const clubRoles = clubRolesByUser.get(u.id) ?? [];
                    const tournamentRoles = tournamentRolesByUser.get(u.id) ?? [];

                    const filteredTournamentRoles = tournamentId
                      ? tournamentRoles.filter((r) => r.tournament_id === tournamentId)
                      : tournamentRoles;

                    return (
                      <tr key={u.id}>
                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontWeight: 700 }}>{fullName(u)}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {u.email ?? "-"}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {u.id}
                            </div>
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <form
                            action={updateProfileAction}
                            style={{ display: "grid", gap: 8, minWidth: 220 }}
                          >
                            <input type="hidden" name="profile_id" value={u.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />

                            <input
                              name="first_name"
                              defaultValue={u.first_name ?? ""}
                              placeholder="Nombre"
                              style={inputStyle}
                            />

                            <input
                              name="last_name"
                              defaultValue={u.last_name ?? ""}
                              placeholder="Apellidos"
                              style={inputStyle}
                            />

                            <select
                              name="is_active"
                              defaultValue={u.is_active ? "true" : "false"}
                              style={selectStyle}
                            >
                              <option value="true">Activo</option>
                              <option value="false">Inactivo</option>
                            </select>

                            <button type="submit" style={miniButtonStyle}>
                              Guardar datos
                            </button>
                          </form>
                        </td>

                        <td style={tdStyle}>
                          <span style={u.is_active ? okBadge : warnBadge}>
                            {u.is_active ? "Sí" : "No"}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
                            {clubRoles.length === 0 ? (
                              <div style={{ fontSize: 11, color: "#64748b" }}>
                                Sin permisos de club
                              </div>
                            ) : (
                              clubRoles.map((r) => (
                                <form
                                  key={r.id}
                                  action={removeUserClubRoleAction}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <input
                                    type="hidden"
                                    name="relation_id"
                                    value={r.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="tournament_id"
                                    value={tournamentId}
                                  />
                                  <span style={okBadge}>
                                    {r.roles?.name ?? r.roles?.code ?? "Rol"}
                                  </span>
                                  {canAssignClubRoles ? (
                                    <button type="submit" style={ghostMiniButtonStyle}>
                                      Quitar
                                    </button>
                                  ) : null}
                                </form>
                              ))
                            )}

                            {canAssignClubRoles && contextClubId && (
                              <form
                                action={assignUserClubRoleAction}
                                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                              >
                                <input type="hidden" name="profile_id" value={u.id} />
                                <input type="hidden" name="club_id" value={contextClubId} />
                                <input
                                  type="hidden"
                                  name="tournament_id"
                                  value={tournamentId}
                                />

                                <select name="role_id" style={selectStyle} defaultValue="">
                                  <option value="">Agregar rol club</option>
                                  {(clubRoleOptions ?? []).map((role: RoleOption) => (
                                    <option key={role.id} value={role.id}>
                                      {role.name ?? role.code ?? role.id}
                                    </option>
                                  ))}
                                </select>

                                <button type="submit" style={miniButtonStyle}>
                                  Agregar
                                </button>
                              </form>
                            )}

                            {!canAssignClubRoles && (
                              <div style={{ fontSize: 11, color: "#64748b" }}>
                                Solo super admin puede asignar roles de club.
                              </div>
                            )}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
                            {tournamentId ? (
                              <>
                                {filteredTournamentRoles.length === 0 ? (
                                  <div style={{ fontSize: 11, color: "#64748b" }}>
                                    Sin permisos de torneo
                                  </div>
                                ) : (
                                  filteredTournamentRoles.map((r) => (
                                    <form
                                      key={r.id}
                                      action={removeUserTournamentRoleAction}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <input
                                        type="hidden"
                                        name="relation_id"
                                        value={r.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="tournament_id"
                                        value={tournamentId}
                                      />
                                      <span style={okBadge}>
                                        {r.roles?.name ?? r.roles?.code ?? "Rol"}
                                      </span>
                                      {canAssignTournamentRoles ? (
                                        <button
                                          type="submit"
                                          style={ghostMiniButtonStyle}
                                        >
                                          Quitar
                                        </button>
                                      ) : null}
                                    </form>
                                  ))
                                )}

                                {canAssignTournamentRoles && (
                                  <form
                                    action={assignUserTournamentRoleAction}
                                    style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                                  >
                                    <input type="hidden" name="profile_id" value={u.id} />
                                    <input
                                      type="hidden"
                                      name="tournament_id"
                                      value={tournamentId}
                                    />

                                    <select name="role_id" style={selectStyle} defaultValue="">
                                      <option value="">Agregar rol torneo</option>
                                      {(tournamentRoleOptions ?? []).map((role: RoleOption) => (
                                        <option key={role.id} value={role.id}>
                                          {role.name ?? role.code ?? role.id}
                                        </option>
                                      ))}
                                    </select>

                                    <button type="submit" style={miniButtonStyle}>
                                      Agregar
                                    </button>
                                  </form>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: "#64748b" }}>
                                Abre esta pantalla desde un torneo para administrar permisos de torneo.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}