"use client";

import { useState, useTransition } from "react";
import {
  createDepositAccount,
  deleteDepositAccount,
  setDefaultDepositAccount,
  updateDepositAccount,
} from "@/lib/fb/depositAccountActions";
import type {
  DepositAccount,
  DepositAccountInput,
  DepositAccountKind,
} from "@/lib/fb/depositAccounts";

interface Props {
  initialAccounts: DepositAccount[];
}

const KIND_LABELS: Record<DepositAccountKind, string> = {
  bank: "🏦 Banco",
  stripe: "💳 Stripe",
  cash: "💵 Efectivo / caja",
  other: "📦 Otro",
};

const EMPTY: DepositAccountInput = {
  label: "",
  kind: "bank",
  bankName: "",
  accountHolder: "",
  clabe: "",
  accountNumber: "",
  cardNumber: "",
  currency: "MXN",
  stripeAccountId: "",
  isActive: true,
  isDefault: false,
  notes: "",
};

export default function CuentasDepositoClient({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<DepositAccount[]>(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DepositAccount | null>(null);

  function applyDefaultLocal(id: string) {
    setAccounts((cur) =>
      cur.map((a) => ({ ...a, isDefault: a.id === id, isActive: a.id === id ? true : a.isActive }))
    );
  }

  function upsertLocal(a: DepositAccount) {
    setAccounts((cur) => {
      let list = cur;
      if (a.isDefault) {
        list = list.map((x) => ({ ...x, isDefault: false }));
      }
      const idx = list.findIndex((x) => x.id === a.id);
      if (idx >= 0) {
        const next = list.slice();
        next[idx] = a;
        return next;
      }
      return [a, ...list];
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🏦 Cuentas de depósito</h1>
          <p className="text-sm text-white/50">
            A dónde se depositan los cobros del club. Marca una como
            predeterminada; puedes cambiarla cuando quieras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-[#63BC46] px-4 py-2 text-sm font-bold text-black hover:brightness-110"
        >
          + Agregar cuenta
        </button>
      </header>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-white/50">
          Aún no hay cuentas de depósito. Agrega la primera.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              onEdit={() => {
                setEditing(a);
                setShowForm(true);
              }}
              onMadeDefault={() => applyDefaultLocal(a.id)}
              onDeleted={() =>
                setAccounts((cur) => cur.filter((x) => x.id !== a.id))
              }
            />
          ))}
        </div>
      )}

      {showForm ? (
        <AccountFormModal
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={(a) => {
            upsertLocal(a);
            setShowForm(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  onEdit,
  onMadeDefault,
  onDeleted,
}: {
  account: DepositAccount;
  onEdit: () => void;
  onMadeDefault: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function makeDefault() {
    startTransition(async () => {
      const r = await setDefaultDepositAccount(account.id);
      if (r.ok) onMadeDefault();
      else alert(r.error ?? "Error");
    });
  }

  function remove() {
    if (!window.confirm(`¿Eliminar la cuenta "${account.label}"?`)) return;
    startTransition(async () => {
      const r = await deleteDepositAccount(account.id);
      if (r.ok) onDeleted();
      else alert(r.error ?? "Error");
    });
  }

  return (
    <div
      className={[
        "rounded-lg border bg-white/5 p-3",
        account.isDefault ? "border-[#63BC46]" : "border-white/10",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{account.label}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
              {KIND_LABELS[account.kind]}
            </span>
            {account.isDefault ? (
              <span className="rounded-full bg-[#63BC46] px-2 py-0.5 text-[10px] font-bold text-black">
                ★ Predeterminada
              </span>
            ) : null}
            {!account.isActive ? (
              <span className="rounded-full bg-red-900 px-2 py-0.5 text-[10px] font-bold text-red-200">
                inactiva
              </span>
            ) : null}
          </div>

          <div className="mt-1 space-y-0.5 text-[12px] text-white/60">
            {account.kind === "bank" ? (
              <>
                {account.bankName ? <div>🏦 {account.bankName}</div> : null}
                {account.accountHolder ? (
                  <div>👤 {account.accountHolder}</div>
                ) : null}
                {account.clabe ? <div>CLABE: {account.clabe}</div> : null}
                {account.accountNumber ? (
                  <div>Cuenta: {account.accountNumber}</div>
                ) : null}
                {account.cardNumber ? (
                  <div>Tarjeta: {account.cardNumber}</div>
                ) : null}
              </>
            ) : null}
            {account.kind === "stripe" && account.stripeAccountId ? (
              <div>Stripe: {account.stripeAccountId}</div>
            ) : null}
            <div className="text-white/40">Moneda: {account.currency}</div>
            {account.notes ? (
              <div className="text-white/50">📝 {account.notes}</div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!account.isDefault ? (
            <button
              type="button"
              onClick={makeDefault}
              disabled={pending}
              className="rounded-md border border-[#63BC46]/50 px-3 py-1.5 text-[12px] font-semibold text-[#63BC46] hover:bg-[#63BC46]/10 disabled:opacity-50"
            >
              ★ Hacer predeterminada
            </button>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-white/80 hover:bg-white/10"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md border border-red-500/40 px-3 py-1.5 text-[12px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: DepositAccount | null;
  onClose: () => void;
  onSaved: (a: DepositAccount) => void;
}) {
  const [form, setForm] = useState<DepositAccountInput>(
    editing
      ? {
          label: editing.label,
          kind: editing.kind,
          bankName: editing.bankName ?? "",
          accountHolder: editing.accountHolder ?? "",
          clabe: editing.clabe ?? "",
          accountNumber: editing.accountNumber ?? "",
          cardNumber: editing.cardNumber ?? "",
          currency: editing.currency,
          stripeAccountId: editing.stripeAccountId ?? "",
          isActive: editing.isActive,
          isDefault: editing.isDefault,
          notes: editing.notes ?? "",
        }
      : EMPTY
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof DepositAccountInput>(
    key: K,
    value: DepositAccountInput[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = editing
        ? await updateDepositAccount(editing.id, form)
        : await createDepositAccount(form);
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo guardar.");
        return;
      }
      onSaved({
        id: res.id,
        label: form.label.trim(),
        kind: form.kind,
        bankName: form.bankName?.trim() || null,
        accountHolder: form.accountHolder?.trim() || null,
        clabe: form.clabe?.trim() || null,
        accountNumber: form.accountNumber?.trim() || null,
        cardNumber: form.cardNumber?.trim() || null,
        currency: form.currency?.trim() || "MXN",
        stripeAccountId: form.stripeAccountId?.trim() || null,
        isActive: form.isActive,
        isDefault: form.isDefault,
        notes: form.notes?.trim() || null,
      });
    });
  }

  const isBank = form.kind === "bank";
  const isStripe = form.kind === "stripe";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-[#1C252D] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {editing ? "Editar cuenta" : "Agregar cuenta de depósito"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <Field
            label="Nombre de la cuenta *"
            value={form.label}
            onChange={(v) => update("label", v)}
            placeholder="Ej. Cuenta principal BBVA"
          />

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Tipo
            </span>
            <select
              value={form.kind}
              onChange={(e) =>
                update("kind", e.target.value as DepositAccountKind)
              }
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0F1720] px-3 py-2 text-sm text-white"
            >
              <option value="bank">🏦 Banco (transferencia)</option>
              <option value="stripe">💳 Stripe (pasarela)</option>
              <option value="cash">💵 Efectivo / caja</option>
              <option value="other">📦 Otro</option>
            </select>
          </label>

          {isBank ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Banco"
                  value={form.bankName ?? ""}
                  onChange={(v) => update("bankName", v)}
                  placeholder="BBVA, Santander…"
                />
                <Field
                  label="Beneficiario / titular"
                  value={form.accountHolder ?? ""}
                  onChange={(v) => update("accountHolder", v)}
                />
              </div>
              <Field
                label="CLABE interbancaria"
                value={form.clabe ?? ""}
                onChange={(v) => update("clabe", v)}
                placeholder="18 dígitos"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Número de cuenta"
                  value={form.accountNumber ?? ""}
                  onChange={(v) => update("accountNumber", v)}
                />
                <Field
                  label="Tarjeta (opcional)"
                  value={form.cardNumber ?? ""}
                  onChange={(v) => update("cardNumber", v)}
                />
              </div>
            </>
          ) : null}

          {isStripe ? (
            <Field
              label="Stripe account ID"
              value={form.stripeAccountId ?? ""}
              onChange={(v) => update("stripeAccountId", v)}
              placeholder="acct_…"
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Moneda"
              value={form.currency}
              onChange={(v) => update("currency", v)}
              placeholder="MXN"
            />
          </div>

          <Field
            label="Notas (opcional)"
            value={form.notes ?? ""}
            onChange={(v) => update("notes", v)}
          />

          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => update("isDefault", e.target.checked)}
                className="h-4 w-4"
              />
              Usar como cuenta predeterminada
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
                className="h-4 w-4"
              />
              Activa
            </label>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-[#63BC46] px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-white/10 bg-[#0F1720] px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
    </label>
  );
}
