/**
 * Mini App pública del carrito bar. Acceso por URL con ?venue=cart_front
 * (el operador abre el link desde el bot @ListGolfBot o desde un QR
 * pegado en el carrito).
 *
 * Anónima (sin auth de backoffice) — funciona como las otras pantallas
 * de /captura. La identidad es la del venue, no la del operador.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import { loadActiveOrders } from "@/lib/fb/loadOrders";
import { listVenues } from "@/lib/fb/queries";
import CarritoOperadorClient from "./CarritoOperadorClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CarritoOperadorPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  const sp = await searchParams;
  const venueCode = sp.venue?.trim() ?? null;

  const admin = createAdminClient();
  const venues = await listVenues(admin, { onlyActive: true });
  const carts = venues.filter((v) => v.type === "cart");

  const selectedVenue = venueCode
    ? carts.find((v) => v.code === venueCode) ?? carts[0] ?? null
    : carts[0] ?? null;

  if (!selectedVenue) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
        <h1 className="text-xl font-bold">🚚 Carrito Bar</h1>
        <p className="mt-2 text-sm text-slate-400">
          No hay carritos configurados todavía. El comité debe agregarlos
          desde /fb-admin → tab Venues.
        </p>
      </div>
    );
  }

  const orders = await loadActiveOrders(admin, {
    venueId: selectedVenue.id,
    includeRecentCompleted: false,
  });

  return (
    <CarritoOperadorClient
      venue={selectedVenue}
      carts={carts}
      initialOrders={orders}
    />
  );
}
