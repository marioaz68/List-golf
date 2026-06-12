/**
 * Comando /CARRITO en el bot @ListGolfBot — manda al operador del carrito
 * el link a su Mini App.
 *
 * Sintaxis:
 *   /CARRITO         → muestra menú con todos los carritos activos
 *   /CARRITO FRONT   → link directo al cart_front
 *   /CARRITO BACK    → link directo al cart_back
 *   /BAR             → alias de /CARRITO
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramAppUrl } from "@/lib/telegram/appUrl";

const COMMANDS = new Set(["CARRITO", "/CARRITO", "BAR", "/BAR"]);

export function isCartCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return telegramAppUrl();
}

export async function buildCartReply(
  supabase: SupabaseClient,
  text: string
): Promise<{ text: string; buttons: { text: string; url: string }[][] }> {
  const parts = text.trim().toUpperCase().split(/\s+/);
  const arg = parts[1] ?? "";

  // Cargar carritos activos del fb_venues
  const { data: vsRaw } = await supabase
    .from("fb_venues")
    .select("id, code, name, hole_range_start, hole_range_end")
    .eq("type", "cart")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const carts = (vsRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    hole_range_start: number | null;
    hole_range_end: number | null;
  }>;

  if (carts.length === 0) {
    return {
      text:
        "No hay carritos bar configurados. El comité debe agregarlos desde /fb-admin → Venues.",
      buttons: [],
    };
  }

  // Resolver venue específico si vino con argumento
  let targetCart = null;
  if (arg) {
    const wanted = arg.toLowerCase();
    targetCart =
      carts.find(
        (c) =>
          c.code.toLowerCase().includes(wanted) ||
          c.name.toLowerCase().includes(wanted)
      ) ?? null;
  }

  if (targetCart) {
    return {
      text: [
        `🚚 ${targetCart.name}`,
        targetCart.hole_range_start && targetCart.hole_range_end
          ? `Hoyos ${targetCart.hole_range_start}-${targetCart.hole_range_end}`
          : "",
        "",
        "Toca el botón para abrir tu vista de operador. Recuerda:",
        "✅ Activa el GPS al inicio del recorrido",
        "📦 Edita tu inventario cada vez que reabastezcas",
        "🔔 Si suena alerta, hay pedido por recoger en el Hoyo 6",
      ]
        .filter(Boolean)
        .join("\n"),
      buttons: [
        [
          {
            text: `🚚 Abrir ${targetCart.name}`,
            url: `${appUrl()}/captura/carrito?venue=${targetCart.code}`,
          },
        ],
      ],
    };
  }

  // Sin arg: lista todos los carritos como botones
  const lines = [
    "🚚 Mini App del carrito bar",
    "",
    "Elige tu carrito para abrir tu vista de operador:",
  ];
  const buttons = carts.map((c) => [
    {
      text: `${c.name}${
        c.hole_range_start && c.hole_range_end
          ? ` (hoyos ${c.hole_range_start}-${c.hole_range_end})`
          : ""
      }`,
      url: `${appUrl()}/captura/carrito?venue=${c.code}`,
    },
  ]);
  return { text: lines.join("\n"), buttons };
}
