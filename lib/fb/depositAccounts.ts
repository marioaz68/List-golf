/**
 * Tipos y helpers de cuentas de depósito (sin "use server" — importable
 * desde server components y client components).
 */

export type DepositAccountKind = "bank" | "stripe" | "cash" | "other";

export interface DepositAccount {
  id: string;
  label: string;
  kind: DepositAccountKind;
  bankName: string | null;
  accountHolder: string | null;
  clabe: string | null;
  accountNumber: string | null;
  cardNumber: string | null;
  currency: string;
  stripeAccountId: string | null;
  isActive: boolean;
  isDefault: boolean;
  notes: string | null;
}

export interface DepositAccountInput {
  label: string;
  kind: DepositAccountKind;
  bankName: string | null;
  accountHolder: string | null;
  clabe: string | null;
  accountNumber: string | null;
  cardNumber: string | null;
  currency: string;
  stripeAccountId: string | null;
  isActive: boolean;
  isDefault: boolean;
  notes: string | null;
}

export function rowToDepositAccount(r: Record<string, unknown>): DepositAccount {
  return {
    id: String(r.id),
    label: String(r.label ?? ""),
    kind: (r.kind as DepositAccountKind) ?? "bank",
    bankName: r.bank_name ? String(r.bank_name) : null,
    accountHolder: r.account_holder ? String(r.account_holder) : null,
    clabe: r.clabe ? String(r.clabe) : null,
    accountNumber: r.account_number ? String(r.account_number) : null,
    cardNumber: r.card_number ? String(r.card_number) : null,
    currency: String(r.currency ?? "MXN"),
    stripeAccountId: r.stripe_account_id ? String(r.stripe_account_id) : null,
    isActive: Boolean(r.is_active),
    isDefault: Boolean(r.is_default),
    notes: r.notes ? String(r.notes) : null,
  };
}
