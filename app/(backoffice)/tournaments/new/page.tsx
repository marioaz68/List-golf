"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PosterFilePicker from "@/components/ui/PosterFilePicker";
import {
  createTournamentFormAction,
  type CreateTournamentFormState,
} from "../actions";
import {
  TEMPLATE_PRESETS,
  pickTemplateSourceIds,
  type TemplateRole,
  type TournamentLiteForTemplate,
} from "@/lib/tournaments/templatePresets";

const createTournamentInitialState: CreateTournamentFormState = {
  ok: false,
  message: "",
};

type TournamentOption = TournamentLiteForTemplate & {
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

type TemplatePick = TemplateRole | "blank" | "other";

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
  const [templatePick, setTemplatePick] = useState<TemplatePick>("anual");
  const [copyFromTournamentId, setCopyFromTournamentId] = useState("");
  const [formatType, setFormatType] = useState<
    "stroke" | "stableford" | "matchplay"
  >("stroke");
  const [bracketRoundCount, setBracketRoundCount] = useState("4");
  const [holesPerMatch, setHolesPerMatch] = useState<"9" | "18">("18");
  const [matchPlayType, setMatchPlayType] = useState<"individual" | "pairs">(
    "pairs"
  );
  const [bracketSize, setBracketSize] = useState<string>("16");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const [formState, formAction, isPending] = useActionState(
    createTournamentFormAction,
    createTournamentInitialState
  );

  const templateSources = useMemo(
    () => pickTemplateSourceIds(tournaments),
    [tournaments]
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tournaments) {
      m.set(t.id, t.short_name?.trim() || t.name?.trim() || t.id);
    }
    return m;
  }, [tournaments]);

  /** Id que se clonará según plantilla (null = blanco). */
  const resolvedCopyFromId = useMemo(() => {
    if (templatePick === "blank") return "";
    if (templatePick === "other") return copyFromTournamentId;
    return templateSources[templatePick] ?? "";
  }, [templatePick, copyFromTournamentId, templateSources]);

  useEffect(() => {
    // Al elegir Anual/Calcuta/Ryder, sincroniza formato base del form.
    if (templatePick === "anual") setFormatType("stroke");
    if (templatePick === "calcuta_mixto" || templatePick === "ryder") {
      setFormatType("matchplay");
      setMatchPlayType("pairs");
    }
  }, [templatePick]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    if (!name.trim()) {
      setClientError("Escribe el nombre del torneo.");
      return;
    }
    if (!clubId) {
      setClientError("Selecciona un club.");
      return;
    }
    if (
      (templatePick === "anual" ||
        templatePick === "calcuta_mixto" ||
        templatePick === "ryder") &&
      !resolvedCopyFromId
    ) {
      setClientError(
        "No hay un torneo de referencia para esa plantilla. Elige “Otro torneo…” o crea desde cero y configura reglas."
      );
      return;
    }
    if (templatePick === "other" && !copyFromTournamentId) {
      setClientError("Selecciona el torneo del que quieres clonar las reglas.");
      return;
    }

    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("short_name", shortName.trim());
    fd.set("status", status);
    fd.set("club_id", clubId);
    fd.set("course_id", courseId);
    fd.set("start_date", startDate);
    fd.set("format_type", formatType);
    fd.set("template_role", templatePick);
    fd.set("copy_from_tournament_id", resolvedCopyFromId);

    if (formatType === "matchplay") {
      fd.set("match_play_type", matchPlayType);
      fd.set("bracket_size", bracketSize);
      fd.set("bracket_round_count", bracketRoundCount);
      fd.set("holes_per_match", holesPerMatch);
    }

    if (posterFile) {
      fd.set("poster", posterFile);
    }

    formAction(fd);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingTournaments(true);
      setLoadingClubs(true);
      setLoadingCourses(true);

      const [tournamentsRes, clubsRes, coursesRes] = await Promise.all([
        supabase
          .from("tournaments")
          .select(
            "id, name, short_name, start_date, settings, is_archived, kind, created_at"
          )
          .neq("kind", "daily_round")
          .order("created_at", { ascending: false })
          .limit(120),

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

  const showBlankFormat =
    templatePick === "blank" || templatePick === "other";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Nuevo torneo</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid rgba(255,255,255,0.18)",
          padding: 16,
          borderRadius: 12,
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          maxWidth: 820,
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          {/* —— Plantillas —— */}
          <div>
            <div style={{ color: "#111827", fontWeight: 700, marginBottom: 8 }}>
              Tipo / plantilla de reglas
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "1fr",
              }}
            >
              {TEMPLATE_PRESETS.map((p) => {
                const active = templatePick === p.key;
                const sourceId =
                  p.key === "anual" ||
                  p.key === "calcuta_mixto" ||
                  p.key === "ryder"
                    ? templateSources[p.key]
                    : null;
                const sourceLabel = sourceId
                  ? nameById.get(sourceId) ?? "…"
                  : p.key === "blank" || p.key === "other"
                    ? null
                    : "Sin torneo de referencia";

                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setTemplatePick(p.key)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: active
                        ? "2px solid #2563eb"
                        : "1px solid #d1d5db",
                      background: active ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          color: "#0f172a",
                          fontSize: 15,
                        }}
                      >
                        {p.label}
                      </span>
                      {active ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#1d4ed8",
                          }}
                        >
                          SELECCIONADO
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#475569",
                        lineHeight: 1.4,
                      }}
                    >
                      {p.description}
                    </div>
                    {sourceLabel != null ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: sourceId ? "#047857" : "#b45309",
                        }}
                      >
                        {sourceId
                          ? `Fuente: ${sourceLabel}`
                          : sourceLabel}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {templatePick === "other" ? (
            <label style={{ color: "#111827", fontWeight: 600 }}>
              Torneo origen (clona todas las reglas)
              <select
                value={copyFromTournamentId}
                onChange={(e) => setCopyFromTournamentId(e.target.value)}
                style={fieldStyle}
                disabled={loadingTournaments}
              >
                <option value="">
                  {loadingTournaments
                    ? "Cargando torneos..."
                    : "Seleccionar torneo…"}
                </option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.short_name?.trim() || t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Nombre del torneo
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Torneo Anual 2027"
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
              placeholder="Ej. ANUAL 2027"
              style={fieldStyle}
            />
          </label>

          {showBlankFormat ? (
            <>
              <label style={{ color: "#111827", fontWeight: 600 }}>
                Formato del torneo
                <select
                  name="format_type"
                  value={formatType}
                  onChange={(e) =>
                    setFormatType(
                      e.target.value as "stroke" | "stableford" | "matchplay"
                    )
                  }
                  style={fieldStyle}
                >
                  <option value="stroke">Stroke play (por golpes)</option>
                  <option value="stableford">Stableford (puntos)</option>
                  <option value="matchplay">Match play</option>
                </select>
              </label>

              {formatType === "matchplay" ? (
                <>
                  <label style={{ color: "#111827", fontWeight: 600 }}>
                    Tipo de match play
                    <select
                      value={matchPlayType}
                      onChange={(e) =>
                        setMatchPlayType(
                          e.target.value as "individual" | "pairs"
                        )
                      }
                      style={fieldStyle}
                    >
                      <option value="pairs">Por parejas</option>
                      <option value="individual">Individual</option>
                    </select>
                  </label>
                  <label style={{ color: "#111827", fontWeight: 600 }}>
                    Tamaño del cuadro
                    <select
                      value={bracketSize}
                      onChange={(e) => {
                        setBracketSize(e.target.value);
                        if (e.target.value !== "variable") {
                          const rounds = Math.ceil(
                            Math.log2(Number(e.target.value))
                          );
                          setBracketRoundCount(String(rounds));
                        }
                      }}
                      style={fieldStyle}
                    >
                      <option value="variable">Variable (BYEs)</option>
                      <option value="8">8</option>
                      <option value="16">16</option>
                      <option value="32">32</option>
                      <option value="64">64</option>
                    </select>
                  </label>
                  <label style={{ color: "#111827", fontWeight: 600 }}>
                    Rondas del cuadro
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={bracketRoundCount}
                      onChange={(e) => setBracketRoundCount(e.target.value)}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={{ color: "#111827", fontWeight: 600 }}>
                    Hoyos por match
                    <select
                      value={holesPerMatch}
                      onChange={(e) =>
                        setHolesPerMatch(e.target.value as "9" | "18")
                      }
                      style={fieldStyle}
                    >
                      <option value="18">18 hoyos</option>
                      <option value="9">9 hoyos</option>
                    </select>
                  </label>
                </>
              ) : null}
            </>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "#475569",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "10px 12px",
                lineHeight: 1.45,
              }}
            >
              Al clonar plantilla se copian <b>todas las reglas</b> del torneo
              fuente: convocatoria, categorías, premios, cortes, competencia,
              tees, hoyos y reglas match play / calcuta / ryder.{" "}
              <b>No</b> copia inscritos, salidas, resultados ni cuadros en vivo.
              La convocatoria queda en borrador para revisarla y{" "}
              <b>Aplicar</b>.
            </div>
          )}

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Estatus
            <select
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

          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Club seleccionado:{" "}
            {clubId ? clubLabel(clubsMap.get(clubId) as ClubOption) : "—"}
          </div>

          <label style={{ color: "#111827", fontWeight: 600 }}>
            Fecha inicio
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={fieldStyle}
            />
          </label>

          <div>
            <div style={{ color: "#111827", fontWeight: 600, marginBottom: 4 }}>
              Póster del torneo
            </div>
            <PosterFilePicker onFileReady={setPosterFile} />
          </div>

          {clientError || formState.message ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {clientError || formState.message}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="submit"
              style={{
                ...buttonStyle,
                opacity: isPending ? 0.7 : 1,
                cursor: isPending ? "wait" : "pointer",
              }}
              disabled={isPending}
            >
              {isPending ? "Creando torneo…" : "Crear torneo"}
            </button>
            <a href="/tournaments" style={buttonStyle}>
              Cancelar
            </a>
          </div>
        </div>
      </form>
    </div>
  );
}
