"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import type { DepositAccountInput } from "@/lib/fb/depositAccounts";

/**
 * Server actions para gestionar las cuentas de depósito (destino de los
 * cobros del club). Se usan desde /fb-cuentas-deposito, protegida por el
 * módulo fb-manage.
 *
 * Solo una cuenta puede ser la predeterminada a la vez (índice único parcial
 * en la BD); al marcar una como predeterminada se desmarcan las demás.
 */

interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function clean(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function toRow(input: DepositAccountInput): Record<string, unknown> {
  return {
    label: clean(input.label),
    kind: input.kind,
    bank_name: clean(input.bankName),
    account_holder: clean(input.accountHolder),
    clabe: clean(input.clabe),
    account_number: clean(input.accountNumber),
    card_number: clean(input.cardNumber),
    currency: clean(input.currency) ?? "MXN",
    stripe_account_id: clean(input.stripeAccountId),
    is_active: Boolean(input.isActive),
    notes: clean(input.notes),
  };
}

/** Quita la marca de predeterminada de todas las cuentas (menos la indicada). */
async function clearOtherDefaults(
  admin: ReturnType<typeof createAdminClient>,
  exceptId: string | null
) {
  let q = admin
    .from("fb_deposit_accounts")
    .update({ is_default: false })
    .eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function createDepositAccount(
  input: DepositAccountInput
): Promise<ActionResult> {
  if (!clean(input.label)) {
    return { ok: false, error: "El nombre de la cuenta es obligatorio." };
  }
  const admin = createAdminClient();

  // Si se marca como predeterminada, primero limpiamos las demás para no
  // chocar con el índice único parcial.
  if (input.isDefault) await clearOtherDefaults(admin, null);

  const { data, error } = await admin
    .from("fb_deposit_accounts")
    .insert({ ...toRow(input), is_default: Boolean(input.isDefault) })
    .select("id")
    .single();

  if (error) {
    console.error("createDepositAccount:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-cuentas-deposito");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateDepositAccount(
  id: string,
  input: DepositAccountInput
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta id." };
  if (!clean(input.label)) {
    return { ok: false, error: "El nombre de la cuenta es obligatorio." };
  }
  const admin = createAdminClient();

  if (input.isDefault) await clearOtherDefaults(admin, id);

  const { error } = await admin
    .from("fb_deposit_accounts")
    .update({ ...toRow(input), is_default: Boolean(input.isDefault) })
    .eq("id", id);

  if (error) {
    console.error("updateDepositAccount:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-cuentas-deposito");
  return { ok: true, id };
}

/** Marca una cuenta como la predeterminada (desmarca las demás). */
export async function setDefaultDepositAccount(
  id: string
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta id." };
  const admin = createAdminClient();
  await clearOtherDefaults(admin, id);
  const { error } = await admin
    .from("fb_deposit_accounts")
    .update({ is_default: true, is_active: true })
    .eq("id", id);
  if (error) {
    console.error("setDefaultDepositAccount:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-cuentas-deposito");
  return { ok: true, id };
}

export async function deleteDepositAccount(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta id." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("fb_deposit_accounts")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("deleteDepositAccount:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/fb-cuentas-deposito");
  return { ok: true, id };
}
