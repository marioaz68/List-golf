"use client";

import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabaseClient";
import PlayerRowActions from "@/components/PlayerRowActions";

type CsvRow = {
  "JUGADOR": string;
  "HANDICAP INDICE": string | number;
  "CORREO ELECTRONICO": string;
  "TELEFONO": string;
  "CLUB": string;
  "HANDICAP TORNEO": string | number;
};

function toNumber(v: unknown) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitName(full: string) {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export default function UploadPlayersPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleUpload = (file: File) => {
    setLoading(true);
    setMsg("Leyendo CSV...");

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toUpperCase(),
      complete: async (results) => {
        try {
          if (results.errors?.length) {
            console.error(results.errors);
            setMsg("Error leyendo CSV. Revisa encabezados y separador.");
            return;
          }

          const rows = (results.data ?? [])
            .map((r) => {
              const jugador = String((r as any)["JUGADOR"] ?? "").trim();
              const { first_name, last_name } = splitName(jugador);

              const handicap_index = toNumber((r as any)["HANDICAP INDICE"]);
              const email = String((r as any)["CORREO ELECTRONICO"] ?? "")
                .trim()
                .toLowerCase();
              const phone = String((r as any)["TELEFONO"] ?? "").trim();
              const club = String((r as any)["CLUB"] ?? "").trim();
              const handicap_torneo = toNumber((r as any)["HANDICAP TORNEO"]);

              return {
                first_name: first_name || null,
                last_name: last_name || null,
                handicap_index,
                phone: phone || null,
                email: email || null,
                club: club || null,
                handicap_torneo,
              };
            })
            .filter((p) => (p.first_name || "").toString().trim().length > 0);

          if (!rows.length) {
            setMsg("No encontré filas válidas (revisa JUGADOR).");
            return;
          }

          setMsg(`Subiendo/Actualizando ${rows.length} jugadores...`);

          const { error } = await supabase
            .from("players")
            .upsert(rows as any, { onConflict: "email" });

          if (error) {
            console.error(error);
            setMsg("Error subiendo jugadores: " + error.message);
          } else {
            setMsg(`✅ Listo. Procesados ${rows.length} jugadores (insert/updated).`);
          }
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Subir jugadores desde CSV</h1>

      <p>
        Encabezados (MAYÚSCULAS):<br />
        JUGADOR, HANDICAP INDICE, CORREO ELECTRONICO, TELEFONO, CLUB, HANDICAP TORNEO
      </p>

      <input
        type="file"
        accept=".csv"
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />

      <p style={{ marginTop: 12 }}>{loading ? "Procesando..." : msg}</p>

      <p style={{ marginTop: 24 }}>
        <a href="/">← Volver</a>
      </p>
    </main>
  );
}