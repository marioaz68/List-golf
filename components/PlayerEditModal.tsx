"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { savePlayerAction } from "@/app/(backoffice)/players/actions";

type ClubOption = {
  id: string;
  name: string;
  short_name: string | null;
  normalized_name: string;
  is_active?: boolean | null;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
  club_id?: string | null;
  shirt_size?: string | null;
  shoe_size?: string | number | null;
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

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.4)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: "white",
  padding: 16,
  borderRadius: 12,
  width: "min(720px, 96vw)",
  boxShadow: "0 10px 30px rgba(0,0,0,.18)",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  color: "#111827",
  fontSize: 12,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#111827",
  fontSize: 11,
  fontWeight: 600,
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  cursor: "pointer",
};

const cancelButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #d1d5db",
};

export default function PlayerEditModal({
  open,
  onClose,
  player,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initials, setInitials] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "X">("M");
  const [handicapIndex, setHandicapIndex] = useState<string>("");
  const [handicapTorneo, setHandicapTorneo] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [club, setClub] = useState("");
  const [clubId, setClubId] = useState<string | null>(null);
  const [shirtSize, setShirtSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [saving, setSaving] = useState(false);

  const [clubSuggestions, setClubSuggestions] = useState<ClubOption[]>([]);
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [clubSearchLoading, setClubSearchLoading] = useState(false);
  const [selectedClubIndex, setSelectedClubIndex] = useState(-1);

  const clubBoxRef = useRef<HTMLDivElement | null>(null);

  const normalizedTypedClub = useMemo(() => normalizeClubName(club), [club]);

  useEffect(() => {
    async function loadInitialData() {
      setFirstName(player?.first_name ?? "");
      setLastName(player?.last_name ?? "");
      setInitials(player?.initials ?? "");
      setGender(
        player?.gender === "F" ? "F" : player?.gender === "X" ? "X" : "M"
      );
      setHandicapIndex(
        player?.handicap_index == null ? "" : String(player.handicap_index)
      );
      setHandicapTorneo(
        player?.handicap_torneo == null ? "" : String(player.handicap_torneo)
      );
      setPhone(player?.phone ?? "");
      setEmail(player?.email ?? "");
      setClub(player?.club ?? "");
      setClubId(player?.club_id ?? null);
      setShirtSize(player?.shirt_size ?? "");
      setShoeSize(
        player?.shoe_size == null ? "" : String(player.shoe_size)
      );
      setClubSuggestions([]);
      setClubDropdownOpen(false);
      setSelectedClubIndex(-1);

      if (!open || !player?.club_id) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("clubs")
        .select("id,name,short_name,normalized_name,is_active")
        .eq("id", player.club_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!error && data?.id) {
        setClub(data.name ?? player?.club ?? "");
        setClubId(data.id);
      }
    }

    loadInitialData();
  }, [player, open]);

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

    if (!open || term.length < 2) {
      setClubSuggestions([]);
      setClubSearchLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setClubSearchLoading(true);

      const supabase = createClient();
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
  }, [club, open]);

  if (!open) return null;

  function toNumberOrNull(v: string) {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

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
    const supabase = createClient();

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
      setClub(existing.name);
      setClubId(existing.id);
      return {
        id: existing.id,
        name: existing.name,
      };
    }

    const { data: inserted, error: insertClubError } = await supabase
      .from("clubs")
      .insert({
        name: trimmed,
        short_name: trimmed,
        normalized_name,
        is_active: true,
      })
      .select("id,name,short_name,is_active")
      .single();

    if (insertClubError && insertClubError.code !== "23505") {
      throw new Error(insertClubError.message);
    }

    if (inserted?.id) {
      setClub(inserted.name);
      setClubId(inserted.id);
      return {
        id: inserted.id,
        name: inserted.name,
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
        setClub(retryExisting.name);
        setClubId(retryExisting.id);
        return {
          id: retryExisting.id,
          name: retryExisting.name,
        };
      }
    }

    return {
      id: null,
      name: trimmed,
    };
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      alert("Nombre y apellido son obligatorios.");
      return;
    }

    const hi = toNumberOrNull(handicapIndex);
    const ht = toNumberOrNull(handicapTorneo);
    const cleanInitials = normalizeInitials(initials);

    if (cleanInitials && cleanInitials.length < 2) {
      alert("Iniciales debe tener entre 2 y 6 letras.");
      return;
    }

    setSaving(true);

    try {
      let finalClubText: string | null = null;
      let finalClubId: string | null = clubId;

      if (club.trim()) {
        const ensured = await ensureClubExists(club);
        finalClubText = ensured?.name?.trim() || null;
        finalClubId = ensured?.id ?? finalClubId ?? null;
      }

      const result = await savePlayerAction({
        id: player.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        initials: cleanInitials || null,
        gender,
        handicap_index: hi,
        handicap_torneo: ht,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || null,
        club: finalClubText,
        club_id: finalClubId,
        shirt_size: shirtSize.trim() || null,
        shoe_size: shoeSize.trim() || null,
      });

      if (!result.ok) {
        alert("Error al guardar: " + result.message);
        return;
      }

      onClose();
      startTransition(() => router.refresh());
    } catch (err: any) {
      alert("Error al guardar: " + (err?.message ?? "Error desconocido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3
          style={{
            margin: 0,
            marginBottom: 12,
            fontSize: 18,
            color: "#111827",
          }}
        >
          Editar jugador
        </h3>

        <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <label style={labelStyle}>
              Nombre
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nombre"
                required
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Apellido
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Apellido"
                required
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
                onChange={(e) => setGender(e.target.value as "M" | "F" | "X")}
                style={fieldStyle}
              >
                <option value="M">Caballeros</option>
                <option value="F">Damas</option>
                <option value="X">Mixto</option>
              </select>
            </label>

            <label style={labelStyle}>
              Handicap Index
              <input
                value={handicapIndex}
                onChange={(e) => setHandicapIndex(e.target.value)}
                placeholder="Ej. 12.4 o -1.2"
                inputMode="decimal"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Handicap Torneo
              <input
                value={handicapTorneo}
                onChange={(e) => setHandicapTorneo(e.target.value)}
                placeholder="Ej. 10"
                inputMode="decimal"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Teléfono
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Teléfono"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Shirt Size
              <input
                value={shirtSize}
                onChange={(e) => setShirtSize(e.target.value)}
                placeholder="Ej. S, M, L, XL"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Shoe Size
              <input
                value={shoeSize}
                onChange={(e) => setShoeSize(e.target.value)}
                placeholder="Ej. 8, 9, 10"
                style={fieldStyle}
              />
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

                    if (
                      !clubDropdownOpen &&
                      e.key === "ArrowDown" &&
                      totalOptions > 0
                    ) {
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

                    if (
                      e.key === "Enter" &&
                      clubDropdownOpen &&
                      selectedClubIndex >= 0
                    ) {
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
                  autoComplete="off"
                  style={fieldStyle}
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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending || saving}
              style={cancelButtonStyle}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || saving}
              style={{
                ...buttonStyle,
                opacity: isPending || saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}