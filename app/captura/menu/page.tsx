/**
 * Vista pública del menú F&B para clientes desde la Mini App de Telegram.
 *
 * Identidad por query params:
 *   ?me=<entry_id>       → jugador de un torneo (captura en campo)
 *   ?caddie=<caddie_id>  → caddie
 *   ?u=<telegram_user_id> → socio/residente (comando "menu" del bot). Se
 *     resuelve aquí en el server a su player_id + entry más reciente.
 *
 * El componente cliente lee los datos del backend (no SSR pesado) para
 * que se sienta instantánea — el usuario solo cambia de página dentro de
 * la misma Mini App.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import MenuClient from "./MenuClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    me?: string;
    caddie?: string;
    u?: string;
    player?: string;
    back?: string;
  }>;
}

export default async function MenuPage({ searchParams }: Props) {
  const sp = await searchParams;
  const meEntryId = sp.me?.trim() || null;
  const caddieId = sp.caddie?.trim() || null;
  const telegramUserId = sp.u?.trim() || null;
  const directPlayerId = sp.player?.trim() || null;
  const backHref = sp.back?.trim() || null;

  // Identidad resuelta del socio (cuando se abre con ?u= del bot "menu")
  let playerId: string | null = null;
  let playerEntryId: string | null = null;
  let clientName: string | null = null;
  let savedAddress: string | null = null;
  let unlinkedTelegram = false;

  if (!meEntryId && !caddieId && (telegramUserId || directPlayerId)) {
    const admin = createAdminClient();
    const lookup = admin
      .from("players")
      .select("id, first_name, last_name, address");
    const { data: player } = directPlayerId
      ? await lookup.eq("id", directPlayerId).maybeSingle()
      : await lookup.eq("telegram_user_id", telegramUserId!).maybeSingle();

    if (player) {
      const p = player as {
        id: string;
        first_name?: string;
        last_name?: string;
        address?: string | null;
      };
      playerId = p.id;
      savedAddress = p.address?.trim() || null;
      clientName =
        [p.first_name, p.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;

      // Entry más reciente (si el socio ya jugó o tiene ronda activa).
      const { data: entry } = await admin
        .from("tournament_entries")
        .select("id, created_at")
        .eq("player_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      playerEntryId = (entry as { id?: string } | null)?.id ?? null;
    } else if (telegramUserId) {
      unlinkedTelegram = true;
    }
  }

  return (
    <MenuClient
      initialEntryId={meEntryId ?? playerEntryId}
      initialCaddieId={caddieId}
      initialPlayerId={playerId}
      clientName={clientName}
      savedAddress={savedAddress}
      backHref={backHref}
      unlinkedTelegram={unlinkedTelegram}
      telegramUserId={telegramUserId}
    />
  );
}
