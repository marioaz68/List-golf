/**
 * Tipos y helpers del perfil público del negocio (sin "use server" — se puede
 * importar desde server y client components).
 */

export interface BusinessProfile {
  id: string | null;
  businessName: string;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  address: string | null;
  intro: string | null;
  refundPolicy: string | null;
  isPublished: boolean;
}

export interface BusinessProfileInput {
  businessName: string;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  address: string | null;
  intro: string | null;
  refundPolicy: string | null;
  isPublished: boolean;
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  id: null,
  businessName: "Restaurante Hoyo 6",
  legalName: null,
  contactEmail: "contacto@listgolf.club",
  contactPhone: "+52 442 000 0000",
  whatsapp: null,
  address: "Querétaro, México",
  intro:
    "Comida, bebidas y snacks del club. Pide desde tu celular y recibe en el restaurante, en el campo con el carrito bar, o a domicilio dentro del fraccionamiento.",
  refundPolicy:
    "Los pedidos para recoger y a domicilio se pagan por adelantado con tarjeta. Si un pedido no puede prepararse o entregarse, se realiza el reembolso íntegro al mismo método de pago. Si recibes un producto incorrecto o tu pedido no llega, puedes reportarlo desde la app o contactando al club; revisaremos el caso y aplicaremos el reembolso o reposición que corresponda. Los reembolsos se procesan a través de Stripe y pueden tardar de 5 a 10 días hábiles en reflejarse, según tu banco.",
  isPublished: true,
};

export function rowToBusinessProfile(
  r: Record<string, unknown>
): BusinessProfile {
  return {
    id: r.id ? String(r.id) : null,
    businessName: String(r.business_name ?? "Restaurante Hoyo 6"),
    legalName: r.legal_name ? String(r.legal_name) : null,
    contactEmail: r.contact_email ? String(r.contact_email) : null,
    contactPhone: r.contact_phone ? String(r.contact_phone) : null,
    whatsapp: r.whatsapp ? String(r.whatsapp) : null,
    address: r.address ? String(r.address) : null,
    intro: r.intro ? String(r.intro) : null,
    refundPolicy: r.refund_policy ? String(r.refund_policy) : null,
    isPublished: r.is_published == null ? true : Boolean(r.is_published),
  };
}
