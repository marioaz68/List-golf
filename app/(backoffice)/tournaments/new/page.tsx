"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { createTournamentAndMaybeCopyCategories } from "../actions";

type TournamentOption = {
  id: string;
  name: string;
  created_at?: string;
};

type ClubOption = {
  id: string;
  name: string | null;
  short_name: string | null;
  is_active: boolean | null;
};

type CourseOption = {
  id: string;
  name: string;
  club_id: string | null;
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

function clubLabel(club: ClubOption) {
  return club.short_name?.trim() || club.name?.trim() || "Club";
}

export default function NewTournamentPage() {
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [status, setStatus] = useState("draft");
  const [clubId, setClubId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [copyFromTournamentId, setCopyFromTournamentId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingTournaments(true);
      setLoadingClubs(true);
      setLoadingCourses(true);

      const [tournamentsRes, clubsRes, coursesRes] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id, name, created_at")
          .order("created_at", { ascending: false })
          .limit(100),

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

      if (cancelled) return;

      if (tournamentsRes.data) {
        setTournaments(tournamentsRes.data as TournamentOption[]);
      }

      if (clubsRes.data) {
        setClubs(clubsRes.data as ClubOption[]);
      }

      if (coursesRes.data) {
        setCourses(coursesRes.data as CourseOption[]);
      }

      setLoadingTournaments(false);
      setLoadingClubs(false);
      setLoadingCourses(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const clubsMap = useMemo(
    () => new Map(clubs.map((club) => [club.id, club])),
    [clubs]
  );

  const availableCourses = useMemo(() => {
    if (!clubId) return courses;
    return courses.filter((course) => course.club_id === clubId);
  }, [courses, clubId]);

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
            <select
              name="club_id"
              value={clubId}
              onChange={(e) => {
                const nextClubId = e.target.value;
                setClubId(nextClubId);

                if (
                  courseId &&
                  courses.find((c) => c.id === courseId)?.club_id !== nextClubId
                ) {
                  setCourseId("");
                }
              }}
              style={fieldStyle}
              disabled={loadingClubs}
              required
            >
              <option value="">
                {loadingClubs ? "Cargando clubs..." : "Seleccionar club"}
              </option>

              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {clubLabel(club)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Campo
            <select
              name="course_id"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              style={fieldStyle}
              disabled={loadingCourses || !clubId}
            >
              <option value="">
                {!clubId
                  ? "Primero selecciona club"
                  : loadingCourses
                  ? "Cargando campos..."
                  : "Seleccionar campo"}
              </option>

              {availableCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              marginTop: -4,
              fontSize: 12,
              color: "#6b7280",
            }}
          >
            Club seleccionado:{" "}
            {clubId ? clubLabel(clubsMap.get(clubId) as ClubOption) : "—"}
          </div>

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
            Póster del torneo
            <input
              type="file"
              name="poster"
              accept="image/png,image/jpeg,image/webp"
              style={fieldStyle}
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: 400,
                color: "#6b7280",
              }}
            >
              Imagen recomendada: vertical, ligera y de buena calidad.
            </div>
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