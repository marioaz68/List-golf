/**
 * Tipos del módulo F&B (Food & Beverage).
 *
 * Convención de precios: SIEMPRE en centavos (integer) para evitar
 * imprecisión de floats. La UI los muestra con `formatPrice()`.
 */

export type VenueType = "restaurant" | "cart";

export interface FbVenue {
  id: string;
  code: string;
  name: string;
  type: VenueType;
  holeRangeStart: number | null;
  holeRangeEnd: number | null;
  isActive: boolean;
  displayOrder: number;
  notes: string | null;
}

export interface FbCategory {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface FbMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  availableVenueIds: string[];
  isActive: boolean;
  displayOrder: number;
  prepMinutes: number | null;
  allergens: string[] | null;
  notes: string | null;
  /** Emoji manual elegido por el restaurante. Si null, el cliente usa el
   *  helper automático (iconForMenuItem en lib/fb/icons.ts). */
  displayEmoji: string | null;
}

export type DeliveryType = "pickup" | "on_course" | "dine_in";

/** Canal por el que entró el pedido. Solo informativo (reportes/analytics). */
export type SourceChannel = "app" | "mesero" | "qr_table";

export interface FbTable {
  id: string;
  venueId: string;
  code: string;          // "M3", "T1", "Barra-1"
  name: string | null;   // nombre amigable opcional
  capacity: number;
  area: string;          // 'salon' | 'terraza' | 'barra' | …
  displayOrder: number;
  posX: number | null;   // para layout futuro
  posY: number | null;
  isActive: boolean;
}

export interface FbHouseAccount {
  id: string;
  memberNo: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  creditLimitCents: number;
  notes: string | null;
  isActive: boolean;
}

export type OrderStatus =
  | "pending"               // recién creado, espera aceptación del restaurante
  | "accepted"              // restaurante/carrito aceptó
  | "preparing"             // en cocina
  | "ready"                 // listo para recoger / entregar
  | "awaiting_cart_pickup"  // listo en cocina, esperando que el carrito lo recoja
  | "on_the_way"            // carrito en camino al cliente
  | "pending_acceptance"    // restaurante dice 'entregado', cliente debe confirmar
  | "delivered"             // cliente confirmó recepción, en cuenta abierta
  | "paid"                  // pagado físicamente al restaurante, cuenta cerrada
  | "disputed"              // cliente rechazó la entrega — el comité revisa
  | "cancelled";            // cancelado por cualquier parte

export interface FbOrder {
  id: string;
  tournamentId: string | null;
  entryId: string | null;
  caddieId: string | null;
  clientLabel: string | null;
  venueId: string;
  deliveryType: DeliveryType;
  status: OrderStatus;
  requestedHole: number | null;
  currentHoleAtOrder: number | null;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  items: FbOrderItem[];
}

export interface FbOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  qty: number;
  unitPriceCents: number;
  itemNameSnapshot: string;
  notes: string | null;
}

/** Formatea centavos a string con símbolo MXN. */
export function formatPrice(cents: number): string {
  const v = cents / 100;
  return `$${v.toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Etiqueta humana del status de un pedido. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "En preparación",
  ready: "Listo",
  awaiting_cart_pickup: "Listo · esperando carrito",
  on_the_way: "En camino",
  pending_acceptance: "Esperando confirmación del cliente",
  delivered: "Entregado · por cobrar",
  paid: "Pagado",
  disputed: "En disputa",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { fg: string; bg: string }> = {
  pending: { fg: "#fde68a", bg: "#78350f" },
  accepted: { fg: "#bae6fd", bg: "#0c4a6e" },
  preparing: { fg: "#c7d2fe", bg: "#312e81" },
  ready: { fg: "#86efac", bg: "#14532d" },
  awaiting_cart_pickup: { fg: "#fde68a", bg: "#854d0e" },
  on_the_way: { fg: "#67e8f9", bg: "#155e75" },
  pending_acceptance: { fg: "#fde68a", bg: "#92400e" },
  delivered: { fg: "#86efac", bg: "#14532d" },
  paid: { fg: "#9ca3af", bg: "#1f2937" },
  disputed: { fg: "#fca5a5", bg: "#7f1d1d" },
  cancelled: { fg: "#fca5a5", bg: "#7f1d1d" },
};
