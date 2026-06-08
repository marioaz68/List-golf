/**
 * /fb-admin/mesas-qr — genera códigos QR imprimibles para cada mesa.
 *
 * Cada QR apunta a `https://<app>/mesa/<code>`. El comensal lo escanea con
 * la cámara del teléfono y entra directo al menú público de la mesa.
 *
 * Optimizado para impresión: una hoja A4 con 6 QR por página (210x297 mm).
 * Pegar uno por mesa en el portavasos o en una plaquita.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import MesasQrClient from "./MesasQrClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
  "restaurante",
]);

export interface MesaQrRow {
  id: string;
  code: string;
  name: string | null;
  capacity: number;
  area: string;
  venueId: string;
  venueName: string;
}

export default async function MesasQrPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/fb-admin/mesas-qr");

  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  const ok = roles.some((r) => ALLOWED_ROLES.has(r));
  if (!ok) redirect("/inicio");

  // Cargar todas las mesas activas
  const { data: rawTables } = await admin
    .from("fb_tables")
    .select(
      "id, code, name, capacity, area, venue_id, fb_venues!inner(id, name)"
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const tables: MesaQrRow[] = ((rawTables ?? []) as Array<Record<string, unknown>>).map(
    (t) => {
      const venue = t.fb_venues as
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
      const v = Array.isArray(venue) ? venue[0] : venue;
      return {
        id: String(t.id),
        code: String(t.code),
        name: t.name ? String(t.name) : null,
        capacity: Number(t.capacity ?? 4),
        area: String(t.area ?? "salon"),
        venueId: String(t.venue_id),
        venueName: v?.name ?? "—",
      };
    }
  );

  if (tables.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow ring-1 ring-slate-200">
          <h1 className="text-lg font-bold text-slate-900">QR por mesa</h1>
          <p className="mt-2 text-sm text-slate-600">
            No hay mesas activas en fb_tables. Agrega mesas desde Supabase y
            vuelve aquí.
          </p>
          <Link
            href="/fb-admin"
            className="mt-4 inline-block text-sm font-semibold text-indigo-600 underline"
          >
            ← Volver a F&B Admin
          </Link>
        </div>
      </div>
    );
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.listgolf.club"
  ).replace(/\/$/, "");

  return <MesasQrClient tables={tables} appUrl={appUrl} />;
}
