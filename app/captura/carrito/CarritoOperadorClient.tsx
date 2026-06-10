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

type Tab = "orders" | "inventory";

interface Props {
  venue: FbVenue;
  carts: FbVenue[];
  initialOrders: OrderForKitchen[];
}

export default function CarritoOperadorClient({ venue, carts, initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState<Tab>("orders");
  const prevPickupCountRef = useRef<number>(
    initialOrders.filter((o) => o.status === "awaiting_cart_pickup").length
  );

  // Sonido de notificación (beep simple via Web Audio)
  const playBeep = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.start();
      setTimeout(() => {
        osc.frequency.value = 1320;
      }, 150);
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 350);
      // Vibración táctil si está soportada
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // silencioso
    }
  }, []);

  // Auto-refresh cada 10 seg
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/fb-admin/orders?venue_id=${venue.id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { ok: boolean; orders: OrderForKitchen[] };
      if (json.ok) {
        // Detectar si hay NUEVOS pedidos por recoger del restaurante
        const newPickupCount = json.orders.filter(
          (o) => o.status === "awaiting_cart_pickup"
        ).length;
        if (newPickupCount > prevPickupCountRef.current) {
          playBeep();
        }
        prevPickupCountRef.current = newPickupCount;
        setOrders(json.orders);
      }
    } catch {
      // silencioso
    }
  }, [venue.id, playBeep]);

  useEffect(() => {
    const id = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Ordenar: PASA A RECOGER primero (urgente!), luego nuevos, luego por hoyo
  const sorted = useMemo(() => {
    const order: OrderStatus[] = [
      "awaiting_cart_pickup", // restaurante terminó, hay que pasar a recoger
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
  const pickupCount = orders.filter(
    (o) => o.status === "awaiting_cart_pickup"
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
            <div className="flex flex-col items-end gap-1">
              {pickupCount > 0 ? (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
                  📦 {pickupCount} por recoger
                </span>
              ) : null}
              {pendingCount > 0 ? (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
                  {pendingCount} nuevos
                </span>
              ) : null}
            </div>
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

        {/* Pestañas */}
        <div className="flex border-b border-slate-700 bg-slate-800">
          <button
            type="button"
            onClick={() => setTab("orders")}
            className={[
              "flex-1 py-3 text-sm font-bold transition",
              tab === "orders"
                ? "border-b-2 border-emerald-400 text-emerald-300"
                : "text-slate-400",
            ].join(" ")}
          >
            🍽️ Pedidos ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("inventory")}
            className={[
              "flex-1 py-3 text-sm font-bold transition",
              tab === "inventory"
                ? "border-b-2 border-emerald-400 text-emerald-300"
                : "text-slate-400",
            ].join(" ")}
          >
            📦 Inventario
          </button>
        </div>

        {/* Captura manual rápida — pedido verbal */}
        <Link
          href={`/fb-nuevo-pedido?venue=${encodeURIComponent(venue.code)}`}
          className="mx-3 mt-3 flex items-center justify-between rounded-lg border-2 border-amber-500/50 bg-amber-950/40 px-3 py-2.5 text-amber-100 hover:bg-amber-950/60"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            ✍️ Capturar pedido verbal
          </span>
          <span className="text-[10px] text-amber-300/80">
            📍 Jugadores cerca →
          </span>
        </Link>

        {tab === "orders" ? (
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
        ) : (
          <InventoryPanel venueId={venue.id} />
        )}
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
  if (order.status === "awaiting_cart_pickup")
    buttons.push({
      label: "🛒 Recogido del Hoyo 6 · en camino al cliente",
      onClick: () => apply(() => markOrderOnTheWay(order.id), "on_the_way"),
      color: "amber",
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
  const isPickup = order.status === "awaiting_cart_pickup";

  return (
    <article
      className={[
        "overflow-hidden rounded-lg border bg-slate-800",
        isPickup
          ? "border-amber-500 ring-2 ring-amber-500/40 animate-pulse"
          : isNew
            ? "border-red-500 ring-2 ring-red-500/30"
            : "border-slate-700",
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
          {order.clientKind === "player"
            ? "🏌️ Jugador"
            : order.clientKind === "caddie"
              ? "🎒 Caddie"
              : order.clientKind === "resident"
                ? "🏡 Socio"
                : order.clientKind === "table"
                  ? "🪑 Mesa"
                  : "Cliente"}
          {order.groupNo != null ? ` · Grupo ${order.groupNo}` : ""}
          {order.requestedHole != null
            ? ` · 🎯 Entregar en hoyo ${order.requestedHole}`
            : ""}
        </div>
      </div>

      {/* Domicilio de entrega — reparto al fraccionamiento */}
      {order.deliveryType === "home" && order.deliveryAddress ? (
        <div className="border-b border-emerald-800 bg-emerald-950 px-3 py-2 text-[12px] text-emerald-200">
          🏡 <strong className="text-white">Entregar en:</strong>{" "}
          {order.deliveryAddress}
        </div>
      ) : null}

      {/* Ubicación del cliente — crítico para el operador (solo en campo) */}
      {order.deliveryType !== "home" && order.liveLocation.currentHole != null ? (
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
      ) : order.deliveryType !== "home" ? (
        <div className="border-b border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-500">
          📍 Sin GPS del cliente
        </div>
      ) : null}

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

      {/* Badge especial para pickup */}
      {isPickup ? (
        <div className="border-b border-amber-700 bg-amber-950 px-3 py-2 text-center text-[12px] font-bold text-amber-200">
          📦 RESTAURANTE TIENE LISTO ESTE PEDIDO · PASA A RECOGER AL HOYO 6
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
                  : b.color === "amber"
                    ? "bg-amber-600 hover:bg-amber-700"
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

// ============================================================
// Panel de inventario (qty por item del menú del carrito)
// ============================================================
interface StockItem {
  menuItemId: string;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  priceCents: number;
  qtyAvailable: number;
  lowThreshold: number;
  isInfinite: boolean;
}

function InventoryPanel({ venueId }: { venueId: string }) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const pull = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/captura/cart-stock?venue_id=${venueId}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok: boolean; stock: StockItem[] };
      if (json.ok) setStock(json.stock);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void pull();
  }, [pull]);

  const filtered = useMemo(() => {
    if (!filter) return stock;
    const f = filter.toLowerCase();
    return stock.filter((s) => s.name.toLowerCase().includes(f));
  }, [stock, filter]);

  async function update(menuItemId: string, action: "inc" | "dec" | "set" | "remove", qty?: number) {
    const res = await fetch("/api/captura/cart-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venue_id: venueId, menu_item_id: menuItemId, action, qty }),
    });
    const json = (await res.json()) as { ok: boolean; qtyAvailable?: number; removed?: boolean };
    if (json.ok) {
      setStock((cur) =>
        cur.map((s) => {
          if (s.menuItemId !== menuItemId) return s;
          if (json.removed) return { ...s, qtyAvailable: 0, isInfinite: true };
          return {
            ...s,
            qtyAvailable: json.qtyAvailable ?? s.qtyAvailable,
            isInfinite: false,
          };
        })
      );
    }
  }

  return (
    <main className="space-y-2 p-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar item..."
        className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
      />
      {loading ? (
        <div className="rounded-md bg-slate-800 p-4 text-center text-sm text-slate-400">
          Cargando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md bg-slate-800 p-4 text-center text-sm text-slate-400">
          Sin items en este venue
        </div>
      ) : (
        filtered.map((s) => {
          const isLow = !s.isInfinite && s.qtyAvailable <= s.lowThreshold;
          const isOut = !s.isInfinite && s.qtyAvailable === 0;
          return (
            <div
              key={s.menuItemId}
              className={[
                "flex items-center justify-between gap-2 rounded-md border bg-slate-800 p-2",
                isOut
                  ? "border-red-500"
                  : isLow
                    ? "border-amber-500"
                    : "border-slate-700",
              ].join(" ")}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.imageUrl}
                    alt={s.name}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-700 text-xl">
                    {s.emoji ?? "🍽️"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold text-slate-100">
                    {s.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {s.isInfinite
                      ? "Stock ilimitado"
                      : isOut
                        ? "🚫 SIN STOCK — pedidos van al restaurante"
                        : isLow
                          ? `⚠ Stock bajo · queda ${s.qtyAvailable}`
                          : `${s.qtyAvailable} disponibles`}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => update(s.menuItemId, "dec", 1)}
                  className="h-8 w-8 rounded-full border border-slate-600 bg-slate-700 text-base font-bold text-slate-100 disabled:opacity-50"
                  disabled={s.isInfinite || s.qtyAvailable === 0}
                >
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  value={s.isInfinite ? "" : s.qtyAvailable}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) {
                      void update(s.menuItemId, "set", v);
                    }
                  }}
                  className="h-8 w-14 rounded border border-slate-600 bg-slate-900 text-center text-sm font-bold text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => update(s.menuItemId, "inc", 1)}
                  className="h-8 w-8 rounded-full border border-emerald-600 bg-emerald-700 text-base font-bold text-white"
                >
                  +
                </button>
                {!s.isInfinite ? (
                  <button
                    type="button"
                    onClick={() => update(s.menuItemId, "remove")}
                    className="ml-1 text-[10px] text-slate-400 underline"
                    title="Quitar limite (volver a stock infinito)"
                  >
                    ∞
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      )}
      <p className="pt-2 text-center text-[10px] text-slate-500">
        Sin cantidad = stock infinito · Toca ∞ para quitar el limite
      </p>
    </main>
  );
}
