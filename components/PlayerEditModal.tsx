"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { normalizePhoneToE164 } from "@/utils/phone";
import { savePlayerAction } from "@/app/(backoffice)/players/actions";
import { updateEntryCategory } from "@/app/(backoffice)/entries/actions";

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
  birth_year?: number | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  gender?: "M" | "F" | "X" | null;
  handicap_min?: number | null;
  handicap_max?: number | null;
  min_age?: number | null;
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
  categories = [],
  tournamentId,
  entryId,
  currentCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
  categories?: Category[];
  tournamentId?: string;
  entryId?: string;
  currentCategoryId?: string | null;
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
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const [clubSuggestions, setClubSuggestions] = useState<ClubOption[]>([]);
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [clubSearchLoading, setClubSearchLoading] = useState(false);
  const [selectedClubIndex, setSelectedClubIndex] = useState(-1);

  const clubBoxRef = useRef<HTMLDivElement | null>(null);

  const normalizedTypedClub = useMemo(() => normalizeClubName(club), [club]);

  const playerAge = useMemo(() => {
    if (!player?.birth_year) return null;
    return new Date().getFullYear() - player.birth_year;
  }, [player?.birth_year]);

  const availableCategories = useMemo(() => {
    const playerGender = String(gender ?? "X").toUpperCase() as "M" | "F" | "X";
    const handicapValue = Number((handicapTorneo || handicapIndex || "").replace(",", "."));
    const ranking =
      playerGender === "F"
        ? ["DA", "DB", "DC"]
        : ["CA", "AA", "A", "B", "C", "DE"];

    const codeOf = (category: Category) => String(category.code ?? "").toUpperCase();

    const genderOk = (category: Category) => {
      const catGender = String(category.gender ?? "X").toUpperCase();

      if (catGender === "X") return true;
      return catGender === playerGender;
    };

    const isSeniorCategory = (category: Category) => {
      const code = codeOf(category);

      return (
        category.min_age !== null &&
        category.min_age !== undefined &&
        (code === "S" ||
          code === "SS" ||
          code.includes("SENIOR"))
      );
    };

    const regularCategories = categories.filter((category) => {
      const code = codeOf(category);
      return ranking.includes(code) && !isSeniorCategory(category) && genderOk(category);
    });

    const currentCategory = categories.find((category) => category.id === currentCategoryId);
    const currentCode = currentCategory ? codeOf(currentCategory) : "";
    const currentIndex = ranking.findIndex((code) => code === currentCode);

    const handicapCategory = Number.isFinite(handicapValue)
      ? regularCategories.find((category) => {
          if (category.handicap_min === null || category.handicap_min === undefined) {
            return false;
          }

          if (category.handicap_max === null || category.handicap_max === undefined) {
            return false;
          }

          return (
            handicapValue >= Number(category.handicap_min) &&
            handicapValue <= Number(category.handicap_max)
          );
        }) ?? null
      : null;

    const handicapCode = handicapCategory ? codeOf(handicapCategory) : "";
    const handicapIndexRank = ranking.findIndex((code) => code === handicapCode);
    const baseIndex = currentIndex >= 0 ? currentIndex : handicapIndexRank;

    const allowedByRank =
      baseIndex >= 0
        ? regularCategories.filter((category) => {
            const idx = ranking.findIndex((code) => code === codeOf(category));
            return idx >= 0 && idx <= baseIndex;
          })
        : regularCategories;

    const seniorOptions = categories.filter((category) => {
      if (!isSeniorCategory(category)) return false;
      if (!genderOk(category)) return false;
      if (playerAge === null) return false;

      return playerAge >= Number(category.min_age);
    });

    const byId = new Map<string, Category>();

    [...allowedByRank, ...seniorOptions].forEach((category) => {
      byId.set(category.id, category);
    });

    if (currentCategory && !byId.has(currentCategory.id) && genderOk(currentCategory)) {
      byId.set(currentCategory.id, currentCategory);
    }

    return Array.from(byId.values()).sort((a, b) => {
      const aSenior = isSeniorCategory(a);
      const bSenior = isSeniorCategory(b);

      if (aSenior !== bSenior) return aSenior ? -1 : 1;

      if (aSenior && bSenior) {
        return Number(b.min_age ?? 0) - Number(a.min_age ?? 0);
      }

      const aRank = ranking.findIndex((code) => code === codeOf(a));
      const bRank = ranking.findIndex((code) => code === codeOf(b));

      return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
    });
  }, [
    categories,
    gender,
    handicapIndex,
    handicapTorneo,
    currentCategoryId,
    playerAge,
  ]);

  const canUpdateEntryCategory = Boolean(entryId && tournamentId);

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
      setShoeSize(player?.shoe_size == null ? "" : String(player.shoe_size));
      setSelectedCategoryId(currentCategoryId ?? "");
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
  }, [player, open, currentCategoryId]);

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
    const normalizedWhatsappPhone = phone.trim()
      ? normalizePhoneToE164(phone, "MX")
      : null;
    const cleanEmail = email.trim().toLowerCase() || null;

    if (cleanInitials && cleanInitials.length < 2) {
      alert("Iniciales debe tener entre 2 y 6 letras.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      if (normalizedWhatsappPhone) {
        const { data: existingByWhatsapp, error: whatsappError } = await supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("whatsapp_phone_e164", normalizedWhatsappPhone)
          .neq("id", player.id)
          .limit(1);

        if (whatsappError) {
          throw new Error(whatsappError.message);
        }

        if (existingByWhatsapp && existingByWhatsapp.length > 0) {
          alert(
            `Ya existe jugador con ese WhatsApp: ${existingByWhatsapp[0].first_name ?? ""} ${existingByWhatsapp[0].last_name ?? ""}`.trim()
          );
          return;
        }
      }

      if (cleanEmail) {
        const { data: existingByEmail, error: emailError } = await supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("email", cleanEmail)
          .neq("id", player.id)
          .limit(1);

        if (emailError) {
          throw new Error(emailError.message);
        }

        if (existingByEmail && existingByEmail.length > 0) {
          alert(
            `Ya existe jugador con ese email: ${existingByEmail[0].first_name ?? ""} ${existingByEmail[0].last_name ?? ""}`.trim()
          );
          return;
        }
      }

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
        whatsapp_phone_e164: normalizedWhatsappPhone,
        email: cleanEmail,
        club: finalClubText,
        club_id: finalClubId,
        shirt_size: shirtSize.trim() || null,
        shoe_size: shoeSize.trim() || null,
      });

      if (!result.ok) {
        alert("Error al guardar: " + result.message);
        return;
      }

      if (selectedCategoryId && entryId && tournamentId) {
        const categoryForm = new FormData();
        categoryForm.set("entry_id", entryId);
        categoryForm.set("tournament_id", tournamentId);
        categoryForm.set("category_id", selectedCategoryId);

        await updateEntryCategory(categoryForm);
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
              Categoría inscripción
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={!canUpdateEntryCategory}
                style={fieldStyle}
                title={
                  canUpdateEntryCategory
                    ? "Cambiar categoría de inscripción"
                    : "Falta entryId/tournamentId para guardar categoría"
                }
              >
                <option value="">Seleccionar categoría</option>

                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.code ?? category.name ?? "Categoría"}
                  </option>
                ))}
              </select>
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
  <select
    value={shirtSize}
    onChange={(e) => setShirtSize(e.target.value)}
    style={fieldStyle}
  >
    <option value="">Seleccionar</option>
    <option>XS</option>
    <option>S</option>
    <option>M</option>
    <option>L</option>
    <option>XL</option>
    <option>XXL</option>
  </select>
</label>

<label style={labelStyle}>
  Shoe Size
  <select
    value={shoeSize}
    onChange={(e) => setShoeSize(e.target.value)}
    style={fieldStyle}
  >
    <option value="">Seleccionar</option>
    {[
      6, 6.5, 7, 7.5, 8, 8.5,
      9, 9.5, 10, 10.5, 11, 11.5,
      12, 12.5, 13, 13.5, 14
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