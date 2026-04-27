import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { updateTournamentAction } from "../actions";
import SubmitButton from "@/components/ui/SubmitButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  status: string | null;
  club_id: string | null;
  club_name: string | null;
  course_id: string | null;
  course_name: string | null;
  start_date: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};

type CourseRow = {
  id: string;
  name: string | null;
  club_id: string | null;
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
  maxWidth: 820,
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

const formGrid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
};

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const twoColGrid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
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
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  paddingTop: 6,
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

function getParam(sp: SP, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function clubLabel(club: ClubRow) {
  return club.short_name?.trim() || club.name?.trim() || "Club";
}

export default async function EditTournamentPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournament_id = getParam(sp, "tournament_id");

  if (!tournament_id) {
    redirect("/tournaments");
  }

  const supabase = await createClient();

  const [{ data: tournament, error: tournamentError }, { data: clubs }, { data: courses }] =
    await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id, name, short_name, status, club_id, club_name, course_id, course_name, start_date"
        )
        .eq("id", tournament_id)
        .single(),

      supabase
        .from("clubs")
        .select("id, name, short_name, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabase
        .from("courses")
        .select("id, name, club_id")
        .order("name", { ascending: true }),
    ]);

  if (tournamentError || !tournament) {
    throw new Error(
      `Error leyendo torneo: ${tournamentError?.message ?? "No encontrado"}`
    );
  }

  const row = tournament as TournamentRow;
  const clubOptions = (clubs ?? []) as ClubRow[];
  const allCourses = (courses ?? []) as CourseRow[];

  const filteredCourses = row.club_id
    ? allCourses.filter((course) => course.club_id === row.club_id)
    : allCourses;

  return (
    <div style={pageWrap}>
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h1 style={titleStyle}>EDITAR TORNEO</h1>
            <p style={subStyle}>
              Modifica nombre, nombre corto, estatus, club, campo y fecha
            </p>
          </div>

          <Link href="/tournaments" style={ghostButtonStyle}>
            Volver a torneos
          </Link>
        </div>

        <form action={updateTournamentAction} style={formGrid}>
          <input type="hidden" name="tournament_id" value={row.id} />

          <div style={twoColGrid}>
            <div style={fieldGrid}>
              <label style={labelStyle}>Nombre del torneo</label>
              <input
                name="name"
                defaultValue={row.name ?? ""}
                style={fieldStyle}
                placeholder="Ej. Torneo Anual 2026"
                required
              />
            </div>

            <div style={fieldGrid}>
              <label style={labelStyle}>Nombre corto</label>
              <input
                name="short_name"
                defaultValue={row.short_name ?? ""}
                style={fieldStyle}
                placeholder="Ej. ANUAL 2026"
              />
            </div>
          </div>

          <div style={twoColGrid}>
            <div style={fieldGrid}>
              <label style={labelStyle}>Estatus</label>
              <select
                name="status"
                defaultValue={row.status ?? "draft"}
                style={fieldStyle}
              >
                <option value="draft">Draft</option>
                <option value="active">Activo</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>

            <div style={fieldGrid}>
              <label style={labelStyle}>Fecha inicio</label>
              <input
                type="date"
                name="start_date"
                defaultValue={normalizeDateInput(row.start_date)}
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={twoColGrid}>
            <div style={fieldGrid}>
              <label style={labelStyle}>Club</label>
              <select
                name="club_id"
                defaultValue={row.club_id ?? ""}
                style={fieldStyle}
                required
              >
                <option value="">Seleccionar club</option>
                {clubOptions.map((club) => (
                  <option key={club.id} value={club.id}>
                    {clubLabel(club)}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldGrid}>
              <label style={labelStyle}>Campo</label>
              <select
                name="course_id"
                defaultValue={row.course_id ?? ""}
                style={fieldStyle}
              >
                <option value="">Seleccionar campo</option>
                {filteredCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name ?? ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={buttonRow}>
            <SubmitButton
              pendingText="Guardando..."
              className="h-8 px-3 rounded border border-gray-800 bg-gray-900 text-[12px] font-bold text-white"
            >
              Guardar cambios
            </SubmitButton>

            <Link href="/tournaments" style={ghostButtonStyle}>
              Cancelar
            </Link>

            <Link
              href={`/categories?tournament_id=${row.id}`}
              style={ghostButtonStyle}
            >
              Categorías
            </Link>

            <Link
              href={`/rounds?tournament_id=${row.id}`}
              style={ghostButtonStyle}
            >
              Rondas
            </Link>

            <Link
              href={`/tee-sets?tournament_id=${row.id}`}
              style={ghostButtonStyle}
            >
              Salidas
            </Link>

            <Link
              href={`/tournaments/staff?tournament_id=${row.id}`}
              style={ghostButtonStyle}
            >
              Staff
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}