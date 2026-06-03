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

type TournamentRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  status: string | null;
  start_date: string | null;
};

type EntryRow = {
  id: string;
  tournament_id: string;
  player_id: string;
  player_number: number | null;
  status: string | null;
  players: PlayerRow | PlayerRow[] | null;
  categories: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
};

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayTournamentName(t: TournamentRow) {
  return t.short_name?.trim() || t.name || "Torneo";
}

function displayEntryLabel(e: EntryRow) {
  const player = oneOrNull(e.players);
  const name = player
    ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
    : "Sin nombre";
  const cat = oneOrNull(e.categories);
  const catLabel = cat?.code ?? cat?.name ?? "";
  const num = e.player_number != null ? `#${e.player_number} · ` : "";
  return `${num}${name}${catLabel ? ` · ${catLabel}` : ""}`;
}

export default async function NewCaddiePage() {
  const supabase = await createClient();

  const [clubsRes, caddiesRes, playersRes, favoritesRes, tournamentsRes, entriesRes] =
    await Promise.all([
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

    supabase
      .from("tournaments")
      .select("id, name, short_name, status, start_date")
      .not("status", "eq", "completed")
      .not("status", "eq", "cancelled")
      .order("start_date", { ascending: false }),

    supabase
      .from("tournament_entries")
      .select(
        `
        id,
        tournament_id,
        player_id,
        player_number,
        status,
        players ( id, first_name, last_name ),
        categories ( code, name )
      `
      )
      .neq("status", "withdrawn")
      .order("player_number", { ascending: true, nullsFirst: false }),
  ]);

  if (clubsRes.error) throw new Error(`Error leyendo clubs: ${clubsRes.error.message}`);
  if (caddiesRes.error) throw new Error(`Error leyendo caddies: ${caddiesRes.error.message}`);
  if (playersRes.error) throw new Error(`Error leyendo players: ${playersRes.error.message}`);
  if (favoritesRes.error) {
    throw new Error(`Error leyendo favoritos: ${favoritesRes.error.message}`);
  }
  if (tournamentsRes.error) {
    throw new Error(`Error leyendo torneos: ${tournamentsRes.error.message}`);
  }
  if (entriesRes.error) {
    throw new Error(`Error leyendo inscritos: ${entriesRes.error.message}`);
  }

  const clubs = (clubsRes.data ?? []) as ClubRow[];
  const caddies = (caddiesRes.data ?? []) as CaddieRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const favorites = (favoritesRes.data ?? []) as FavoriteRow[];
  const tournaments = (tournamentsRes.data ?? []) as TournamentRow[];
  const tournamentEntries = (entriesRes.data ?? []) as EntryRow[];

  const tournamentOptions = tournaments.map((t) => ({
    id: t.id,
    name: displayTournamentName(t),
    status: t.status,
  }));

  const entryOptions = tournamentEntries.map((e) => ({
    entryId: e.id,
    tournamentId: e.tournament_id,
    playerId: e.player_id,
    label: displayEntryLabel(e),
  }));

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

        <Link
          href="/caddies"
          style={{
            height: 36,
            padding: "0 16px",
            border: "1px solid #1f2937",
            borderRadius: 8,
            background: "#111827",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          Asignar torneo →
        </Link>
      </div>

      <CaddieClient
        clubs={clubs}
        caddies={caddies}
        players={players}
        initialSelectedCaddie={null}
        favoriteIdsByCaddie={favoriteIdsByCaddie}
        tournaments={tournamentOptions}
        tournamentEntries={entryOptions}
      />
    </div>
  );
}