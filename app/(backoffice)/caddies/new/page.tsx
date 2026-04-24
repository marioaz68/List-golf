import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createCaddieAction } from "./actions";
import {
  activateCaddieAction,
  deactivateCaddieAction,
  deleteCaddieAction,
} from "../actions";
import SubmitButton from "./SubmitButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active?: boolean | null;
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

const formStyle: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 12,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 10,
};

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 88,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  resize: "vertical",
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

const warnButtonStyle: React.CSSProperties = {
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

const lockedButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f8fafc",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 700,
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

function displayClubName(c: ClubRow) {
  return c.short_name?.trim() || c.name || "Club";
}

function displayClubById(clubId: string | null, clubs: ClubRow[]) {
  if (!clubId) return "—";
  const found = clubs.find((c) => c.id === clubId);
  if (!found) return "—";
  return displayClubName(found);
}

function displayCaddieName(c: CaddieRow) {
  const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return full || "Sin nombre";
}

function displayCaddiePrimary(c: CaddieRow) {
  return c.nickname?.trim() || displayCaddieName(c);
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

export default async function NewCaddiePage() {
  const supabase = await createClient();

  const [clubsRes, caddiesRes, assignmentCountsRes] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, short_name, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("caddies")
      .select(
        "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, notes, is_active, created_at, level"
      )
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),
    supabase.from("caddie_assignments").select("id, caddie_id"),
  ]);

  if (clubsRes.error) {
    throw new Error(`Error leyendo clubs: ${clubsRes.error.message}`);
  }

  if (caddiesRes.error) {
    throw new Error(`Error leyendo caddies: ${caddiesRes.error.message}`);
  }

  if (assignmentCountsRes.error) {
    throw new Error(
      `Error leyendo conteo de asignaciones: ${assignmentCountsRes.error.message}`
    );
  }

  const clubs = (clubsRes.data ?? []) as ClubRow[];
  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const assignmentCountRows = (assignmentCountsRes.data ?? []) as {
    id: string;
    caddie_id: string;
  }[];

  const assignmentCountByCaddie = new Map<string, number>();
  for (const row of assignmentCountRows) {
    assignmentCountByCaddie.set(
      row.caddie_id,
      (assignmentCountByCaddie.get(row.caddie_id) ?? 0) + 1
    );
  }

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>NUEVO CADDIE</h1>
            <p style={subStyle}>
              Alta de caddie con teléfono, Telegram, club y nivel operativo
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/caddies" style={ghostButtonStyle}>
              Volver a asignaciones
            </Link>
          </div>
        </div>

        <form action={createCaddieAction} style={formStyle}>
          <div style={gridStyle}>
            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="first_name" style={labelStyle}>
                Nombre
              </label>
              <input
                id="first_name"
                name="first_name"
                required
                style={fieldStyle}
                placeholder="Nombre"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="last_name" style={labelStyle}>
                Apellido
              </label>
              <input
                id="last_name"
                name="last_name"
                required
                style={fieldStyle}
                placeholder="Apellido"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="nickname" style={labelStyle}>
                Apodo / Nickname
              </label>
              <input
                id="nickname"
                name="nickname"
                style={fieldStyle}
                placeholder="Ej. Chino / Flaco / Junior"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="level" style={labelStyle}>
                Nivel
              </label>
              <select id="level" name="level" defaultValue="" style={fieldStyle}>
                <option value="">Sin nivel</option>
                <option value="advanced">Azul · Avanzado</option>
                <option value="intermediate">Rojo · Intermedio</option>
                <option value="beginner">Verde · Principiante</option>
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="phone" style={labelStyle}>
                Teléfono
              </label>
              <input id="phone" name="phone" style={fieldStyle} placeholder="442..." />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="telegram" style={labelStyle}>
                Telegram
              </label>
              <input
                id="telegram"
                name="telegram"
                style={fieldStyle}
                placeholder="@usuario o teléfono"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="whatsapp_phone" style={labelStyle}>
                WhatsApp
              </label>
              <input
                id="whatsapp_phone"
                name="whatsapp_phone"
                style={fieldStyle}
                placeholder="442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="whatsapp_phone_e164" style={labelStyle}>
                WhatsApp E164
              </label>
              <input
                id="whatsapp_phone_e164"
                name="whatsapp_phone_e164"
                style={fieldStyle}
                placeholder="+52442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="email" style={labelStyle}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                style={fieldStyle}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="club_id" style={labelStyle}>
                Club
              </label>
              <select id="club_id" name="club_id" defaultValue="" style={fieldStyle}>
                <option value="">Sin club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {displayClubName(club)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 12" }}>
              <label htmlFor="notes" style={labelStyle}>
                Notas
              </label>
              <textarea
                id="notes"
                name="notes"
                style={textareaStyle}
                placeholder="Notas operativas del caddie"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SubmitButton />

            <Link href="/caddies" style={ghostButtonStyle}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={titleStyle}>CATÁLOGO DE CADDIES</h2>
            <p style={subStyle}>
              Alta, baja, reactivación y eliminación de caddies sin historial.
            </p>
          </div>

          <Link href="/caddies" style={buttonStyle}>
            Ir a asignaciones
          </Link>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Caddie</th>
                <th style={thStyle}>Nivel</th>
                <th style={thStyle}>Activo</th>
                <th style={thStyle}>Teléfono</th>
                <th style={thStyle}>Telegram</th>
                <th style={thStyle}>WhatsApp</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Club</th>
                <th style={thStyle}>Asigs</th>
                <th style={thStyle}>Notas</th>
                <th style={thStyle}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {caddies.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={11}>
                    No hay caddies registrados.
                  </td>
                </tr>
              ) : (
                caddies.map((c) => {
                  const assignmentCount = assignmentCountByCaddie.get(c.id) ?? 0;
                  const canDelete = assignmentCount === 0;

                  return (
                    <tr key={c.id}>
                      <td style={tdStyle}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong>{displayCaddiePrimary(c)}</strong>
                          <span style={{ fontSize: 11, color: "#64748b" }}>
                            {displayCaddieName(c)}
                          </span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{c.id}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>{renderLevelDot(c.level)}</td>

                      <td style={tdStyle}>
                        <span style={c.is_active !== false ? okBadge : warnBadge}>
                          {c.is_active !== false ? "Sí" : "No"}
                        </span>
                      </td>

                      <td style={tdStyle}>{c.phone ?? "—"}</td>
                      <td style={tdStyle}>{c.telegram ?? "—"}</td>
                      <td style={tdStyle}>
                        {c.whatsapp_phone_e164 ?? c.whatsapp_phone ?? "—"}
                      </td>
                      <td style={tdStyle}>{c.email ?? "—"}</td>
                      <td style={tdStyle}>{displayClubById(c.club_id, clubs)}</td>
                      <td style={tdStyle}>{assignmentCount}</td>
                      <td style={tdStyle}>{c.notes?.trim() || "—"}</td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Link href={`/caddies/${c.id}/edit`} style={ghostButtonStyle}>
                            Editar
                          </Link>

                          {c.is_active !== false ? (
                            <form action={deactivateCaddieAction}>
                              <input type="hidden" name="caddie_id" value={c.id} />
                              <button type="submit" style={warnButtonStyle}>
                                Baja
                              </button>
                            </form>
                          ) : (
                            <form action={activateCaddieAction}>
                              <input type="hidden" name="caddie_id" value={c.id} />
                              <button type="submit" style={miniButtonStyle}>
                                Reactivar
                              </button>
                            </form>
                          )}

                          {canDelete ? (
                            <form action={deleteCaddieAction}>
                              <input type="hidden" name="caddie_id" value={c.id} />
                              <button type="submit" style={dangerButtonStyle}>
                                Eliminar
                              </button>
                            </form>
                          ) : (
                            <span
                              style={lockedButtonStyle}
                              title="Tiene asignaciones. Usa Baja para conservar historial."
                            >
                              Con historial
                            </span>
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
      </div>
    </div>
  );
}