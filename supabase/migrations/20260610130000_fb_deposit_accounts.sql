-- ============================================================================
-- F&B — Cuentas de depósito (destino de los cobros)
--
-- Define a dónde se depositan/concentran los cobros del club (restaurante,
-- carritos, reparto a domicilio, etc.). Soporta:
--   • Transferencia bancaria (CLABE / cuenta / beneficiario)
--   • Pasarela Stripe (cuenta conectada — se llena al integrar Stripe)
--   • Efectivo / caja (referencia interna)
--
-- Una cuenta puede ser la PREDETERMINADA (is_default) — a esa se asignan los
-- cobros por defecto. Solo una predeterminada a la vez (índice único parcial).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fb_deposit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nombre interno para identificar la cuenta ("Cuenta principal BBVA").
  label text NOT NULL,
  -- Tipo de cuenta destino.
  kind text NOT NULL DEFAULT 'bank'
    CHECK (kind IN ('bank', 'stripe', 'cash', 'other')),

  -- --- Datos bancarios (kind='bank') ---
  bank_name text NULL,           -- "BBVA", "Santander", …
  account_holder text NULL,      -- titular / beneficiario
  clabe text NULL,               -- CLABE interbancaria (18 dígitos)
  account_number text NULL,      -- número de cuenta
  card_number text NULL,         -- tarjeta asociada (opcional)
  currency text NOT NULL DEFAULT 'MXN',

  -- --- Stripe (kind='stripe') — se completa al integrar la pasarela ---
  stripe_account_id text NULL,   -- acct_… (cuenta conectada)

  -- Vincular a un venue específico (NULL = aplica a todo el club).
  venue_id uuid NULL REFERENCES public.fb_venues (id) ON DELETE SET NULL,

  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo una cuenta predeterminada activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS fb_deposit_accounts_one_default
  ON public.fb_deposit_accounts (is_default)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS fb_deposit_accounts_active_idx
  ON public.fb_deposit_accounts (is_active, label);

-- Trigger updated_at (reusa la función del módulo F&B si existe).
CREATE OR REPLACE FUNCTION public.fb_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fb_deposit_accounts_touch ON public.fb_deposit_accounts;
CREATE TRIGGER fb_deposit_accounts_touch BEFORE UPDATE ON public.fb_deposit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fb_touch_updated_at();

-- RLS: solo service_role desde el backend (sin policies = bloqueado para anon).
ALTER TABLE public.fb_deposit_accounts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fb_deposit_accounts IS
  'Cuentas destino de los cobros del club (banco / Stripe / efectivo). is_default = cuenta a la que se concentran los cobros por defecto.';
