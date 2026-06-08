"use client";

import { useMemo, useState, useTransition } from "react";
import {
  markAllPaidForClient,
  markOrderPaid,
  unmarkOrderPaid,
} from "@/lib/fb/orderActions";
import { formatPrice } from "@/lib/fb/types";
import type { AccountOrder, ClientAccount } from "./page";

interface Props {
  accounts: ClientAccount[];
}

export default function CuentasClient({ accounts: initial }: Props) {
  const [accounts, setAccounts] = useState(initial);
  const [filter, setFilter] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (onlyOpen && a.openOrders.length === 0) return false;
      if (filter) {
        const f = filter.toLowerCase();
        if (!a.name.toLowerCase().includes(f)) return false;
      }
      return true;
    });
  }, [accounts, filter, onlyOpen]);

  const summary = useMemo(() => {
    let openTotal = 0;
    let paidTotal = 0;
    let clientsWithOpen = 0;
    for (const a of accounts) {
      openTotal += a.openTotalCents;
      paidTotal += a.paidTotalCents;
      if (a.openOrders.length > 0) clientsWithOpen++;
    }
    return { openTotal, paidTotal, clientsWithOpen };
  }, [accounts]);

  function patchAccount(key: string, mutate: (a: ClientAccount) => ClientAccount) {
    setAccounts((cur) => cur.map((x) => (x.key === key ? mutate(x) : x)));
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">
            Cuentas abiertas · F&B
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cobra a cada cliente cuando pase a pagar al Hoyo 6. Marcar como
            pagado cierra su cuenta.
          </p>
        </header>

        {/* Resumen */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
            <div className="text-[10px] font-bold uppercase text-amber-700">
              Por cobrar
            </div>
            <div className="text-2xl font-bold text-amber-800">
              {formatPrice(summary.openTotal)}
            </div>
            <div className="text-[10px] text-amber-700">
              {summary.clientsWithOpen} clientes con cuenta abierta
            </div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <div className="text-[10px] font-bold uppercase text-emerald-700">
              Ya cobrado
            </div>
            <div className="text-2xl font-bold text-emerald-800">
              {formatPrice(summary.paidTotal)}
            </div>
            <div className="text-[10px] text-emerald-700">
              Pagos recibidos en el sistema
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-[10px] font-bold uppercase text-slate-600">
              Total facturado
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {formatPrice(summary.openTotal + summary.paidTotal)}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar cliente..."
            className="flex-1 min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
              className="h-4 w-4"
            />
            Solo cuentas abiertas
          </label>
        </div>

        {/* Lista de cuentas */}
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center text-slate-500 shadow-sm">
            {onlyOpen
              ? "Sin cuentas abiertas. Todo cobrado 🎉"
              : "No hay cuentas que coincidan con el filtro."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <AccountCard
                key={a.key}
                account={a}
                onPaymentChanged={(updated) => patchAccount(a.key, () => updated)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountCard({
  account,
  onPaymentChanged,
}: {
  account: ClientAccount;
  onPaymentChanged: (next: ClientAccount) => void;
}) {
  const [open, setOpen] = useState(account.openOrders.length > 0);
  const [pending, startTransition] = useTransition();

  function payAll() {
    if (!account.tournamentId) {
      alert("No tengo tournament_id para este cliente.");
      return;
    }
    const method = prompt(
      `Cómo pagó ${account.name}? (efectivo / tarjeta / cargo a socio)`,
      "efectivo"
    );
    if (method === null) return;
    startTransition(async () => {
      const r = await markAllPaidForClient({
        tournamentId: account.tournamentId!,
        entryId: account.kind === "player" ? account.key.slice(2) : null,
        caddieId: account.kind === "caddie" ? account.key.slice(2) : null,
        method,
      });
      if (!r.ok) {
        alert(r.error ?? "Error al cobrar.");
        return;
      }
      // Mover todos los pedidos abiertos a pagados localmente
      onPaymentChanged({
        ...account,
        openTotalCents: 0,
        paidTotalCents: account.paidTotalCents + account.openTotalCents,
        openOrders: [],
        paidOrders: [
          ...account.openOrders.map((o) => ({
            ...o,
            paidAt: new Date().toISOString(),
          })),
          ...account.paidOrders,
        ],
      });
    });
  }

  function payOne(o: AccountOrder) {
    const method = prompt(`Cómo pagó ${account.name} este pedido?`, "efectivo");
    if (method === null) return;
    startTransition(async () => {
      const r = await markOrderPaid(o.id, method);
      if (!r.ok) {
        alert(r.error ?? "Error");
        return;
      }
      onPaymentChanged({
        ...account,
        openTotalCents: account.openTotalCents - o.totalCents,
        paidTotalCents: account.paidTotalCents + o.totalCents,
        openOrders: account.openOrders.filter((x) => x.id !== o.id),
        paidOrders: [
          { ...o, paidAt: new Date().toISOString() },
          ...account.paidOrders,
        ],
      });
    });
  }

  function unpayOne(o: AccountOrder) {
    if (!confirm("¿Deshacer el pago de este pedido?")) return;
    startTransition(async () => {
      const r = await unmarkOrderPaid(o.id);
      if (!r.ok) {
        alert(r.error ?? "Error");
        return;
      }
      onPaymentChanged({
        ...account,
        openTotalCents: account.openTotalCents + o.totalCents,
        paidTotalCents: account.paidTotalCents - o.totalCents,
        openOrders: [{ ...o, paidAt: null }, ...account.openOrders],
        paidOrders: account.paidOrders.filter((x) => x.id !== o.id),
      });
    });
  }

  const hasOpen = account.openOrders.length > 0;

  return (
    <article
      className={[
        "overflow-hidden rounded-lg border bg-white shadow-sm",
        hasOpen ? "border-amber-300" : "border-slate-200",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
              {account.kind === "player" ? "🏌️ Jugador" : "🎒 Caddie"}
            </span>
            <span className="truncate text-sm font-bold text-slate-900">
              {account.name}
            </span>
            {account.groupNo != null ? (
              <span className="text-[10px] text-slate-500">
                Grupo {account.groupNo}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {account.openOrders.length} por cobrar ·{" "}
            {account.paidOrders.length} ya cobrados
          </div>
        </div>
        <div className="flex flex-col items-end">
          {account.openTotalCents > 0 ? (
            <div className="text-lg font-bold text-amber-700">
              {formatPrice(account.openTotalCents)}
            </div>
          ) : (
            <div className="text-sm font-semibold text-emerald-700">
              Sin saldo
            </div>
          )}
          {account.paidTotalCents > 0 ? (
            <div className="text-[10px] text-emerald-700">
              {formatPrice(account.paidTotalCents)} ya cobrado
            </div>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
          {hasOpen ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Pedidos por cobrar
                </h3>
                <button
                  type="button"
                  disabled={pending}
                  onClick={payAll}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  💵 Marcar TODO pagado ({formatPrice(account.openTotalCents)})
                </button>
              </div>
              <ul className="space-y-1">
                {account.openOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-700">
                        <span className="font-semibold">{o.venueName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">
                          {new Date(o.createdAt).toLocaleString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <ul className="mt-0.5 text-[11px] text-slate-600">
                        {o.items.map((it) => (
                          <li key={it.id}>
                            {it.qty}× {it.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-bold text-slate-900">
                        {formatPrice(o.totalCents)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => payOne(o)}
                        className="rounded border border-emerald-500 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Cobrar solo este
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {account.paidOrders.length > 0 ? (
            <div className={hasOpen ? "mt-3" : ""}>
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Pedidos ya cobrados
              </h3>
              <ul className="space-y-1">
                {account.paidOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 opacity-75"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-700">
                        <span className="font-semibold">{o.venueName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">
                          cobrado{" "}
                          {o.paidAt
                            ? new Date(o.paidAt).toLocaleString("es-MX", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "short",
                              })
                            : "—"}
                        </span>
                      </div>
                      <ul className="mt-0.5 text-[11px] text-slate-500">
                        {o.items.map((it) => (
                          <li key={it.id}>
                            {it.qty}× {it.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-bold text-emerald-700">
                        ✓ {formatPrice(o.totalCents)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => unpayOne(o)}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Deshacer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
