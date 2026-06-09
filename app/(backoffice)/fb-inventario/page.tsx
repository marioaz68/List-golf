/**
 * /fb-inventario — vista de inventario para el MANAGER del restaurante.
 *
 * Muestra:
 *   - Dashboard de alertas: items con stock 0 (sin stock) y items bajos.
 *   - Tabla por venue con su inventario completo, editable in-place.
 *
 * Solo visible para super_admin, club_admin, tournament_director y
 * 'restaurante' (manager). Mesero / cocinero no entran aquí.
 */
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { listMenuItems } from "@/lib/fb/queries";
import InventarioClient from "./InventarioClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MANAGER_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "restaurante",
]);

export interface InventoryItem {
  menuItemId: string;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  priceCents: number;
  qtyAvailable: number;
  lowThreshold: number;
  isInfinite: boolean;
  updatedAt: string | null;
}

export interface VenueInventory {
  id: string;
  code: string;
  name: string;
  type: "restaurant" | "cart";
  items: InventoryItem[];
  outOfStockCount: number;
  lowStockCount: number;
}

export default async function FbInventarioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/fb-inventario");

  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  const ok = roles.some((r) => MANAGER_ROLES.has(r));
  if (!ok) redirect("/inicio");

  // Cargar venues activos (especialmente carritos donde el inventario importa)
  const { data: venuesRaw } = await admin
    .from("fb_venues")
    .select("id, code, name, type")
    .eq("is_active", true)
    .order("type", { ascending: false }) // carritos primero
    .order("display_order", { ascending: true });
  const venues = ((venuesRaw ?? []) as Array<Record<string, unknown>>).map(
    (v) => ({
      id: String(v.id),
      code: String(v.code),
      name: String(v.name),
      type: (v.type as "restaurant" | "cart") ?? "restaurant",
    })
  );

  // Cargar todos los items activos (filtramos por venue luego)
  const items = await listMenuItems(admin, { onlyActive: true });

  // Cargar todo el stock de todos los venues de una
  const venueIds = venues.map((v) => v.id);
  const { data: stockRaw } = await admin
    .from("fb_venue_stock")
    .select("venue_id, menu_item_id, qty_available, low_threshold, updated_at")
    .in("venue_id", venueIds);
  const stockByKey = new Map<
    string,
    { qty: number; low: number; updatedAt: string }
  >();
  for (const s of (stockRaw ?? []) as Array<Record<string, unknown>>) {
    const k = `${s.venue_id}::${s.menu_item_id}`;
    stockByKey.set(k, {
      qty: Number(s.qty_available ?? 0),
      low: Number(s.low_threshold ?? 3),
      updatedAt: String(s.updated_at),
    });
  }

  const venueInventories: VenueInventory[] = venues.map((v) => {
    const venueItems = items.filter((it) =>
      it.availableVenueIds.includes(v.id)
    );
    let outCount = 0;
    let lowCount = 0;
    const itemsOut: InventoryItem[] = venueItems.map((it) => {
      const s = stockByKey.get(`${v.id}::${it.id}`);
      const isInfinite = s == null;
      const qty = s?.qty ?? 0;
      const low = s?.low ?? 3;
      if (!isInfinite) {
        if (qty === 0) outCount++;
        else if (qty <= low) lowCount++;
      }
      return {
        menuItemId: it.id,
        name: it.name,
        emoji: it.displayEmoji,
        imageUrl: it.imageUrl,
        priceCents: it.priceCents,
        qtyAvailable: qty,
        lowThreshold: low,
        isInfinite,
        updatedAt: s?.updatedAt ?? null,
      };
    });
    // Ordenar: sin stock primero, luego bajos, luego resto alfabético
    itemsOut.sort((a, b) => {
      const aOut = !a.isInfinite && a.qtyAvailable === 0 ? 0 : 1;
      const bOut = !b.isInfinite && b.qtyAvailable === 0 ? 0 : 1;
      if (aOut !== bOut) return aOut - bOut;
      const aLow = !a.isInfinite && a.qtyAvailable <= a.lowThreshold ? 0 : 1;
      const bLow = !b.isInfinite && b.qtyAvailable <= b.lowThreshold ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return a.name.localeCompare(b.name);
    });
    return {
      id: v.id,
      code: v.code,
      name: v.name,
      type: v.type,
      items: itemsOut,
      outOfStockCount: outCount,
      lowStockCount: lowCount,
    };
  });

  return <InventarioClient venues={venueInventories} />;
}
