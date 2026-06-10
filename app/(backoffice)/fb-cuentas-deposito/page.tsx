/**
 * Pantalla "Cuentas de depósito" del backoffice.
 *
 * Define a dónde se depositan/concentran los cobros del club (banco, Stripe,
 * efectivo). Una cuenta puede marcarse como predeterminada — a esa se asignan
 * los cobros por defecto. Se puede cambiar cuando se quiera.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import {
  rowToDepositAccount,
  type DepositAccount,
} from "@/lib/fb/depositAccounts";
import CuentasDepositoClient from "./CuentasDepositoClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CuentasDepositoPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fb_deposit_accounts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    console.error("CuentasDepositoPage load:", error);
  }

  const accounts: DepositAccount[] = ((data ?? []) as Array<
    Record<string, unknown>
  >).map(rowToDepositAccount);

  return <CuentasDepositoClient initialAccounts={accounts} />;
}
