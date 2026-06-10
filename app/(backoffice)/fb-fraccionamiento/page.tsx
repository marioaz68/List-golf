/**
 * Pantalla "Fraccionamiento" del backoffice.
 *
 * Lista a los clientes del fraccionamiento (reparto a domicilio) y permite
 * darlos de alta / editar su domicilio y teléfonos de contacto. Un cliente del
 * fraccionamiento es un `player` con is_resident=true; no necesita inscripción
 * a torneo, solo estar conectado al sistema (Telegram).
 *
 * Desde aquí también se puede tomar un pedido para enviarlo al carrito
 * Fraccionamiento (botón "Tomar pedido" → mini app del menú del cliente).
 */
import { createAdminClient } from "@/utils/supabase/admin";
import FraccionamientoClient, { type Resident } from "./FraccionamientoClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FraccionamientoPage() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("players")
    .select(
      "id, first_name, last_name, phone, whatsapp_phone_e164, address, telegram_user_id"
    )
    .eq("is_resident", true)
    .order("first_name", { ascending: true });

  if (error) {
    console.error("FraccionamientoPage load:", error);
  }

  const residents: Resident[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      id: String(r.id),
      firstName: String(r.first_name ?? ""),
      lastName: String(r.last_name ?? ""),
      phone: r.phone ? String(r.phone) : null,
      whatsapp: r.whatsapp_phone_e164 ? String(r.whatsapp_phone_e164) : null,
      address: r.address ? String(r.address) : null,
      telegramUserId: r.telegram_user_id ? String(r.telegram_user_id) : null,
    })
  );

  return <FraccionamientoClient initialResidents={residents} />;
}
