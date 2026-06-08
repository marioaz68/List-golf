"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  acceptOrder,
  cancelOrder,
  markOrderDelivered,
  markOrderOnTheWay,
  markOrderPreparing,
  markOrderReady,
} from "@/lib/fb/orderActions";
import type { OrderForKitchen } from "@/lib/fb/loadOrders";
import {
  formatPrice,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  type FbVenue,
  type OrderStatus,
} from "@/lib/fb/types";

type Column =
  | "pending"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "pending_acceptance"
  | "completed";

const COLUMNS: { key: Column; label: string; statuses: OrderStatus[] }[] = [
  { key: "pending", label: "Nuevos · por aceptar", statuses: ["pending"] },
  { key: "preparing", label: "En preparación", statuses: ["accepted", "preparing"] },
  { key: "ready", label: "Listos para recoger / entregar", statuses: ["ready"] },
  { key: "on_the_way", label: "En camino (carrito)", statuses: ["on_the_way"] },
  {
    key: "pending_acceptance",
    label: "Esperando OK del cliente",
    statuses: ["pending_acceptance"],
  },
  {
    key: "completed",
    label: "Cerrados (entregados / disputa / cancelados, 4 h)",
    statuses: ["delivered", "disputed", "cancelled"],
  },
];

interface Props {
  initialOrders: OrderForKitchen[];
  venues: FbVenue[];
}

export default function CocinaClient({ initialOrders, venues }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [venueFilter, setVenueFilter] = useState<string>("");

  // Auto-refresh cada 10 s para ver pedidos nuevos
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/fb-admin/orders", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; orders: OrderForKitchen[] };
      if (json.ok) setOrders(json.orders);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const venueById = useMemo(() => {
    const m = new Map<string, FbVenue>();
    for (const v of venues) m.set(v.id, v);
    return m;
  }, [venues]);

  const filtered = useMemo(() => {
    if (!venueFilter) return orders;
    return orders.filter((o) => o.venueId === venueFilter);
  }, [orders, venueFilter]);

  const grouped = useMemo(() => {
    const out: Record<Column, OrderForKitchen[]> = {
      pending: [],
      preparing: [],
      ready: [],
      on_the_way: [],
      pending_acceptance: [],
      completed: [],
    };
    for (const o of filtered) {
      for (const col of COLUMNS) {
        if (col.statuses.includes(o.status)) {
          out[col.key].push(o);
          break;
        }
      }
    }
    return out;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-5">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Cocina · Pedidos F&B
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Auto-actualización cada 10 segundos. Tap los botones para avanzar el estado del pedido.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos los venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refresh}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
            >
              ↻ Refrescar
            </button>
          </div>
        </header>

        {/* Kanban */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => (
            <section
              key={col.key}
              className="rounded-xl bg-white p-2 shadow-sm"
            >
              <h2 className="mb-2 px-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {col.label}{" "}
                <span className="text-slate-400">({grouped[col.key].length})</span>
              </h2>
              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-400">
                    Sin pedidos
                  </div>
                ) : (
                  grouped[col.key].map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      venueName={venueById.get(o.venueId)?.name ?? "—"}
                      venueType={venueById.get(o.venueId)?.type ?? "restaurant"}
                      onChange={(updated) => {
                        setOrders((cur) =>
                          cur.map((x) =>
                            x.id === updated.id ? { ...x, status: updated.status } : x
                          )
                        );
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  venueName,
  venueType,
  onChange,
}: {
  order: OrderForKitchen;
  venueName: string;
  venueType: "restaurant" | "cart";
  onChange: (next: { id: string; status: OrderStatus }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const statusColor = ORDER_STATUS_COLORS[order.status];

  const ago = useMemo(() => {
    const mins = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
    if (mins < 1) return "ahora";
    if (mins < 60) return `${Math.round(mins)} min`;
    return `${Math.round(mins / 60)} h`;
  }, [order.createdAt]);

  function apply(action: () => Promise<{ ok: boolean; error?: string }>, next: OrderStatus) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) onChange({ id: order.id, status: next });
      else alert(r.error ?? "Error");
    });
  }

  function onCancel() {
    const reason = prompt("Razón de la cancelación (opcional):") ?? "";
    apply(() => cancelOrder(order.id, reason), "cancelled");
  }

  // Botones según status actual
  const buttons: Array<{ label: string; onClick: () => void; color?: string }> = [];
  if (order.status === "pending") {
    buttons.push({
      label: "✓ Aceptar",
      onClick: () => apply(() => acceptOrder(order.id), "accepted"),
      color: "emerald",
    });
  }
  if (order.status === "accepted") {
    buttons.push({
      label: "🍳 Preparando",
      onClick: () => apply(() => markOrderPreparing(order.id), "preparing"),
      color: "indigo",
    });
  }
  if (order.status === "preparing") {
    buttons.push({
      label: "✓ Listo",
      onClick: () => apply(() => markOrderReady(order.id), "ready"),
      color: "emerald",
    });
  }
  if (order.status === "ready") {
    if (order.deliveryType === "on_course" && venueType === "cart") {
      buttons.push({
        label: "🚗 En camino",
        onClick: () => apply(() => markOrderOnTheWay(order.id), "on_the_way"),
        color: "cyan",
      });
    }
    buttons.push({
      label: "📦 Marcar entregado (esperar OK cliente)",
      onClick: () => apply(() => markOrderDelivered(order.id), "pending_acceptance"),
      color: "emerald",
    });
  }
  if (order.status === "on_the_way") {
    buttons.push({
      label: "📦 Marcar entregado (esperar OK cliente)",
      onClick: () => apply(() => markOrderDelivered(order.id), "pending_acceptance"),
      color: "emerald",
    });
  }
  // En 'pending_acceptance' la cocina/carrito NO puede avanzar más. Solo
  // el cliente puede aceptar desde su Mini App. Si no responde en mucho
  // tiempo, el comité puede forzar via SQL o vía vista de disputas.
  const canCancel =
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "disputed" &&
    order.status !== "pending_acceptance"; // no cancelar después de entregar

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div
        className="rounded-t-lg px-3 py-1.5"
        style={{ backgroundColor: statusColor.bg, color: statusColor.fg }}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <span className="text-[10px] opacity-80">hace {ago}</span>
        </div>
      </div>

      {/* Cliente */}
      <div className="border-b border-slate-100 px-3 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-bold text-slate-900">
            {order.clientLabel}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
            {order.clientKind === "player"
              ? "🏌️ Jugador"
              : order.clientKind === "caddie"
                ? "🎒 Caddie"
                : "👤"}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          {venueName}
          {order.groupNo != null ? ` · Grupo ${order.groupNo}` : ""}
          {order.deliveryType === "on_course"
            ? ` · 🚚 Entregar en hoyo ${order.requestedHole ?? "?"}`
            : " · 🏠 Recoge en el venue"}
        </div>

        {/* Ubicación en vivo del cliente */}
        {order.liveLocation.currentHole != null ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-sky-50 px-2 py-1 text-[10px] text-sky-900">
            <span>
              📍 Cliente en <strong>hoyo {order.liveLocation.currentHole}</strong>
            </span>
            {order.liveLocation.lastSeenAgoMin != null ? (
              <span className="text-sky-700">
                {order.liveLocation.lastSeenAgoMin === 0
                  ? "(ahorita)"
                  : `(hace ${order.liveLocation.lastSeenAgoMin} min)`}
              </span>
            ) : null}
            {order.liveLocation.etaMin != null && order.liveLocation.etaMin > 0 ? (
              <span className="rounded bg-sky-200 px-1.5 py-0.5 font-bold">
                ETA ~{order.liveLocation.etaMin} min
              </span>
            ) : order.liveLocation.etaMin === 0 ? (
              <span className="rounded bg-emerald-200 px-1.5 py-0.5 font-bold text-emerald-900">
                ¡ya llegó!
              </span>
            ) : null}
            {order.groupId ? (
              <a
                href={`/ritmo?group_id=${order.groupId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline"
              >
                ver mapa →
              </a>
            ) : null}
          </div>
        ) : (
          <div className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
            📍 Sin ubicación en vivo del cliente (no comparte GPS o pings &gt;30 min)
          </div>
        )}
      </div>

      {/* Items */}
      <ul className="border-b border-slate-100 px-3 py-2 text-[12px] text-slate-800">
        {order.items.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2">
            <span>
              <strong>{l.qty}×</strong> {l.itemNameSnapshot}
              {l.notes ? (
                <em className="ml-1 text-[10px] text-slate-500">({l.notes})</em>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {formatPrice(l.unitPriceCents * l.qty)}
            </span>
          </li>
        ))}
      </ul>

      {order.notes ? (
        <div className="border-b border-slate-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          📝 {order.notes}
        </div>
      ) : null}

      {/* Total + acciones */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-sm font-bold text-emerald-700">
          {formatPrice(order.totalCents)}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {buttons.map((b, i) => (
            <button
              key={i}
              type="button"
              disabled={pending}
              onClick={b.onClick}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50 ${
                b.color === "indigo"
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : b.color === "cyan"
                    ? "bg-cyan-600 hover:bg-cyan-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {b.label}
            </button>
          ))}
          {canCancel ? (
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
