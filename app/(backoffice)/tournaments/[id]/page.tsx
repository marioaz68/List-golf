"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

type Tournament = {
  id: string;
  name: string;
  status: string | null;
};

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,name,status")
        .eq("id", id)
        .single();

      if (error) setErrorMsg(error.message);
      else setTournament(data);
    };

    if (id) load();
  }, [id]);

  if (errorMsg) return <main style={{ padding: 40 }}>Error: {errorMsg}</main>;
  if (!tournament) return <main style={{ padding: 40 }}>Cargando...</main>;

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>{tournament.name}</h1>
      <p>Estatus: {tournament.status || "-"}</p>

      <p style={{ marginTop: 20 }}>
        <a href="/">← Volver</a>
      </p>
    </main>
  );
}