import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createUserAction } from "./actions";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubRow = {
  id: string;
  name: string;
};

type RoleRow = {
  id: string;
  code: string;
  name: string;
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
  letterSpacing: 0.2,
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  margin: "2px 0 0 0",
};

const sectionBody: React.CSSProperties = {
  padding: 12,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fullRow: React.CSSProperties = {
  gridColumn: "1 / -1",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.4,
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
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

const helpTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 2,
  lineHeight: 1.35,
};

const actionsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  paddingTop: 4,
};

const buttonPrimary: React.CSSProperties = {
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

const buttonSecondary: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

export default async function NewUserPage() {
  await requireSuperAdmin();

  const supabase = await createClient();

  const [{ data: clubs, error: clubsError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from("clubs").select("id, name").order("name"),
      supabase.from("roles").select("id, code, name").order("name"),
    ]);

  if (clubsError) {
    return <div style={{ padding: 20 }}>Error cargando clubs: {clubsError.message}</div>;
  }

  if (rolesError) {
    return <div style={{ padding: 20 }}>Error cargando roles: {rolesError.message}</div>;
  }

  const typedClubs = (clubs ?? []) as ClubRow[];
  const typedRoles = (roles ?? []) as RoleRow[];

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>NUEVO USUARIO</h1>
            <p style={subStyle}>Crear usuario de acceso al sistema</p>
          </div>
        </div>

        <div style={sectionBody}>
          <form action={createUserAction} style={formGrid}>
            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="first_name">
                Nombre
              </label>
              <input id="first_name" name="first_name" type="text" style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="last_name">
                Apellido
              </label>
              <input id="last_name" name="last_name" type="text" style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" required style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="password">
                Password temporal
              </label>
              <input id="password" name="password" type="text" required style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="club_id">
                Club
              </label>
              <select id="club_id" name="club_id" defaultValue="" style={selectStyle}>
                <option value="">Sin asignar</option>
                {typedClubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
              <div style={helpTextStyle}>
                Selecciona un club solo si el usuario tendrá un rol operativo en ese club.
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle} htmlFor="role_id">
                Rol por club
              </label>
              <select id="role_id" name="role_id" defaultValue="" style={selectStyle}>
                <option value="">Sin asignar</option>
                {typedRoles
                  .filter((role) => role.code !== "super_admin")
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
              <div style={helpTextStyle}>
                El rol por club es opcional. El rol global de Super Admin se administra por separado.
              </div>
            </div>

            <div style={{ ...fieldWrap, ...fullRow, maxWidth: 220 }}>
              <label style={labelStyle} htmlFor="is_active">
                Estado
              </label>
              <select id="is_active" name="is_active" defaultValue="true" style={selectStyle}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>

            <div style={{ ...actionsRow, ...fullRow }}>
              <button type="submit" style={buttonPrimary}>
                Crear usuario
              </button>

              <Link href="/users" style={buttonSecondary}>
                Volver
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}