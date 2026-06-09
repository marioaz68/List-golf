"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createWaiterOrder,
  approveQrOrder,
  rejectQrOrder,
  payTableOrders,
} from "@/lib/fb/tableActions";
import { formatPrice, ORDER_STATUS_LABELS } from "@/lib/fb/types";
import type { FbMenuItem, FbCategory } from "@/lib/fb/types";
import type { MesaSnapshot, MesaOrder } from "./page";

interface Props {
  snapshot: MesaSnapshot;
}

interface BufferLine {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  qty: number;
  notes: string;
}

const TIP_OPTIONS = [0, 10, 15, 20];

export default function MesaCliente({ snapshot }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buffer, setBuffer] = useState<BufferLine[]>([]);
  const [filter, setFilter] = useState("");
  const [activeCat, setActiveCat] = useState<string>(
    snapshot.categories[0]?.id ?? ""
  );
  const [comandaNotes, setComandaNotes] = useState("");
  const [showPay, setShowPay] = useState(false);

  // Auto-refresh de la página entera cada 20 s para ver status de comandas
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(id);
  }, [router]);

  const filteredItems = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (f) {
      return snapshot.items
        .filter((it) => it.name.toLowerCase().includes(f))
        .slice(0, 30);
    }
    if (activeCat) {
      return snapshot.items.filter((it) => it.categoryId === activeCat);
    }
    return snapshot.items;
  }, [snapshot.items, filter, activeCat]);

  function addToBuffer(it: FbMenuItem) {
    setBuffer((cur) => {
      const idx = cur.findIndex((b) => b.menuItemId === it.id);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...cur,
        {
          menuItemId: it.id,
          name: it.name,
          unitPriceCents: it.priceCents,
          qty: 1,
          notes: "",
        },
      ];
    });
  }

  function incBuffer(menuItemId: string, delta: number) {
    setBuffer((cur) =>
      cur
        .map((b) =>
          b.menuItemId === menuItemId
            ? { ...b, qty: Math.max(0, b.qty + delta) }
            : b
        )
        .filter((b) => b.qty > 0)
    );
  }

  function setLineNote(menuItemId: string, note: string) {
    setBuffer((cur) =>
      cur.map((b) => (b.menuItemId === menuItemId ? { ...b, notes: note } : b))
    );
  }

  const bufferTotal = useMemo(
    () => buffer.reduce((a, b) => a + b.unitPriceCents * b.qty, 0),
    [buffer]
  );

  function sendBufferToKitchen() {
    if (buffer.length === 0) return;
    startTransition(async () => {
      const res = await createWaiterOrder({
        tableId: snapshot.table.id,
        notes: comandaNotes.trim() || null,
        items: buffer.map((b) => ({
          menuItemId: b.menuItemId,
          qty: b.qty,
          notes: b.notes.trim() || null,
        })),
      });
      if (res.ok) {
        setBuffer([]);
        setComandaNotes("");
        router.refresh();
      } else {
        alert(`Error: ${res.error ?? "no se pudo mandar a cocina."}`);
      }
    });
  }

  function approveOrder(orderId: string) {
    startTransition(async () => {
      const res = await approveQrOrder(orderId);
      if (res.ok) router.refresh();
      else alert(`Error: ${res.error}`);
    });
  }
  function rejectOrder(orderId: string) {
    const reason = prompt("Motivo del rechazo (opcional):") ?? "";
    startTransition(async () => {
      const res = await rejectQrOrder(orderId, reason);
      if (res.ok) router.refresh();
      else alert(`Error: ${res.error}`);
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-32 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/fb-mesero"
              className="text-[11px] font-semibold text-slate-300 underline"
            >
              ← Mesas
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-100 hover:bg-red-500/30"
              >
                🚪 Salir
              </button>
            </form>
          </div>
          <h1 className="text-base font-bold">
            🪑 {snapshot.table.code}{" "}
            {snapshot.table.name && snapshot.table.name !== snapshot.table.code ? (
              <span className="text-[11px] font-normal text-slate-400">
                · {snapshot.table.name}
              </span>
            ) : null}
          </h1>
          <button
            type="button"
            onClick={() => setShowPay(true)}
            disabled={snapshot.totalOpenCents === 0 && buffer.length === 0}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-30"
          >
            💳 Cobrar · {formatPrice(snapshot.totalOpenCents)}
          </button>
        </div>
      </header>

      {/* QR pendientes de aprobación */}
      {snapshot.orders.some((o) => o.requiresApproval) ? (
        <section className="mx-3 mt-3 rounded-lg border-2 border-amber-500 bg-amber-950/60 p-3 ring-2 ring-amber-500/40 animate-pulse">
          <h2 className="text-sm font-bold text-amber-100">
            🔔 Pedidos del QR — aprueba o rechaza
          </h2>
          <div className="mt-2 space-y-2">
            {snapshot.orders
              .filter((o) => o.requiresApproval)
              .map((o) => (
                <PendingQrCard
                  key={o.id}
                  o={o}
                  pending={pending}
                  onApprove={() => approveOrder(o.id)}
                  onReject={() => rejectOrder(o.id)}
                />
              ))}
          </div>
        </section>
      ) : null}

      {/* Comandas ya enviadas */}
      {snapshot.orders.filter((o) => !o.requiresApproval).length > 0 ? (
        <section className="mx-3 mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Comandas en cocina ({snapshot.orders.filter((o) => !o.requiresApproval).length})
          </h2>
          <ul className="mt-2 space-y-2">
            {snapshot.orders
              .filter((o) => !o.requiresApproval)
              .map((o) => (
                <SentComandaRow key={o.id} o={o} />
              ))}
          </ul>
        </section>
      ) : null}

      {/* Buffer de comanda actual */}
      {buffer.length > 0 ? (
        <section className="mx-3 mt-3 rounded-lg border-2 border-indigo-500 bg-indigo-950/40 p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-indigo-100">
              📝 Nueva comanda
            </h2>
            <div className="text-base font-bold text-indigo-200">
              {formatPrice(bufferTotal)}
            </div>
          </div>
          <ul className="mt-2 space-y-1.5">
            {buffer.map((b) => (
              <li
                key={b.menuItemId}
                className="rounded border border-indigo-800 bg-indigo-900/40 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-indigo-100">
                      {b.name}
                    </div>
                    <div className="text-[11px] text-indigo-300">
                      {formatPrice(b.unitPriceCents)} c/u
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => incBuffer(b.menuItemId, -1)}
                      className="h-7 w-7 rounded bg-indigo-800 text-base font-bold"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{b.qty}</span>
                    <button
                      type="button"
                      onClick={() => incBuffer(b.menuItemId, +1)}
                      className="h-7 w-7 rounded bg-indigo-600 text-base font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={b.notes}
                  onChange={(e) => setLineNote(b.menuItemId, e.target.value)}
                  placeholder="Nota (sin cebolla, término medio…)"
                  className="mt-1 w-full rounded border border-indigo-800 bg-indigo-950 px-2 py-1 text-[12px] text-indigo-100 placeholder:text-indigo-400"
                />
              </li>
            ))}
          </ul>
          <input
            type="text"
            value={comandaNotes}
            onChange={(e) => setComandaNotes(e.target.value)}
            placeholder="Notas de la comanda completa (opcional)"
            className="mt-2 w-full rounded border border-indigo-800 bg-indigo-950 px-2 py-1.5 text-[12px] text-indigo-100 placeholder:text-indigo-400"
          />
          <button
            type="button"
            onClick={sendBufferToKitchen}
            disabled={pending || buffer.length === 0}
            className="mt-2 w-full rounded-md bg-indigo-500 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            ✈ Mandar a cocina · {formatPrice(bufferTotal)}
          </button>
        </section>
      ) : null}

      {/* Búsqueda + categorías */}
      <section className="mx-3 mt-3 space-y-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 Buscar item del menú…"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
        />
        {!filter ? (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {snapshot.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className={[
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                  c.id === activeCat
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* Catálogo */}
      <section className="mx-3 mt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredItems.map((it) => (
            <CatalogTile key={it.id} item={it} onAdd={() => addToBuffer(it)} />
          ))}
        </div>
        {filteredItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Sin resultados</p>
        ) : null}
      </section>

      {/* Modal cobrar */}
      {showPay ? (
        <PayModal
          snapshot={snapshot}
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setShowPay(false);
            router.refresh();
            // Tras cobrar, volver a la lista de mesas
            setTimeout(() => router.push("/fb-mesero"), 400);
          }}
        />
      ) : null}
    </div>
  );
}

function CatalogTile({
  item,
  onAdd,
}: {
  item: FbMenuItem;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex flex-col items-start gap-1 rounded-lg border border-slate-700 bg-slate-900 p-2 text-left hover:bg-slate-800 active:bg-slate-700"
    >
      <div className="flex w-full items-center justify-between">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-12 w-12 rounded object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-800 text-2xl">
            {item.displayEmoji ?? "🍽️"}
          </div>
        )}
        <span className="text-sm font-bold text-emerald-300">
          {formatPrice(item.priceCents)}
        </span>
      </div>
      <span className="line-clamp-2 text-[12px] font-semibold text-slate-200">
        {item.name}
      </span>
    </button>
  );
}

function SentComandaRow({ o }: { o: MesaOrder }) {
  const dt = new Date(o.createdAt);
  const time = dt.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="rounded border border-slate-800 bg-slate-950 p-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-bold text-slate-300">
          {time} ·{" "}
          {ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] ??
            o.status}
        </div>
        <div className="text-sm font-bold text-emerald-300">
          {formatPrice(o.totalCents)}
        </div>
      </div>
      <div className="mt-0.5 text-[12px] text-slate-400">
        {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
      </div>
      {o.dinerName ? (
        <div className="text-[10px] text-amber-400">📱 {o.dinerName} (QR)</div>
      ) : null}
    </li>
  );
}

function PendingQrCard({
  o,
  pending,
  onApprove,
  onReject,
}: {
  o: MesaOrder;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded border border-amber-700 bg-amber-950 p-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-bold text-amber-100">
          {o.dinerName ? `📱 ${o.dinerName}` : "📱 Comensal"} ·{" "}
          {new Date(o.createdAt).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="text-sm font-bold text-amber-200">
          {formatPrice(o.totalCents)}
        </div>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {o.items.map((it) => (
          <li key={it.id} className="text-[12px] text-amber-100">
            {it.qty}× {it.name}
            {it.notes ? (
              <span className="ml-1 text-[10px] italic text-amber-300">
                ({it.notes})
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="rounded bg-emerald-600 py-1.5 text-[12px] font-bold text-white"
        >
          ✓ Aprobar y mandar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onReject}
          className="rounded bg-red-600 py-1.5 text-[12px] font-bold text-white"
        >
          ✕ Rechazar
        </button>
      </div>
    </div>
  );
}

function PayModal({
  snapshot,
  onClose,
  onPaid,
}: {
  snapshot: MesaSnapshot;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<"cash" | "card" | "house_account">("cash");
  const [tipPct, setTipPct] = useState<number>(15);
  const [tipManual, setTipManual] = useState<number | null>(null);
  const [splitN, setSplitN] = useState<number>(1);
  const [houseAcctId, setHouseAcctId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const subtotal = snapshot.totalOpenCents;
  const tipCents =
    tipManual != null
      ? Math.round(tipManual * 100)
      : Math.round((subtotal * tipPct) / 100);
  const grand = subtotal + tipCents;
  const perPerson = splitN > 1 ? Math.ceil(grand / splitN) : null;

  function submit() {
    if (method === "house_account" && !houseAcctId) {
      alert("Elige el socio al que se carga la cuenta.");
      return;
    }
    startTransition(async () => {
      const res = await payTableOrders({
        tableId: snapshot.table.id,
        method,
        tipCents,
        houseAccountId: method === "house_account" ? houseAcctId : null,
        splitCount: splitN > 1 ? splitN : null,
        notes: notes.trim() || null,
      });
      if (res.ok) onPaid();
      else alert(`Error: ${res.error}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-slate-900 p-4 ring-1 ring-slate-700 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-100">
          Cobrar mesa {snapshot.table.code}
        </h2>

        <div className="mt-3 rounded-lg bg-slate-800 p-3">
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row label={`Propina (${tipManual != null ? "manual" : `${tipPct}%`})`} value={formatPrice(tipCents)} />
          <div className="my-2 border-t border-slate-700" />
          <Row label="TOTAL" value={formatPrice(grand)} bold />
          {perPerson != null ? (
            <Row
              label={`÷ ${splitN} personas`}
              value={`${formatPrice(perPerson)} c/u`}
              hint
            />
          ) : null}
        </div>

        {/* Propina */}
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">Propina</div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {TIP_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setTipPct(p);
                  setTipManual(null);
                }}
                className={[
                  "rounded py-1.5 text-[12px] font-bold",
                  tipManual == null && tipPct === p
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >
                {p}%
              </button>
            ))}
          </div>
          <input
            type="number"
            min="0"
            placeholder="Propina manual ($)"
            value={tipManual ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setTipManual(v === "" ? null : Number(v));
            }}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          />
        </div>

        {/* Dividir */}
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">
            Dividir entre
          </div>
          <div className="mt-1 grid grid-cols-6 gap-1">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSplitN(n)}
                className={[
                  "rounded py-1.5 text-[12px] font-bold",
                  splitN === n
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Método */}
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">Método</div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {([
              ["cash", "💵 Efectivo"],
              ["card", "💳 Tarjeta"],
              ["house_account", "👤 Socio"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMethod(v)}
                className={[
                  "rounded py-1.5 text-[11px] font-bold",
                  method === v
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          {method === "house_account" ? (
            <select
              value={houseAcctId}
              onChange={(e) => setHouseAcctId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="">— Elegir socio —</option>
              {snapshot.houseAccounts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.memberNo ? `${h.memberNo} · ` : ""}
                  {h.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (referencia tarjeta, etc.)"
          className="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-[12px] text-slate-100"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded bg-slate-700 py-2.5 text-sm font-bold text-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            ✓ Cobrar {formatPrice(grand)}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  hint?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={[
          hint ? "text-[11px] text-slate-400" : "text-sm text-slate-300",
          bold ? "font-bold text-slate-100" : "",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        className={[
          hint ? "text-[11px] text-slate-400" : "text-sm text-slate-100",
          bold ? "text-base font-bold" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

// Unused but exported for potential reuse
export type { FbCategory };
