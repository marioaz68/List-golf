"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

function toNumber(v: string) {
  const s = (v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function NewPlayerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const first_name = String(form.get("first_name") || "").trim();
    const last_name = String(form.get("last_name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const club = String(form.get("club") || "").trim();
    const handicap_index = toNumber(String(form.get("handicap_index") || ""));
    const handicap_torneo = toNumber(String(form.get("handicap_torneo") || ""));

    // Si tienes el constraint raro de email_norm, al menos evitamos email vacío con espacios
    const safeEmail = email || null;

    const { error } = await supabase.from("players").insert([
      {
        first_name,
        last_name: last_name || null,
        email: safeEmail,
        phone: phone || null,
        club: club || null,
        handicap_index,
        handicap_torneo,
      },
    ]);

    setLoading(false);

    if (error) {
      // Mensaje amigable si es duplicado
      const msg =
        error.message.includes("duplicate key") ||
        error.message.includes("unique constraint")
          ? "Ese correo ya existe en jugadores. Usa otro correo o edita el jugador existente."
          : error.message;

      alert("Error guardando jugador: " + msg);
      return;
    }

    router.push("/players");
  }

  return (
    <main style={{ padding: 40, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Nuevo jugador</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Nombre(s) *
          <input name="first_name" required style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Apellidos
          <input name="last_name" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Correo (único recomendado)
          <input name="email" type="email" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Teléfono
          <input name="phone" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Club
          <input name="club" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Handicap índice
          <input name="handicap_index" inputMode="decimal" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Handicap torneo
          <input name="handicap_torneo" inputMode="decimal" style={{ width: "100%", padding: 10 }} />
        </label>

        <button disabled={loading} style={{ padding: 10 }}>
          {loading ? "Guardando..." : "Guardar jugador"}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        <a href="/players">← Volver a jugadores</a>
      </p>
    </main>
  );
}