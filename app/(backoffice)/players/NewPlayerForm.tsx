"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  onCreated?: () => void;
  returnTournament?: string;
};

type ClubOption = {
  id: string;
  name: string;
  normalized_name: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  boxShadow: "0 3px 0 #1f2937, 0 4px 8px rgba(0,0,0,0.22)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 28,
  padding: "0 8px",
  marginTop: 3,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#f3f4f6",
  color: "#111827",
  fontSize: 11,
  lineHeight: 1,
};

function normalizeClubName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export default function NewPlayerForm({
  onCreated,
  returnTournament,
}: Props) {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [handicapIndex, setHandicapIndex] = useState("");
  const [handicapTorneo, setHandicapTorneo] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [club, setClub] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [clubSuggestions, setClubSuggestions] = useState<ClubOption[]>([]);
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [clubSearchLoading, setClubSearchLoading] = useState(false);
  const [selectedClubIndex, setSelectedClubIndex] = useState(-1);

  const clubBoxRef = useRef<HTMLDivElement | null>(null);

  const normalizedTypedClub = useMemo(() => normalizeClubName(club), [club]);

  const toNumberOrNull = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (Number.isNaN(n)) return "NaN" as const;
    return n;
  };

  const toIntOrNull = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return "NaN" as const;
    return Math.trunc(n);
  };

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!clubBoxRef.current) return;
      if (!clubBoxRef.current.contains(event.target as Node)) {
        setClubDropdownOpen(false);
        setSelectedClubIndex(-1);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const term = club.trim();

    if (term.length < 2) {
      setClubSuggestions([]);
      setClubSearchLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setClubSearchLoading(true);

      const { data, error } = await supabase
        .from("clubs")
        .select("id,name,normalized_name")
        .ilike("name", `%${term}%`)
        .order("name", { ascending: true })
        .limit(8);

      if (!error) {
        setClubSuggestions((data as ClubOption[]) ?? []);
        setClubDropdownOpen(true);
      }

      setClubSearchLoading(false);
      setSelectedClubIndex(-1);
    }, 220);

    return () => clearTimeout(timer);
  }, [club]);

  const selectClub = (name: string) => {
    setClub(name);
    setClubDropdownOpen(false);
    setSelectedClubIndex(-1);
  };

  const exactMatchExists = clubSuggestions.some(
    (c) => c.normalized_name === normalizedTypedClub
  );

  const ensureClubExists = async (rawClub: string) => {
    const trimmed = rawClub.trim();
    if (!trimmed) return null;

    const normalized_name = normalizeClubName(trimmed);

    const { data: existing, error: existingError } = await supabase
      .from("clubs")
      .select("id,name")
      .eq("normalized_name", normalized_name)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing?.name && existing.name !== trimmed) {
      setClub(existing.name);
      return existing.name;
    }

    if (!existing) {
      const { error: insertClubError } = await supabase.from("clubs").insert({
        name: trimmed,
        normalized_name,
      });

      if (insertClubError && insertClubError.code !== "23505") {
        throw new Error(insertClubError.message);
      }

      if (insertClubError?.code === "23505") {
        const { data: retryExisting, error: retryError } = await supabase
          .from("clubs")
          .select("name")
          .eq("normalized_name", normalized_name)
          .maybeSingle();

        if (retryError) {
          throw new Error(retryError.message);
        }

        if (retryExisting?.name) {
          setClub(retryExisting.name);
          return retryExisting.name;
        }
      }
    }

    return trimmed;
  };

  const createPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!firstName.trim()) return setMsg("Falta el nombre.");
    if (!lastName.trim()) return setMsg("Falta el apellido.");

    const hi = toNumberOrNull(handicapIndex);
    const ht = toNumberOrNull(handicapTorneo);
    const by = toIntOrNull(birthYear);

    if (hi === "NaN") {
      return setMsg("handicap_index debe ser número (ej. -1.2, 0, 12.5).");
    }

    if (ht === "NaN") {
      return setMsg("handicap_torneo debe ser número (ej. -1, 0, 10).");
    }

    if (by === "NaN") {
      return setMsg("Año nacimiento debe ser número entero (ej. 1978).");
    }

    if (typeof hi === "number" && (hi < -10 || hi > 54)) {
      return setMsg("handicap_index fuera de rango razonable (-10 a 54).");
    }

    if (typeof ht === "number" && (ht < -10 || ht > 54)) {
      return setMsg("handicap_torneo fuera de rango razonable (-10 a 54).");
    }

    if (typeof by === "number" && (by < 1900 || by > 2100)) {
      return setMsg("Año nacimiento fuera de rango razonable.");
    }

    setLoading(true);

    try {
      const finalClub = await ensureClubExists(club);

      const res = await supabase
        .from("players")
        .insert([
          {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            gender,
            handicap_index: hi,
            handicap_torneo: ht,
            birth_year: by,
            phone: phone.trim() || null,
            email: email.trim().toLowerCase() || null,
            club: finalClub?.trim() || null,
          },
        ])
        .select("id")
        .single();

      if (res.error) {
        setMsg(`❌ ${res.error.message} (code: ${res.error.code ?? "n/a"})`);
        return;
      }

      if (returnTournament) {
        const entryRes = await supabase.from("tournament_entries").insert({
          tournament_id: returnTournament,
          player_id: res.data.id,
          handicap_index: ht ?? hi,
          status: "confirmed",
        });

        if (entryRes.error) {
          setMsg(
            `❌ ${entryRes.error.message} (code: ${entryRes.error.code ?? "n/a"})`
          );
          return;
        }

        router.replace(`/entries?view=single&tournament_id=${returnTournament}`);
        return;
      }

      setFirstName("");
      setLastName("");
      setGender("M");
      setHandicapIndex("");
      setHandicapTorneo("");
      setBirthYear("");
      setPhone("");
      setEmail("");
      setClub("");
      setClubSuggestions([]);
      setClubDropdownOpen(false);
      setSelectedClubIndex(-1);

      setMsg("✅ Jugador creado");
      onCreated?.();
      router.refresh();
    } catch (err: any) {
      setMsg(`❌ ${err?.message ?? "Error creando jugador (catch)"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={createPlayer}
      style={{
        border: "1px solid #d1d5db",
        padding: 10,
        borderRadius: 10,
        background: "rgba(255,255,255,0.95)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <h2
        style={{
          fontSize: 14,
          marginBottom: 8,
          color: "#111827",
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        Nuevo jugador
      </h2>

      {returnTournament && (
        <div style={{ marginBottom: 8 }}>
          <a
            href={`/entries?view=single&tournament_id=${returnTournament}`}
            style={buttonStyle}
          >
            Volver a inscripciones
          </a>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 6,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        }}
      >
        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Nombre
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Apellido
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Género
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "M" | "F")}
            style={fieldStyle}
          >
            <option value="M">Caballeros</option>
            <option value="F">Damas</option>
          </select>
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Handicap Index
          <input
            value={handicapIndex}
            onChange={(e) => setHandicapIndex(e.target.value)}
            placeholder="Ej. -1.2, 0, 12.5"
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Handicap Torneo
          <input
            value={handicapTorneo}
            onChange={(e) => setHandicapTorneo(e.target.value)}
            placeholder="Ej. -1, 0, 10"
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Año nacimiento
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="Ej. 1978"
            type="number"
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Teléfono
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label
          style={{
            color: "#111827",
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            style={fieldStyle}
          />
        </label>

        <div ref={clubBoxRef} style={{ position: "relative" }}>
          <label
            style={{
              color: "#111827",
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.1,
            }}
          >
            Club
            <input
              value={club}
              onChange={(e) => {
                setClub(e.target.value);
                setClubDropdownOpen(true);
              }}
              onFocus={() => {
                if (club.trim().length >= 2) {
                  setClubDropdownOpen(true);
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  setClubDropdownOpen(false);
                  setSelectedClubIndex(-1);
                }, 140);
              }}
              onKeyDown={(e) => {
                const totalOptions = exactMatchExists
                  ? clubSuggestions.length
                  : clubSuggestions.length + (club.trim() ? 1 : 0);

                if (!clubDropdownOpen && e.key === "ArrowDown" && totalOptions > 0) {
                  setClubDropdownOpen(true);
                  setSelectedClubIndex(0);
                  return;
                }

                if (e.key === "ArrowDown" && totalOptions > 0) {
                  e.preventDefault();
                  setSelectedClubIndex((prev) =>
                    prev < totalOptions - 1 ? prev + 1 : prev
                  );
                }

                if (e.key === "ArrowUp" && totalOptions > 0) {
                  e.preventDefault();
                  setSelectedClubIndex((prev) => (prev > 0 ? prev - 1 : 0));
                }

                if (e.key === "Enter" && clubDropdownOpen && selectedClubIndex >= 0) {
                  e.preventDefault();

                  if (selectedClubIndex < clubSuggestions.length) {
                    selectClub(clubSuggestions[selectedClubIndex].name);
                  } else if (!exactMatchExists && club.trim()) {
                    selectClub(club.trim());
                  }
                }

                if (e.key === "Escape") {
                  setClubDropdownOpen(false);
                  setSelectedClubIndex(-1);
                }
              }}
              placeholder="Escribe para buscar o crear club"
              style={fieldStyle}
              autoComplete="off"
            />
          </label>

          {clubDropdownOpen && (club.trim().length >= 2 || clubSearchLoading) && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#ffffff",
                boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
                zIndex: 20,
                overflow: "hidden",
              }}
            >
              {clubSearchLoading && (
                <div style={{ padding: "8px 10px", fontSize: 11, color: "#4b5563" }}>
                  Buscando clubs...
                </div>
              )}

              {!clubSearchLoading && clubSuggestions.length === 0 && club.trim() && (
                <div
                  onMouseDown={() => selectClub(club.trim())}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: selectedClubIndex === 0 ? "#eef2ff" : "#ffffff",
                    color: "#111827",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 11,
                    lineHeight: 1.2,
                  }}
                >
                  Crear nuevo club: <strong>{club.trim()}</strong>
                </div>
              )}

              {!clubSearchLoading &&
                clubSuggestions.map((item, index) => (
                  <div
                    key={item.id}
                    onMouseDown={() => selectClub(item.name)}
                    style={{
                      padding: "8px 10px",
                      cursor: "pointer",
                      background: selectedClubIndex === index ? "#eef2ff" : "#ffffff",
                      color: "#111827",
                      borderBottom:
                        index < clubSuggestions.length - 1 ||
                        (!exactMatchExists && club.trim())
                          ? "1px solid #e5e7eb"
                          : "none",
                      fontSize: 11,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.name}
                  </div>
                ))}

              {!clubSearchLoading &&
                !exactMatchExists &&
                clubSuggestions.length > 0 &&
                club.trim() && (
                  <div
                    onMouseDown={() => selectClub(club.trim())}
                    style={{
                      padding: "8px 10px",
                      cursor: "pointer",
                      background:
                        selectedClubIndex === clubSuggestions.length
                          ? "#eef2ff"
                          : "#ffffff",
                      color: "#111827",
                      fontSize: 11,
                      lineHeight: 1.2,
                    }}
                  >
                    Crear nuevo club: <strong>{club.trim()}</strong>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="submit"
          disabled={loading}
          style={{
            ...buttonStyle,
            opacity: loading ? 0.7 : 1,
            pointerEvents: loading ? "none" : "auto",
          }}
        >
          {loading
            ? "Guardando..."
            : returnTournament
              ? "Crear jugador e inscribir"
              : "Crear jugador"}
        </button>

        {msg && (
          <div
            style={{
              color: msg.startsWith("✅") ? "#166534" : "#b91c1c",
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </form>
  );
}
