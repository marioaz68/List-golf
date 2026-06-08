"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  acceptOrder,
  markOrderDelivered,
  markOrderOnTheWay,
  markOrderPreparing,
  markOrderReady,
} from "@/lib/fb/orderActions";
import type { OrderForKitchen } from "@/lib/fb/loadOrders";
import {
  formatPrice,
  ORDER_STATUS_LABELS,
  type FbVenue,
  type OrderStatus,
} from "@/lib/fb/types";

interface Props {
  venue: FbVenue;
  carts: FbVenue[];
  initialOrders: OrderForKitchen[];
}

export default function CarritoOperadorClient({ venue, carts, initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);

  // Auto-refresh cada 10 seg
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/fb-admin/orders?venue_id=${venue.id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; orders: OrderForKitchen[] };
      if (json.ok) setOrders(json.orders);
    } catch {
      // silencioso
    }
  }, [venue.id]);

  useEffect(() => {
    const id = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Ordenar: nuevos primero, luego por hoyo del cliente (los más cerca al
  // recorrido del carrito primero para optimizar rutas)
  const sorted = useMemo(() => {
    const order: OrderStatus[] = [
      "pending",
      "accepted",
      "preparing",
      "ready",
      "on_the_way",
      "pending_acceptance",
    ];
    return [...orders].sort((a, b) => {
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      const ah = a.liveLocation.currentHole ?? 99;
      const bh = b.liveLocation.currentHole ?? 99;
      return ah - bh;
    });
  }, [orders]);

  const pendingCount = orders.filter(
    (o) => o.status === "pending" || o.status === "accepted"
  ).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md pb-24">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900/95 backdrop-blur px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">🚚 {venue.name}</h1>
              <p className="text-[10px] text-slate-400">
                {venue.holeRangeStart && venue.holeRangeEnd
                  ? `Hoyos ${venue.holeRangeStart}-${venue.holeRangeEnd}`
                  : "Carrito bar"}{" "}
                · {orders.length} pedidos activos
              </p>
            </div>
            {pendingCount > 0 ? (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
                {pendingCount} nuevos
              </span>
            ) : null}
          </div>
          {carts.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {carts.map((c) => (
                <Link
                  key={c.id}
                  href={`/captura/carrito?venue=${c.code}`}
                  className={[
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    c.id === venue.id
                      ? "border-emerald-400 bg-emerald-900 text-emerald-200"
                      : "border-slate-600 bg-slate-800 text-slate-300",
                  ].join(" ")}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        {/* GPS chip del carrito */}
        <CartGpsChip venueId={venue.id} />

        {/* Lista de pedidos */}
        <main className="space-y-3 p-3">
          {sorted.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800 p-8 text-center text-sm text-slate-400">
              Sin pedidos activos
            </div>
          ) : (
            sorted.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onChange={(next) =>
                  setOrders((cur) =>
                    cur.map((x) => (x.id === next.id ? { ...x, status: next.status } : x))
                  )
                }
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================================
// Chip GPS del carrito (similar al de cliente, distinto endpoint)
// ============================================================
function CartGpsChip({ venueId }: { venueId: string }) {
  const [state, setState] = useState<"off" | "asking" | "on" | "error">("off");
  const [lastHole, setLastHole] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const sendPing = useCallback(
    async (lat: number, lon: number, accuracy: number | null) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/captura/cart-position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ venue_id: venueId, lat, lon, accuracy }),
          keepalive: true,
        });
        if (res.ok) {
          const json = (await res.json()) as { hoyo?: number | null };
          if (typeof json.hoyo === "number") setLastHole(json.hoyo);
          lastSentRef.current = Date.now();
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [venueId]
  );

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      return;
    }
    setState("asking");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState("on");
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        const now = Date.now();
        if (now - lastSentRef.current >= 30_000) {
          void sendPing(lat, lon, accuracy);
        }
      },
      () => setState("error"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );
    watchIdRef.current = id;
  }, [sendPing]);

  const stop = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined") {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {}
      watchIdRef.current = null;
    }
    setState("off");
  }, []);

  function toggle() {
    if (state === "on" || state === "asking") stop();
    else start();
  }

  return (
    <div className="border-b border-slate-700 bg-slate-800 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-300">
          📡 GPS del carrito{" "}
          {state === "on" && lastHole != null ? (
            <span className="ml-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">
              hoyo {lastHole}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          className={[
            "rounded-full border px-3 py-1 text-[11px] font-bold transition",
            state === "on"
              ? "border-emerald-400 bg-emerald-900 text-emerald-200"
              : state === "asking"
                ? "border-amber-400 bg-amber-900 text-amber-200"
                : state === "error"
                  ? "border-red-400 bg-red-900 text-red-200"
                  : "border-slate-600 bg-slate-800 text-slate-400",
          ].join(" ")}
        >
          {state === "on"
            ? "ACTIVO · apagar"
            : state === "asking"
              ? "ACTIVANDO..."
              : state === "error"
                ? "ERROR · reintentar"
                : "ACTIVAR GPS"}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        Los clientes verán el carrito moverse en su Mini App y sabrán cuánto te falta para llegar.
      </p>
    </div>
  );
}

// ============================================================
// Tarjeta de pedido optimizada para celular del operador
// ============================================================
function OrderCard({
  order,
  onChange,
}: {
  order: OrderForKitchen;
  onChange: (next: { id: string; status: OrderStatus }) => void;
}) {
  const [pending, startTransition] = useTransition();

  function apply(action: () => Promise<{ ok: boolean; error?: string }>, next: OrderStatus) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) onChange({ id: order.id, status: next });
      else alert(r.error ?? "Error");
    });
  }

  const buttons: Array<{ label: string; onClick: () => void; color: string }> = [];
  if (order.status === "pending")
    buttons.push({
      label: "✓ Aceptar",
      onClick: () => apply(() => acceptOrder(order.id), "accepted"),
      color: "emerald",
    });
  if (order.status === "accepted")
    buttons.push({
      label: "📦 Preparando",
      onClick: () => apply(() => markOrderPreparing(order.id), "preparing"),
      color: "indigo",
    });
  if (order.status === "preparing")
    buttons.push({
      label: "✓ Listo",
      onClick: () => apply(() => markOrderReady(order.id), "ready"),
      color: "emerald",
    });
  if (order.status === "ready")
    buttons.push({
      label: "🚗 En camino al cliente",
      onClick: () => apply(() => markOrderOnTheWay(order.id), "on_the_way"),
      color: "cyan",
    });
  if (order.status === "on_the_way" || order.status === "ready")
    buttons.push({
      label: "✅ Entregado (esperar OK cliente)",
      onClick: () => apply(() => markOrderDelivered(order.id), "pending_acceptance"),
      color: "emerald",
    });

  const ago = useMemo(() => {
    const mins = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
    if (mins < 1) return "ahora";
    if (mins < 60) return `${Math.round(mins)} min`;
    return `${Math.round(mins / 60)} h`;
  }, [order.createdAt]);

  const isNew = order.status === "pending";

  return (
    <article
      className={[
        "overflow-hidden rounded-lg border bg-slate-800",
        isNew ? "border-red-500 ring-2 ring-red-500/30" : "border-slate-700",
      ].join(" ")}
    >
      <div className="border-b border-slate-700 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <span className="text-[10px] text-slate-500">hace {ago}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-white">{order.clientLabel}</span>
          <span className="text-base font-bold text-emerald-400">
            {formatPrice(order.totalCents)}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {order.clientKind === "player" ? "🏌️ Jugador" : "🎒 Caddie"}
          {order.groupNo != null ? ` · Grupo ${order.groupNo}` : ""}
          {order.requestedHole != null
            ? ` · 🎯 Entregar en hoyo ${order.requestedHole}`
            : ""}
        </div>
      </div>

      {/* Ubicación del cliente — crítico para el operador */}
      {order.liveLocation.currentHole != null ? (
        <div className="border-b border-slate-700 bg-sky-950 px-3 py-2 text-[12px] text-sky-200">
          <div className="flex items-center justify-between gap-2">
            <span>
              📍 Cliente en <strong className="text-white">hoyo {order.liveLocation.currentHole}</strong>
              {order.liveLocation.lastSeenAgoMin != null ? (
                <span className="ml-1 text-sky-400">
                  ({order.liveLocation.lastSeenAgoMin === 0 ? "ahorita" : `hace ${order.liveLocation.lastSeenAgoMin} min`})
                </span>
              ) : null}
            </span>
            {order.liveLocation.etaMin != null && order.liveLocation.etaMin > 0 ? (
              <span className="rounded bg-sky-700 px-2 py-0.5 text-[11px] font-bold">
                ~{order.liveLocation.etaMin} min
              </span>
            ) : order.liveLocation.etaMin === 0 ? (
              <span className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-bold">
                aquí!
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="border-b border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-500">
          📍 Sin GPS del cliente
        </div>
      )}

      <ul className="border-b border-slate-700 px-3 py-2 text-[13px]">
        {order.items.map((l) => (
          <li key={l.id} className="text-slate-200">
            <strong>{l.qty}×</strong> {l.itemNameSnapshot}
          </li>
        ))}
      </ul>

      {order.notes ? (
        <div className="border-b border-slate-700 bg-amber-950 px-3 py-2 text-[12px] text-amber-200">
          📝 {order.notes}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 p-2">
        {buttons.map((b, i) => (
          <button
            key={i}
            type="button"
            disabled={pending}
            onClick={b.onClick}
            className={[
              "rounded-md py-3 text-sm font-bold text-white disabled:opacity-50",
              b.color === "indigo"
                ? "bg-indigo-600 hover:bg-indigo-700"
                : b.color === "cyan"
                  ? "bg-cyan-600 hover:bg-cyan-700"
                  : "bg-emerald-600 hover:bg-emerald-700",
            ].join(" ")}
          >
            {b.label}
          </button>
        ))}
      </div>
    </article>
  );
}
