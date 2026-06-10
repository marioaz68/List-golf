-- ============================================================================
-- Perfil público del negocio (Restaurante) — datos editables que se muestran
-- en la página pública /restaurante (requisito de Stripe). Tabla singleton:
-- una sola fila (id fijo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fb_business_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL DEFAULT 'Restaurante Hoyo 6',
  legal_name text NULL,
  contact_email text NULL,
  contact_phone text NULL,
  whatsapp text NULL,
  address text NULL,
  intro text NULL,
  refund_policy text NULL,
  is_published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fb_business_profile ENABLE ROW LEVEL SECURITY;

-- Fila inicial con valores por defecto (solo si la tabla está vacía).
INSERT INTO public.fb_business_profile (
  business_name,
  contact_email,
  contact_phone,
  address,
  intro,
  refund_policy
)
SELECT
  'Restaurante Hoyo 6',
  'contacto@listgolf.club',
  '+52 442 000 0000',
  'Querétaro, México',
  'Comida, bebidas y snacks del club. Pide desde tu celular y recibe en el restaurante, en el campo con el carrito bar, o a domicilio dentro del fraccionamiento.',
  'Los pedidos para recoger y a domicilio se pagan por adelantado con tarjeta. Si un pedido no puede prepararse o entregarse, se realiza el reembolso íntegro al mismo método de pago. Si recibes un producto incorrecto o tu pedido no llega, puedes reportarlo desde la app o contactando al club; revisaremos el caso y aplicaremos el reembolso o reposición que corresponda. Los reembolsos se procesan a través de Stripe y pueden tardar de 5 a 10 días hábiles en reflejarse, según tu banco.'
WHERE NOT EXISTS (SELECT 1 FROM public.fb_business_profile);

COMMENT ON TABLE public.fb_business_profile IS
  'Datos públicos del negocio mostrados en /restaurante (editable desde backoffice).';
