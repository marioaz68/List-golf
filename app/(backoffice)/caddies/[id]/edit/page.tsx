import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateCaddieAction } from "./actions";

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
  level: string | null;
  notes: string | null;
  is_active: boolean | null;
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

function displayClubName(c: ClubRow) {
  return c.short_name?.trim() || c.name || "Club";
}

export default async function EditCaddiePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: caddieData, error: caddieError }, { data: clubsData, error: clubsError }] =
    await Promise.all([
      supabase
        .from("caddies")
        .select(
          "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, level, notes, is_active"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("clubs")
        .select("id, name, short_name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (caddieError) {
    if (caddieError.code === "PGRST116") {
      notFound();
    }
    throw new Error(`Error leyendo caddie: ${caddieError.message}`);
  }

  if (clubsError) {
    throw new Error(`Error leyendo clubs: ${clubsError.message}`);
  }

  const caddie = caddieData as CaddieRow | null;
  const clubs = (clubsData ?? []) as ClubRow[];

  if (!caddie) {
    notFound();
  }

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>EDITAR CADDIE</h1>
            <p style={subStyle}>Actualiza datos operativos del caddie</p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/caddies" style={ghostButtonStyle}>
              Volver a caddies
            </Link>
          </div>
        </div>

        <form action={updateCaddieAction} style={formStyle}>
          <input type="hidden" name="id" value={caddie.id} />

          <div style={gridStyle}>
            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="first_name" style={labelStyle}>
                Nombre
              </label>
              <input
                id="first_name"
                name="first_name"
                required
                defaultValue={caddie.first_name ?? ""}
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
                defaultValue={caddie.last_name ?? ""}
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
                defaultValue={caddie.nickname ?? ""}
                style={fieldStyle}
                placeholder="Ej. Chino / Flaco / Junior"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="level" style={labelStyle}>
                Nivel
              </label>
              <select
                id="level"
                name="level"
                defaultValue={caddie.level ?? ""}
                style={fieldStyle}
              >
                <option value="">Sin nivel</option>
                <option value="advanced">Avanzado</option>
                <option value="intermediate">Intermedio</option>
                <option value="beginner">Principiante</option>
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="phone" style={labelStyle}>
                Teléfono
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={caddie.phone ?? ""}
                style={fieldStyle}
                placeholder="442..."
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 3" }}>
              <label htmlFor="telegram" style={labelStyle}>
                Telegram
              </label>
              <input
                id="telegram"
                name="telegram"
                defaultValue={caddie.telegram ?? ""}
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
                defaultValue={caddie.whatsapp_phone ?? ""}
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
                defaultValue={caddie.whatsapp_phone_e164 ?? ""}
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
                defaultValue={caddie.email ?? ""}
                style={fieldStyle}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="club_id" style={labelStyle}>
                Club
              </label>
              <select
                id="club_id"
                name="club_id"
                defaultValue={caddie.club_id ?? ""}
                style={fieldStyle}
              >
                <option value="">Sin club</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {displayClubName(club)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 4" }}>
              <label htmlFor="is_active" style={labelStyle}>
                Activo
              </label>
              <select
                id="is_active"
                name="is_active"
                defaultValue={caddie.is_active === false ? "false" : "true"}
                style={fieldStyle}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>

            <div style={{ ...fieldWrapStyle, gridColumn: "span 12" }}>
              <label htmlFor="notes" style={labelStyle}>
                Notas
              </label>
              <textarea
                id="notes"
                name="notes"
                defaultValue={caddie.notes ?? ""}
                style={textareaStyle}
                placeholder="Notas operativas del caddie"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle}>
              Guardar cambios
            </button>

            <Link href="/caddies" style={ghostButtonStyle}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}