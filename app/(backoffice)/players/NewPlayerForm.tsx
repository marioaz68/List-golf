"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { normalizePhoneToE164 } from "@/utils/phone";

type Props = {
  onCreated?: () => void;
  returnTournament?: string;
};

type ClubOption = {
  id: string;
  name: string;
  short_name: string | null;
  normalized_name: string;
  is_active?: boolean | null;
};

type PlayerMatch = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  ghin_number: string | null;
  club: string | null;
};

type PlayerFull = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
  gender: "M" | "F" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  birth_year: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
  club_id: string | null;
  ghin_number: string | null;
  shirt_size: string | null;
  shoe_size: string | null;
};

const buttonStyle: CSSProperties = {
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

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "24px",
  padding: "0 8px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const fieldStyle: CSSProperties = {
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

const labelStyle: CSSProperties = {
  color: "#111827",
  fontWeight: 500,
  fontSize: 11,
  lineHeight: 1.1,
};

function normalizeClubName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeInitials(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-zÑñ]/g, "")
    .toUpperCase()
    .trim()
    .slice(0, 6);
}

function buildMatchScore(params: {
  candidate: PlayerMatch;
  normalizedPhone: string | null;
  cleanEmail: string | null;
  cleanGhin: string | null;
  normalizedFirstName: string;
  normalizedLastName: string;
}) {
  const {
    candidate,
    normalizedPhone,
    cleanEmail,
    cleanGhin,
    normalizedFirstName,
    normalizedLastName,
  } = params;

  let score = 0;

  const candidatePhone = (candidate.phone || "").trim();
  const candidateEmail = (candidate.email || "").trim().toLowerCase();
  const candidateGhin = (candidate.ghin_number || "").trim();
  const candidateFirst = (candidate.first_name || "").trim().toLowerCase();
  const candidateLast = (candidate.last_name || "").trim().toLowerCase();

  if (normalizedPhone && candidatePhone === normalizedPhone) score += 100;
  if (cleanEmail && candidateEmail === cleanEmail) score += 90;
  if (cleanGhin && candidateGhin === cleanGhin) score += 80;

  if (
    normalizedFirstName &&
    normalizedLastName &&
    candidateFirst === normalizedFirstName &&
    candidateLast === normalizedLastName
  ) {
    score += 40;
  } else {
    if (normalizedFirstName && candidateFirst.includes(normalizedFirstName)) {
      score += 10;
    }
    if (normalizedLastName && candidateLast.includes(normalizedLastName)) {
      score += 10;
    }
  }

  return score;
}

export default function NewPlayerForm({
  onCreated,
  returnTournament,
}: Props) {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initials, setInitials] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [handicapIndex, setHandicapIndex] = useState("");
  const [handicapTorneo, setHandicapTorneo] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [club, setClub] = useState("");
  const [clubId, setClubId] = useState<string | null>(null);
  const [ghinNumber, setGhinNumber] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [clubSuggestions, setClubSuggestions] = useState<ClubOption[]>([]);
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [clubSearchLoading, setClubSearchLoading] = useState(false);
  const [selectedClubIndex, setSelectedClubIndex] = useState(-1);

  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [usingExistingPlayerId, setUsingExistingPlayerId] = useState<string | null>(null);
  const [selectedExistingPlayerId, setSelectedExistingPlayerId] = useState<string | null>(null);

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

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setInitials("");
    setGender("M");
    setHandicapIndex("");
    setHandicapTorneo("");
    setBirthYear("");
    setPhone("");
    setEmail("");
    setClub("");
    setClubId(null);
    setGhinNumber("");
    setShirtSize("");
    setShoeSize("");
    setClubSuggestions([]);
    setClubDropdownOpen(false);
    setSelectedClubIndex(-1);
    setPlayerMatches([]);
    setSelectedExistingPlayerId(null);
    setMsg(null);
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
        .select("id,name,short_name,normalized_name,is_active")
        .eq("is_active", true)
        .or(`name.ilike.%${term}%,short_name.ilike.%${term}%`)
        .order("name", { ascending: true })
        .limit(8);

      if (!error) {
        setClubSuggestions((data as ClubOption[]) ?? []);
        setClubDropdownOpen(true);
      } else {
        setClubSuggestions([]);
      }

      setClubSearchLoading(false);
      setSelectedClubIndex(-1);
    }, 220);

    return () => clearTimeout(timer);
  }, [club]);

  useEffect(() => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const normalizedFirstName = trimmedFirst.toLowerCase();
    const normalizedLastName = trimmedLast.toLowerCase();
    const normalizedPhone = phone.trim()
      ? normalizePhoneToE164(phone, "MX")
      : null;
    const cleanEmail = email.trim().toLowerCase() || null;
    const cleanGhin = ghinNumber.trim() || null;

    const canSearch =
      !!normalizedPhone ||
      !!cleanEmail ||
      !!cleanGhin ||
      (trimmedFirst.length >= 2 && trimmedLast.length >= 2);

    if (!canSearch) {
      setPlayerMatches([]);
      setSearchingPlayers(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingPlayers(true);

      const conditions: string[] = [];

      if (normalizedPhone) conditions.push(`phone.eq.${normalizedPhone}`);
      if (cleanEmail) conditions.push(`email.eq.${cleanEmail}`);
      if (cleanGhin) conditions.push(`ghin_number.eq.${cleanGhin}`);
      if (trimmedFirst.length >= 2) {
        conditions.push(`first_name.ilike.%${trimmedFirst}%`);
      }
      if (trimmedLast.length >= 2) {
        conditions.push(`last_name.ilike.%${trimmedLast}%`);
      }

      if (conditions.length === 0) {
        setPlayerMatches([]);
        setSearchingPlayers(false);
        return;
      }

      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, phone, email, ghin_number, club")
        .or(conditions.join(","))
        .limit(8);

      if (error || !data) {
        setPlayerMatches([]);
        setSearchingPlayers(false);
        return;
      }

      const ranked = (data as PlayerMatch[])
        .filter((candidate) => candidate.id !== selectedExistingPlayerId)
        .map((candidate) => ({
          candidate,
          score: buildMatchScore({
            candidate,
            normalizedPhone,
            cleanEmail,
            cleanGhin,
            normalizedFirstName,
            normalizedLastName,
          }),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.candidate);

      setPlayerMatches(ranked);
      setSearchingPlayers(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [firstName, lastName, phone, email, ghinNumber, selectedExistingPlayerId]);

  const selectClub = (selected: ClubOption) => {
    setClub(selected.name);
    setClubId(selected.id);
    setClubDropdownOpen(false);
    setSelectedClubIndex(-1);
  };

  const exactMatchExists = clubSuggestions.some(
    (c) =>
      c.normalized_name === normalizedTypedClub ||
      normalizeClubName(c.name) === normalizedTypedClub
  );

  const ensureClubExists = async (
    rawClub: string
  ): Promise<{ id: string | null; name: string | null } | null> => {
    const trimmed = rawClub.trim();
    if (!trimmed) return null;

    const normalized_name = normalizeClubName(trimmed);

    const { data: existing, error: existingError } = await supabase
      .from("clubs")
      .select("id,name,short_name,is_active")
      .eq("normalized_name", normalized_name)
      .eq("is_active", true)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing?.id) {
      setClub(existing.name ?? trimmed);
      setClubId(existing.id);
      return {
        id: existing.id,
        name: existing.name ?? trimmed,
      };
    }

    const insertPayload = {
      name: trimmed,
      short_name: trimmed,
      normalized_name,
      is_active: true,
    };

    const { data: inserted, error: insertClubError } = await supabase
      .from("clubs")
      .insert(insertPayload)
      .select("id,name,short_name,is_active")
      .single();

    if (insertClubError && insertClubError.code !== "23505") {
      throw new Error(insertClubError.message);
    }

    if (inserted?.id) {
      setClub(inserted.name ?? trimmed);
      setClubId(inserted.id);
      return {
        id: inserted.id,
        name: inserted.name ?? trimmed,
      };
    }

    if (insertClubError?.code === "23505") {
      const { data: retryExisting, error: retryError } = await supabase
        .from("clubs")
        .select("id,name,short_name,is_active")
        .eq("normalized_name", normalized_name)
        .eq("is_active", true)
        .maybeSingle();

      if (retryError) {
        throw new Error(retryError.message);
      }

      if (retryExisting?.id) {
        setClub(retryExisting.name ?? trimmed);
        setClubId(retryExisting.id);
        return {
          id: retryExisting.id,
          name: retryExisting.name ?? trimmed,
        };
      }
    }

    return {
      id: null,
      name: trimmed,
    };
  };

  const ensureEntryIfNeeded = async (
    playerId: string,
    hi: number | null,
    ht: number | null
  ) => {
    if (!returnTournament) return;

    const { data: existingEntry, error: existingEntryError } = await supabase
      .from("tournament_entries")
      .select("id")
      .eq("tournament_id", returnTournament)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existingEntryError) {
      throw new Error(existingEntryError.message);
    }

    if (!existingEntry?.id) {
      const handicapForEntry =
       typeof ht === "number"
       ? ht
       : typeof hi === "number"
       ? hi
      : null;

      const entryRes = await supabase.from("tournament_entries").insert({
        tournament_id: returnTournament,
        player_id: playerId,
        handicap_index: handicapForEntry,
        status: "confirmed",
      });

      if (entryRes.error) {
        throw new Error(entryRes.error.message);
      }
    }
  };

  const useExistingPlayer = async (player: PlayerMatch) => {
    setMsg(null);
    setUsingExistingPlayerId(player.id);

    try {
      const { data, error } = await supabase
        .from("players")
        .select(
          "id, first_name, last_name, initials, gender, handicap_index, handicap_torneo, birth_year, phone, email, club, club_id, ghin_number, shirt_size, shoe_size"
        )
        .eq("id", player.id)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      const full = data as PlayerFull;

      setSelectedExistingPlayerId(full.id);
      setFirstName(full.first_name || "");
      setLastName(full.last_name || "");
      setInitials(full.initials || "");
      setGender(full.gender === "F" ? "F" : "M");
      setHandicapIndex(
        typeof full.handicap_index === "number" ? String(full.handicap_index) : ""
      );
      setHandicapTorneo(
        typeof full.handicap_torneo === "number" ? String(full.handicap_torneo) : ""
      );
      setBirthYear(typeof full.birth_year === "number" ? String(full.birth_year) : "");
      setPhone(full.phone || "");
      setEmail(full.email || "");
      setClub(full.club || "");
      setClubId(full.club_id || null);
      setGhinNumber(full.ghin_number || "");
      setShirtSize(full.shirt_size || "");
      setShoeSize(full.shoe_size || "");
      setMsg("ℹ️ Jugador existente cargado. Puedes modificar y guardar.");
    } catch (err: any) {
      setMsg(`❌ ${err?.message ?? "Error cargando jugador existente"}`);
    } finally {
      setUsingExistingPlayerId(null);
    }
  };

  const savePlayer = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!firstName.trim()) return setMsg("Falta el nombre.");
    if (!lastName.trim()) return setMsg("Falta el apellido.");

    const hi = toNumberOrNull(handicapIndex);
    const ht = toNumberOrNull(handicapTorneo);
    const by = toIntOrNull(birthYear);
    const cleanInitials = normalizeInitials(initials);

    const normalizedPhone = phone.trim()
      ? normalizePhoneToE164(phone, "MX")
      : null;

    const cleanEmail = email.trim().toLowerCase() || null;
    const cleanGhin = ghinNumber.trim() || null;

    if (cleanInitials && cleanInitials.length < 2) {
      return setMsg("Iniciales debe tener entre 2 y 6 letras.");
    }

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
      if (normalizedPhone) {
        let query = supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("phone", normalizedPhone)
          .limit(1);

        if (selectedExistingPlayerId) {
          query = query.neq("id", selectedExistingPlayerId);
        }

        const { data: existingByPhone, error } = await query;

        if (error) throw new Error(error.message);

        if (existingByPhone && existingByPhone.length > 0) {
          return setMsg(
            `⚠️ Ya existe jugador con ese teléfono: ${existingByPhone[0].first_name} ${existingByPhone[0].last_name}`
          );
        }
      }

      if (cleanEmail) {
        let query = supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("email", cleanEmail)
          .limit(1);

        if (selectedExistingPlayerId) {
          query = query.neq("id", selectedExistingPlayerId);
        }

        const { data: existingByEmail, error } = await query;

        if (error) throw new Error(error.message);

        if (existingByEmail && existingByEmail.length > 0) {
          return setMsg(
            `⚠️ Ya existe jugador con ese email: ${existingByEmail[0].first_name} ${existingByEmail[0].last_name}`
          );
        }
      }

      if (cleanGhin) {
        let query = supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("ghin_number", cleanGhin)
          .limit(1);

        if (selectedExistingPlayerId) {
          query = query.neq("id", selectedExistingPlayerId);
        }

        const { data: existingByGhin, error } = await query;

        if (error) throw new Error(error.message);

        if (existingByGhin && existingByGhin.length > 0) {
          return setMsg(
            `⚠️ Ya existe jugador con ese GHIN: ${existingByGhin[0].first_name} ${existingByGhin[0].last_name}`
          );
        }
      }

      let finalClubText: string | null = null;
      let finalClubId: string | null = clubId;

      if (club.trim()) {
        const ensured = await ensureClubExists(club);
        finalClubText = ensured?.name?.trim() || null;
        finalClubId = ensured?.id ?? finalClubId ?? null;
      }

      const payload = {
          first_name: firstName.trim(),
           last_name: lastName.trim(),
            initials: cleanInitials || null,
             gender,
           handicap_index: hi,
           handicap_torneo: ht,
           birth_year: by,
           phone: normalizedPhone,
           email: cleanEmail,
           club: finalClubText,
          club_id: finalClubId,
           ghin_number: cleanGhin,
          shirt_size: shirtSize || null,
           shoe_size: shoeSize || null,
      };

      if (selectedExistingPlayerId) {
       const updateRes = await supabase
       .from("players")
        .update(payload)
       .eq("id", selectedExistingPlayerId)
        .select("id")
       .maybeSingle();

      if (updateRes.error) {
  setMsg(
    `❌ ${updateRes.error.message} (code: ${updateRes.error.code ?? "n/a"})`
  );
  return;
      }

      if (!updateRes.data?.id) {
  setMsg("❌ No se pudo actualizar el jugador. Revisa RLS/permisos o si el registro ya no existe.");
  return;
      }

        await ensureEntryIfNeeded(selectedExistingPlayerId, hi, ht);

        if (returnTournament) {
          router.replace(`/entries?view=single&tournament_id=${returnTournament}`);
          return;
        }

        setMsg("✅ Jugador actualizado");
        onCreated?.();
        router.refresh();
        return;
      }

      const insertRes = await supabase
        .from("players")
        .insert([payload])
        .select("id")
        .single();

      if (insertRes.error) {
        setMsg(
          `❌ ${insertRes.error.message} (code: ${insertRes.error.code ?? "n/a"})`
        );
        return;
      }

      if (returnTournament) {
        await ensureEntryIfNeeded(insertRes.data.id, hi, ht);
        router.replace(`/entries?view=single&tournament_id=${returnTournament}`);
        return;
      }

      resetForm();
      setMsg("✅ Jugador creado");
      onCreated?.();
      router.refresh();
    } catch (err: any) {
      setMsg(`❌ ${err?.message ?? "Error guardando jugador"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={savePlayer}
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
        {selectedExistingPlayerId ? "Editar jugador existente" : "Nuevo jugador"}
      </h2>

      {(searchingPlayers || playerMatches.length > 0) && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
            background: "#f9fafb",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 6,
              color: "#111827",
            }}
          >
            {searchingPlayers
              ? "Buscando jugadores similares..."
              : "Posibles jugadores existentes"}
          </div>

          {!searchingPlayers &&
            playerMatches.map((p, index) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  borderBottom:
                    index < playerMatches.length - 1 ? "1px solid #e5e7eb" : "none",
                  fontSize: 11,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#111827",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.first_name || ""} {p.last_name || ""}
                  </div>
                  <div
                    style={{
                      color: "#4b5563",
                      lineHeight: 1.2,
                      marginTop: 2,
                      wordBreak: "break-word",
                    }}
                  >
                    {p.club || "Sin club"} · {p.phone || "-"} · {p.email || "-"}
                    {p.ghin_number ? ` · GHIN: ${p.ghin_number}` : ""}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => useExistingPlayer(p)}
                  disabled={usingExistingPlayerId === p.id}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: usingExistingPlayerId === p.id ? 0.7 : 1,
                    pointerEvents:
                      usingExistingPlayerId === p.id ? "none" : "auto",
                    flexShrink: 0,
                  }}
                >
                  {usingExistingPlayerId === p.id ? "Cargando..." : "Usar existente"}
                </button>
              </div>
            ))}
        </div>
      )}

      {selectedExistingPlayerId && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#1f2937",
            }}
          >
            Modo edición de jugador existente
          </div>

          <button
            type="button"
            onClick={resetForm}
            style={secondaryButtonStyle}
          >
            Nuevo jugador
          </button>
        </div>
      )}

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
        <label style={labelStyle}>
          Nombre
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Apellido
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Iniciales
          <input
            value={initials}
            onChange={(e) => setInitials(normalizeInitials(e.target.value))}
            placeholder="Ej. MAZ"
            maxLength={6}
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
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

        <label style={labelStyle}>
          Handicap Index
          <input
            value={handicapIndex}
            onChange={(e) => setHandicapIndex(e.target.value)}
            placeholder="Ej. -1.2, 0, 12.5"
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Handicap Torneo
          <input
            value={handicapTorneo}
            onChange={(e) => setHandicapTorneo(e.target.value)}
            placeholder="Ej. -1, 0, 10"
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Año nacimiento
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="Ej. 1978"
            type="number"
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Teléfono
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="4421490361"
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          GHIN
          <input
            value={ghinNumber}
            onChange={(e) => setGhinNumber(e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label style={labelStyle}>
          Talla Playera
          <select
            value={shirtSize}
            onChange={(e) => setShirtSize(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Seleccionar</option>
            <option>S</option>
            <option>M</option>
            <option>L</option>
            <option>XL</option>
            <option>XXL</option>
          </select>
        </label>

        <label style={labelStyle}>
          Talla Zapatos
          <select
            value={shoeSize}
            onChange={(e) => setShoeSize(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Seleccionar</option>
            {[
              1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6,
              6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12,
            ].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div ref={clubBoxRef} style={{ position: "relative" }}>
          <label style={labelStyle}>
            Club
            <input
              value={club}
              onChange={(e) => {
                setClub(e.target.value);
                setClubId(null);
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
                    selectClub(clubSuggestions[selectedClubIndex]);
                  } else if (!exactMatchExists && club.trim()) {
                    setClub(club.trim());
                    setClubId(null);
                    setClubDropdownOpen(false);
                    setSelectedClubIndex(-1);
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
                  onMouseDown={() => {
                    setClub(club.trim());
                    setClubId(null);
                    setClubDropdownOpen(false);
                    setSelectedClubIndex(-1);
                  }}
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
                    onMouseDown={() => selectClub(item)}
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
                    onMouseDown={() => {
                      setClub(club.trim());
                      setClubId(null);
                      setClubDropdownOpen(false);
                      setSelectedClubIndex(-1);
                    }}
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
            : selectedExistingPlayerId
              ? returnTournament
                ? "Actualizar e inscribir"
                : "Actualizar jugador"
              : returnTournament
                ? "Crear jugador e inscribir"
                : "Crear jugador"}
        </button>

        {msg && (
          <div
            style={{
              color:
                msg.startsWith("✅") || msg.startsWith("ℹ️")
                  ? "#166534"
                  : "#b91c1c",
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