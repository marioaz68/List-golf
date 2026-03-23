"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender: "M" | "F" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
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
  const [gender, setGender] = useState<"M" | "F">("M");
  const [handicapIndex, setHandicapIndex] = useState<string>("");
  const [handicapTorneo, setHandicapTorneo] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [club, setClub] = useState("");

  useEffect(() => {
    setFirstName(player?.first_name ?? "");
    setLastName(player?.last_name ?? "");
    setGender(player?.gender === "F" ? "F" : "M"); // default M
    setHandicapIndex(player?.handicap_index == null ? "" : String(player.handicap_index));
    setHandicapTorneo(player?.handicap_torneo == null ? "" : String(player.handicap_torneo));
    setPhone(player?.phone ?? "");
    setEmail(player?.email ?? "");
    setClub(player?.club ?? "");
  }, [player]);

  if (!open) return null;

  function toNumberOrNull(v: string) {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();

    // ✅ Validación mínima
    if (!firstName.trim() || !lastName.trim()) {
      alert("First name y Last name son obligatorios.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("players")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender,
        handicap_index: toNumberOrNull(handicapIndex),
        handicap_torneo: toNumberOrNull(handicapTorneo),
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || null,
        club: club.trim() || null,
      })
      .eq("id", player.id);

    if (error) {
      alert("Error al guardar: " + error.message);
      return;
    }

    onClose();
    startTransition(() => router.refresh());
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.4)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "white", padding: 16, borderRadius: 12, width: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Editar jugador</h3>

        <form onSubmit={onSave} style={{ display: "grid", gap: 10 }}>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
          />

          {/* ✅ Nuevo: Género */}
          <label style={{ display: "grid", gap: 6 }}>
            <span>Género</span>
            <select value={gender} onChange={(e) => setGender(e.target.value as "M" | "F")}>
              <option value="M">Caballeros</option>
              <option value="F">Damas</option>
            </select>
          </label>

          <input
            value={handicapIndex}
            onChange={(e) => setHandicapIndex(e.target.value)}
            placeholder="Handicap index (ej. 12.4 o -1.2)"
            inputMode="decimal"
          />
          <input
            value={handicapTorneo}
            onChange={(e) => setHandicapTorneo(e.target.value)}
            placeholder="Handicap torneo (ej. 10)"
            inputMode="decimal"
          />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input value={club} onChange={(e) => setClub(e.target.value)} placeholder="Club" />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending}>
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}