import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import CaddieClient from "@/components/CaddieClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ================= TYPES ================= */

type CaddieRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp_phone: string | null;
  whatsapp_phone_e164: string | null;
  email: string | null;
  club_id: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  level: string | null;
};

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type FavoriteRow = {
  caddie_id: string;
  player_id: string;
};

/* ================= PAGE ================= */

export default async function NewCaddiePage() {
  const supabase = await createClient();

  const [caddiesRes, playersRes, favoritesRes] = await Promise.all([
    supabase
      .from("caddies")
      .select(`
        id,
        first_name,
        last_name,
        nickname,
        phone,
        telegram,
        whatsapp_phone,
        whatsapp_phone_e164,
        email,
        club_id,
        notes,
        is_active,
        created_at,
        level
      `)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),

    supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),

    supabase
      .from("caddie_favorites")
      .select("caddie_id, player_id"),
  ]);

  /* ================= ERROR HANDLING ================= */

  if (caddiesRes.error) {
    throw new Error(`Error leyendo caddies: ${caddiesRes.error.message}`);
  }

  if (playersRes.error) {
    throw new Error(`Error leyendo players: ${playersRes.error.message}`);
  }

  if (favoritesRes.error) {
    throw new Error(`Error leyendo favoritos: ${favoritesRes.error.message}`);
  }

  /* ================= DATA ================= */

  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const favorites = (favoritesRes.data ?? []) as FavoriteRow[];

  /* ================= MAP FAVORITES ================= */

  const favoriteIdsByCaddie: Record<string, string[]> = {};

  for (const f of favorites) {
    if (!favoriteIdsByCaddie[f.caddie_id]) {
      favoriteIdsByCaddie[f.caddie_id] = [];
    }
    favoriteIdsByCaddie[f.caddie_id].push(f.player_id);
  }

  /* ================= UI ================= */

  return (
    <div style={{ padding: 20, display: "grid", gap: 16 }}>
      
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>CADDIES</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Alta, edición y favoritos de caddies
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/caddies" style={{ fontSize: 12 }}>
            Asignaciones
          </Link>
        </div>
      </div>

      {/* CLIENT APP */}
      <CaddieClient
        caddies={caddies}
        players={players}
        initialSelectedCaddie={null}
        favoriteIdsByCaddie={favoriteIdsByCaddie}
      />
    </div>
  );
}