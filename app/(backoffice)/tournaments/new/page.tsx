"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { createTournamentAndMaybeCopyCategories } from "../actions";

type TournamentOption = {
  id: string;
  name: string;
  created_at?: string;
};

type CourseOption = {
  id: string;
  name: string;
  club_name: string | null;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 18px",
  borderRadius: "8px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  textDecoration: "none",
  boxShadow: "0 4px 0 #1f2937, 0 6px 10px rgba(0,0,0,0.25)",
  cursor: "pointer",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  marginTop: 4,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
};

export default function NewTournamentPage() {
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [status, setStatus] = useState("draft");
  const [clubName, setClubName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [copyFromTournamentId, setCopyFromTournamentId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingTournaments(true);
      setLoadingCourses(true);

      const { data: tData } = await supabase
        .from("tournaments")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      const { data: cData } = await supabase
        .from("courses")
        .select("id, name, club_name")
        .order("name", { ascending: true });

      if (!cancelled) {
        if (tData) setTournaments(tData as TournamentOption[]);
        if (cData) setCourses(cData as CourseOption[]);

        setLoadingTournaments(false);
        setLoadingCourses(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Nuevo torneo</h1>

      <form
        action={createTournamentAndMaybeCopyCategories}
        style={{
          border: "1px solid rgba(255,255,255,0.18)",
          padding: 16,
          borderRadius: 12,
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          maxWidth: 760,
        }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ color: "#111827", fontWeight: 600 }}>
            Nombre del torneo
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Torneo Anual 2026"
              style={fieldStyle}
              required
            />
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Nombre corto
            <input
              name="short_name"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="Ej. ANUAL 2026"
              style={fieldStyle}
            />
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Estatus
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={fieldStyle}
            >
              <option value="draft">Draft</option>
              <option value="active">Activo</option>
              <option value="closed">Cerrado</option>
            </select>
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Club
            <input
              name="club_name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Ej. Club Campestre de Querétaro"
              style={fieldStyle}
            />
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Campo
            <select
              name="course_id"
              value={courseId}
              onChange={(e) => {
                const id = e.target.value;
                setCourseId(id);

                const c = courses.find((x) => x.id === id);
                if (c) {
                  setCourseName(c.name);
                  if (!clubName && c.club_name) {
                    setClubName(c.club_name);
                  }
                } else {
                  setCourseName("");
                }
              }}
              style={fieldStyle}
              disabled={loadingCourses}
            >
              <option value="">
                {loadingCourses ? "Cargando campos..." : "Seleccionar campo"}
              </option>

              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.club_name ? `(${c.club_name})` : ""}
                </option>
              ))}
            </select>
          </label>

          <input type="hidden" name="course_name" value={courseName} />

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Fecha inicio
            <input
              type="date"
              name="start_date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Copiar categorías desde otro torneo
            <select
              name="copy_from_tournament_id"
              value={copyFromTournamentId}
              onChange={(e) => setCopyFromTournamentId(e.target.value)}
              style={fieldStyle}
              disabled={loadingTournaments}
            >
              <option value="">
                {loadingTournaments
                  ? "Cargando torneos..."
                  : "No copiar / empezar desde cero"}
              </option>

              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <button type="submit" style={buttonStyle}>
              Crear torneo
            </button>

            <a href="/categories" style={buttonStyle}>
              Ir a categorías
            </a>
          </div>
        </div>
      </form>
    </div>
  );
}