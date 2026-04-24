import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import CaddieClient from "@/components/CaddieClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

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

export default async function NewCaddiePage() {
  const supabase = await createClient();

  const [clubsRes, caddiesRes, playersRes, favoritesRes] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, short_name")
      .eq("is_active", true)
      .order("name", { ascending: true }),

    supabase
      .from("caddies")
      .select(
        "id, first_name, last_name, nickname, phone, telegram, whatsapp_phone, whatsapp_phone_e164, email, club_id, notes, is_active, created_at, level"
      )
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),

    supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),

    supabase.from("caddie_favorites").select("caddie_id, player_id"),
  ]);

  if (clubsRes.error) throw new Error(`Error leyendo clubs: ${clubsRes.error.message}`);
  if (caddiesRes.error) throw new Error(`Error leyendo caddies: ${caddiesRes.error.message}`);
  if (playersRes.error) throw new Error(`Error leyendo players: ${playersRes.error.message}`);
  if (favoritesRes.error) {
    throw new Error(`Error leyendo favoritos: ${favoritesRes.error.message}`);
  }

  const clubs = (clubsRes.data ?? []) as ClubRow[];
  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const favorites = (favoritesRes.data ?? []) as FavoriteRow[];

  const favoriteIdsByCaddie: Record<string, string[]> = {};

  for (const f of favorites) {
    if (!favoriteIdsByCaddie[f.caddie_id]) {
      favoriteIdsByCaddie[f.caddie_id] = [];
    }
    favoriteIdsByCaddie[f.caddie_id].push(f.player_id);
  }

  return (
    <div style={{ padding: "16px 20px", display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid #dbe2ea",
          borderRadius: 12,
          background: "#ffffff",
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#0f172a" }}>
            CADDIES
          </h1>
          <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0 0" }}>
            Alta, edición y favoritos de caddies
          </p>
        </div>

        <Link href="/caddies" style={{ fontSize: 12, color: "#0f172a" }}>
          Asignaciones
        </Link>
      </div>

      <CaddieClient
        clubs={clubs}
        caddies={caddies}
        players={players}
        initialSelectedCaddie={null}
        favoriteIdsByCaddie={favoriteIdsByCaddie}
      />
    </div>
  );
}