"use client";

/**
 * Vista cliente del menú F&B.
 *
 * Flujo:
 *  1. Cargar venues activos + sus rangos de hoyos
 *  2. Elegir venue (Hoyo 6 = pickup; carrito = on_course)
 *  3. Ver menú filtrado para ese venue, agrupado por categoría
 *  4. Agregar items al carrito (cantidad + notas)
 *  5. Confirmar → POST /api/captura/fb-order
 *  6. Ver el pedido en "Mis pedidos" abajo, con su estado en vivo
 *
 * El GPS del cliente ya está siendo enviado por el chip de la captura;
 * el backend usa smoothedHoleForGroup para auto-detectar el hoyo al
 * pedir, así que el cliente no tiene que decirlo manualmente.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { formatPrice, ORDER_STATUS_LABELS, type DeliveryType, type FbVenue } from "@/lib/fb/types";
import { iconForCategory, iconForMenuItem } from "@/lib/fb/icons";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  prepMinutes: number | null;
  /** Override manual del restaurante. Si null, usar iconForMenuItem(). */
  displayEmoji: string | null;
}

interface CategoryGroup {
  category: { id: string; code: string; name: string };
  items: MenuItem[];
}

interface CartLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  qty: number;
  notes: string | null;
}

interface MyOrderLine {
  id: string;
  qty: number;
  unit_price_cents: number;
  item_name_snapshot: string;
}

interface MyOrder {
  id: string;
  venue_id: string;
  delivery_type: DeliveryType;
  status: string;
  requested_hole: number | null;
  total_cents: number;
  created_at: string;
  fb_order_items: MyOrderLine[];
}

export default function MenuClient() {
  // ============ Identidad del cliente desde URL ============
  const [meEntryId, setMeEntryId] = useState<string | null>(null);
  const [caddieId, setCaddieId] = useState<string | null>(null);
  const [backHref, setBackHref] = useState<string>("/score-entry");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    setMeEntryId(sp.get("me")?.trim() || null);
    setCaddieId(sp.get("caddie")?.trim() || null);
    const back = sp.get("back");
    if (back) setBackHref(back);
  }, []);

  // ============ Carga inicial de venues + menú ============
  const [venues, setVenues] = useState<FbVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [menu, setMenu] = useState<CategoryGroup[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      setLoadingMenu(true);
      try {
        const url = selectedVenueId
          ? `/api/captura/fb-menu?venue_id=${encodeURIComponent(selectedVenueId)}`
          : `/api/captura/fb-menu`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          venues: FbVenue[];
          menu: CategoryGroup[];
        };
        if (cancelled || !json.ok) return;
        setVenues(json.venues);
        if (!selectedVenueId && json.venues[0]) {
          setSelectedVenueId(json.venues[0].id);
        }
        setMenu(json.menu);
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    }
    void pull();
    return () => {
      cancelled = true;
    };
  }, [selectedVenueId]);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  // ============ Carrito ============
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cartTotalCents = cart.reduce(
    (acc, l) => acc + l.priceCents * l.qty,
    0
  );

  const addToCart = useCallback((it: MenuItem) => {
    setCart((cur) => {
      const idx = cur.findIndex((c) => c.menuItemId === it.id);
      if (idx >= 0) {
        const next = cur.slice();
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...cur,
        {
          menuItemId: it.id,
          name: it.name,
          priceCents: it.priceCents,
          qty: 1,
          notes: null,
        },
      ];
    });
  }, []);

  const decFromCart = useCallback((menuItemId: string) => {
    setCart((cur) => {
      const idx = cur.findIndex((c) => c.menuItemId === menuItemId);
      if (idx < 0) return cur;
      const next = cur.slice();
      if (next[idx].qty <= 1) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], qty: next[idx].qty - 1 };
      }
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ============ Confirmar pedido ============
  const confirmOrder = useCallback(async () => {
    if (cart.length === 0 || !selectedVenue) return;
    if (!meEntryId && !caddieId) {
      setSubmitError("No te tengo identificado en la captura. Reabre el link del bot.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const deliveryType: DeliveryType =
        selectedVenue.type === "restaurant" ? "pickup" : "on_course";
      const res = await fetch("/api/captura/fb-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entry_id: meEntryId,
          caddie_id: caddieId,
          venue_id: selectedVenue.id,
          delivery_type: deliveryType,
          notes: orderNotes || null,
          items: cart.map((l) => ({
            menu_item_id: l.menuItemId,
            qty: l.qty,
            notes: l.notes,
          })),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setSubmitError(json.error ?? "No se pudo crear el pedido.");
        return;
      }
      clearCart();
      setOrderNotes("");
      // Refrescar lista de pedidos
      void pullOrders();
    } finally {
      setSubmitting(false);
    }
  }, [cart, selectedVenue, meEntryId, caddieId, orderNotes, clearCart]);

  // ============ Mis pedidos + estado de cuenta ============
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [accountCents, setAccountCents] = useState(0);

  const pullOrders = useCallback(async () => {
    if (!meEntryId && !caddieId) return;
    const sp = new URLSearchParams();
    if (meEntryId) sp.set("entry_id", meEntryId);
    if (caddieId) sp.set("caddie_id", caddieId);
    const res = await fetch(`/api/captura/fb-order?${sp.toString()}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      orders: MyOrder[];
      account: { total_cents: number };
    };
    if (json.ok) {
      setMyOrders(json.orders);
      setAccountCents(json.account.total_cents);
    }
  }, [meEntryId, caddieId]);

  useEffect(() => {
    if (!meEntryId && !caddieId) return;
    void pullOrders();
    const id = window.setInterval(pullOrders, 15_000);
    return () => window.clearInterval(id);
  }, [meEntryId, caddieId, pullOrders]);

  // ============ Render ============
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-md bg-[#eef3f7] pb-28">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-black px-3 py-2 text-white">
          <div>
            <div className="text-sm font-semibold">🍔 Menú · List.Golf</div>
            <div className="text-[10px] opacity-70">
              {selectedVenue?.name ?? "Cargando…"}
            </div>
          </div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
          >
            ← Volver
          </Link>
        </header>

        {/* Selector de venue */}
        <div className="overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex gap-2">
            {venues.map((v) => {
              const isSel = v.id === selectedVenueId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVenueId(v.id)}
                  className={[
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                    isSel
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 bg-white text-slate-600",
                  ].join(" ")}
                >
                  {v.type === "restaurant" ? "🏠 " : "🚚 "}
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Banner: pedidos esperando MI confirmación de entrega */}
        {myOrders
          .filter((o) => o.status === "pending_acceptance")
          .map((o) => (
            <PendingAcceptanceBanner
              key={o.id}
              order={o}
              meEntryId={meEntryId}
              caddieId={caddieId}
              onResolved={() => void pullOrders()}
            />
          ))}

        {/* Menú */}
        <main className="space-y-4 p-3">
          {loadingMenu ? (
            <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
              Cargando menú…
            </div>
          ) : menu.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">
              Este venue todavía no tiene items disponibles.
            </div>
          ) : (
            menu.map((g) => (
              <section key={g.category.id}>
                <h2 className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span aria-hidden="true" className="text-base leading-none">
                    {iconForCategory(g.category.code)}
                  </span>
                  {g.category.name}
                </h2>
                <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                  {g.items.map((it, idx) => {
                    const inCart = cart.find((c) => c.menuItemId === it.id);
                    const itemIcon =
                      it.displayEmoji ??
                      iconForMenuItem(it.name, g.category.code);
                    // Cascada visual: foto manual del restaurante → emoji
                    // (manual o helper). NO usamos stock photos genericas;
                    // si no hay foto subida del item, mostramos el emoji.
                    const photoUrl = it.imageUrl ?? null;
                    return (
                      <div
                        key={it.id}
                        className={[
                          "flex items-center justify-between gap-3 p-3",
                          idx > 0 ? "border-t border-slate-100" : "",
                        ].join(" ")}
                      >
                        <ItemThumb
                          photoUrl={photoUrl}
                          fallbackEmoji={itemIcon}
                          alt={it.name}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-[13px] font-semibold">
                              {it.name}
                            </span>
                            <span className="shrink-0 text-[13px] font-bold text-emerald-700">
                              {formatPrice(it.priceCents)}
                            </span>
                          </div>
                          {it.description ? (
                            <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                              {it.description}
                            </p>
                          ) : null}
                        </div>
                        {inCart ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => decFromCart(it.id)}
                              className="h-7 w-7 rounded-full border border-slate-300 bg-white text-[14px] font-bold text-slate-700"
                            >
                              −
                            </button>
                            <span className="min-w-[16px] text-center text-sm font-bold">
                              {inCart.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(it)}
                              className="h-7 w-7 rounded-full border border-emerald-500 bg-emerald-50 text-[14px] font-bold text-emerald-700"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(it)}
                            className="rounded-md border border-emerald-500 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700"
                          >
                            + Agregar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {/* Mis pedidos del torneo */}
          {myOrders.length > 0 ? (
            <section className="mt-6">
              <div className="mb-1 flex items-baseline justify-between px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Mi cuenta del torneo
                </h2>
                <span className="text-sm font-bold text-emerald-700">
                  {formatPrice(accountCents)}
                </span>
              </div>
              <div className="space-y-2">
                {myOrders.slice(0, 8).map((o) => (
                  <div
                    key={o.id}
                    className="rounded-lg bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        {ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] ?? o.status}
                        {o.requested_hole != null
                          ? ` · Hoyo ${o.requested_hole}`
                          : ""}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatPrice(o.total_cents)}
                      </span>
                    </div>
                    <ul className="mt-1 text-[12px] text-slate-700">
                      {o.fb_order_items.map((l) => (
                        <li key={l.id}>
                          {l.qty}× {l.item_name_snapshot}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        {/* Carrito fijo abajo */}
        {cart.length > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-slate-300 bg-white shadow-2xl">
            <div className="space-y-1 p-3">
              {cart.map((l) => (
                <div
                  key={l.menuItemId}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="truncate">
                    {l.qty}× {l.name}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatPrice(l.priceCents * l.qty)}
                  </span>
                </div>
              ))}
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Notas (sin cebolla, para 4 personas, etc.)"
                rows={1}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-[12px]"
              />
              {submitError ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-800">
                  {submitError}
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-[11px] font-semibold text-slate-500"
                >
                  Vaciar
                </button>
                <button
                  type="button"
                  onClick={confirmOrder}
                  disabled={submitting}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting
                    ? "Enviando…"
                    : `Confirmar · ${formatPrice(cartTotalCents)}`}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Banner prominente cuando el restaurante/carrito declara entregado un
 * pedido. El cliente debe confirmar (✅ Recibido) o disputar (❌ No me
 * llegó). Hasta que confirme, NO se carga a la cuenta.
 */
function PendingAcceptanceBanner({
  order,
  meEntryId,
  caddieId,
  onResolved,
}: {
  order: MyOrder;
  meEntryId: string | null;
  caddieId: string | null;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function send(action: "accept" | "dispute") {
    setBusy(true);
    let reason: string | undefined;
    if (action === "dispute") {
      reason =
        prompt(
          "¿Qué pasó? (opcional)\nej: no me llegó, me entregaron incorrecto, ya pasó el carrito..."
        ) || undefined;
    }
    try {
      const res = await fetch("/api/captura/fb-order/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          action,
          reason,
          entry_id: meEntryId,
          caddie_id: caddieId,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "No se pudo procesar.");
      } else {
        onResolved();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-3 mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 shadow-md">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
          🔔 Confirma tu pedido
        </span>
        <span className="text-[11px] text-amber-700">
          {formatPrice(order.total_cents)}
        </span>
      </div>
      <p className="mb-2 text-[13px] font-semibold text-amber-900">
        El restaurante marcó tu pedido como entregado. ¿Lo recibiste?
      </p>
      <ul className="mb-3 text-[12px] text-amber-900">
        {order.fb_order_items.map((l) => (
          <li key={l.id}>
            {l.qty}× {l.item_name_snapshot}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send("accept")}
          className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          ✅ Sí, lo recibí
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => send("dispute")}
          className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          ❌ No me llegó
        </button>
      </div>
      <p className="mt-2 text-[10px] text-amber-700">
        Hasta que confirmes, el pedido no se carga a tu cuenta del torneo.
      </p>
    </div>
  );
}

/**
 * Thumbnail del item con fallback automático.
 * Si la URL de la foto falla (404, CORS, red), cae graceful al emoji.
 */
function ItemThumb({
  photoUrl,
  fallbackEmoji,
  alt,
}: {
  photoUrl: string | null;
  fallbackEmoji: string;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!photoUrl || broken) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">
        {fallbackEmoji}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
    />
  );
}
