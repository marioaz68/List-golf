/**
 * Crear pedido en nombre del cliente (cuando pide verbalmente al carrito
 * o al restaurante). El cliente recibe el banner amarillo en su Mini App
 * para confirmar/disputar antes de que se cargue a su cuenta.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import {
  groupMenuByCategory,
  listCategories,
  listMenuItems,
  listVenues,
} from "@/lib/fb/queries";
import { loadNearbyClients, type NearbyClient } from "@/lib/fb/nearbyClients";
import NuevoPedidoClient from "./NuevoPedidoClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ClientOption {
  key: string;
  kind: "player" | "caddie";
  id: string;
  name: string;
  tournamentName: string;
  groupNo: number | null;
}

interface PageProps {
  searchParams: Promise<{ venue?: string }>;
}

export default async function FbNuevoPedidoPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const venueCodeFromUrl = sp.venue?.trim() ?? null;
  const admin = createAdminClient();

  const [venues, categories, items] = await Promise.all([
    listVenues(admin, { onlyActive: true }),
    listCategories(admin, { onlyActive: true }),
    listMenuItems(admin, { onlyActive: true }),
  ]);

  const menu = groupMenuByCategory(categories, items);

  // Lista de clientes activos (entries de torneos no archivados + caddies activos)
  const { data: entries } = await admin
    .from("tournament_entries")
    .select(
      "id, players ( first_name, last_name ), tournaments ( id, name, status ), pairing_group_members ( pairing_groups ( group_no ) )"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const clients: ClientOption[] = [];
  for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
    const t = e.tournaments as
      | { id?: string; name?: string; status?: string }
      | { id?: string; name?: string; status?: string }[]
      | null;
    const tour = Array.isArray(t) ? t[0] : t;
    if (tour?.status === "archived") continue;
    const p = e.players as
      | { first_name?: string; last_name?: string }
      | { first_name?: string; last_name?: string }[]
      | null;
    const player = Array.isArray(p) ? p[0] : p;
    if (!player) continue;
    const fullName = [player.first_name, player.last_name]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (!fullName) continue;
    const gm = e.pairing_group_members as
      | Array<{ pairing_groups?: { group_no?: number } | { group_no?: number }[] }>
      | undefined;
    let groupNo: number | null = null;
    if (Array.isArray(gm) && gm.length > 0) {
      const pg = gm[0]?.pairing_groups;
      const grp = Array.isArray(pg) ? pg[0] : pg;
      if (grp?.group_no != null) groupNo = Number(grp.group_no);
    }
    clients.push({
      key: `e:${e.id}`,
      kind: "player",
      id: String(e.id),
      name: fullName,
      tournamentName: tour?.name ?? "—",
      groupNo,
    });
  }

  const { data: caddies } = await admin
    .from("caddies")
    .select("id, first_name, last_name")
    .order("first_name", { ascending: true })
    .limit(200);
  for (const c of (caddies ?? []) as Array<Record<string, unknown>>) {
    const full = [c.first_name, c.last_name]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (!full) continue;
    clients.push({
      key: `c:${c.id}`,
      kind: "caddie",
      id: String(c.id),
      name: full,
      tournamentName: "Caddie",
      groupNo: null,
    });
  }

  // Si vino ?venue=XXX en la URL (link desde mini app del carrito), calcular
  // jugadores cercanos al carrito usando GPS.
  let nearby: NearbyClient[] = [];
  let nearbyMeta: {
    venueCode: string;
    cartLocated: boolean;
    cartHole: number | null;
    cartLastSeenAgoMin: number | null;
  } | null = null;
  if (venueCodeFromUrl) {
    const res = await loadNearbyClients(admin, venueCodeFromUrl, {
      maxMeters: 300,
      maxResults: 10,
      maxAgeMinutes: 30,
    });
    nearby = res.clients;
    nearbyMeta = {
      venueCode: venueCodeFromUrl,
      cartLocated: res.cartLocated,
      cartHole: res.cartHole,
      cartLastSeenAgoMin: res.cartLastSeenAgoMin,
    };
  }

  // Default venue: si vino ?venue=XXX, preseleccionarlo
  const defaultVenueCode = venueCodeFromUrl;

  return (
    <NuevoPedidoClient
      venues={venues}
      menu={menu}
      clients={clients}
      nearby={nearby}
      nearbyMeta={nearbyMeta}
      defaultVenueCode={defaultVenueCode}
    />
  );
}

export type { ClientOption };
