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

interface FavoriteItem {
  menuItem: {
    id: string;
    name: string;
    priceCents: number;
    imageUrl: string | null;
    displayEmoji: string | null;
    categoryId: string;
  };
  categoryCode: string;
  timesOrdered: number;
  lastOrderedAt: string;
  source: "pinned" | "auto";
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

interface MenuClientProps {
  initialEntryId: string | null;
  initialCaddieId: string | null;
  initialPlayerId: string | null;
  clientName: string | null;
  savedAddress: string | null;
  backHref: string | null;
  unlinkedTelegram: boolean;
  telegramUserId: string | null;
}

export default function MenuClient({
  initialEntryId,
  initialCaddieId,
  initialPlayerId,
  clientName,
  savedAddress,
  backHref: backHrefProp,
  unlinkedTelegram,
  telegramUserId,
}: MenuClientProps) {
  // ============ Identidad del cliente (resuelta en el server) ============
  const meEntryId = initialEntryId;
  const caddieId = initialCaddieId;
  const playerId = initialPlayerId;
  const backHref = backHrefProp || "/score-entry";
  const hasIdentity = Boolean(meEntryId || caddieId || playerId);

  // Domicilio para entregas a casa en el fraccionamiento (delivery_type=home).
  // Se autollena con el domicilio guardado en el perfil del cliente.
  const [homeAddress, setHomeAddress] = useState(savedAddress ?? "");

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

  const identityBody = useMemo(
    () => ({
      entry_id: meEntryId,
      caddie_id: caddieId,
      player_id: playerId,
    }),
    [meEntryId, caddieId, playerId]
  );

  const startCheckout = useCallback(
    async (payload: { order_id?: string; pay_account?: boolean }) => {
      const res = await fetch("/api/captura/fb-order/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...identityBody, ...payload }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        checkout_url?: string;
        error?: string;
      };
      if (!json.ok || !json.checkout_url) {
        throw new Error(json.error ?? "No se pudo abrir el pago con tarjeta.");
      }
      window.location.href = json.checkout_url;
    },
    [identityBody]
  );

  // ============ Confirmar pedido ============
  // Venue de reparto a domicilio en el fraccionamiento
  const isHomeDelivery = selectedVenue?.code === "cart_fracc";
  const isPickup = selectedVenue?.type === "restaurant";
  const needsPrepay = isPickup || isHomeDelivery;

  // Manda al ritmo la ubicación GPS real de quien captura el pedido.
  // No bloquea el pedido: si el navegador niega permiso, simplemente no
  // aporta punto. El backend ignora pings imprecisos para avanzar el hoyo.
  const pingMyPosition = useCallback(() => {
    if (!meEntryId && !caddieId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void fetch("/api/captura/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entry_id: meEntryId,
            caddie_id: caddieId,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, [meEntryId, caddieId]);

  const confirmOrder = useCallback(async () => {
    if (cart.length === 0 || !selectedVenue) return;
    if (!meEntryId && !caddieId && !playerId) {
      setSubmitError("No te tengo identificado. Reabre el link del bot (escribe MENU).");
      return;
    }
    // Afinar el ritmo con la ubicación real de quien captura (no bloquea).
    pingMyPosition();
    const homeDelivery = selectedVenue.code === "cart_fracc";
    if (homeDelivery && !homeAddress.trim()) {
      setSubmitError("Escribe tu domicilio de entrega (calle, número/lote).");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const deliveryType: DeliveryType = homeDelivery
        ? "home"
        : selectedVenue.type === "restaurant"
          ? "pickup"
          : "on_course";
      const res = await fetch("/api/captura/fb-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entry_id: meEntryId,
          caddie_id: caddieId,
          player_id: playerId,
          venue_id: selectedVenue.id,
          delivery_type: deliveryType,
          delivery_address: homeDelivery ? homeAddress.trim() : null,
          notes: orderNotes || null,
          items: cart.map((l) => ({
            menu_item_id: l.menuItemId,
            qty: l.qty,
            notes: l.notes,
          })),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        order_id?: string;
        needs_payment?: boolean;
      };
      if (!json.ok) {
        setSubmitError(json.error ?? "No se pudo crear el pedido.");
        return;
      }
      if (json.needs_payment && json.order_id) {
        await startCheckout({ order_id: json.order_id });
        return;
      }
      clearCart();
      setOrderNotes("");
      void pullOrders();
    } finally {
      setSubmitting(false);
    }
  }, [
    cart,
    selectedVenue,
    meEntryId,
    caddieId,
    playerId,
    homeAddress,
    orderNotes,
    clearCart,
    startCheckout,
    pingMyPosition,
  ]);

  // ============ Mis pedidos + estado de cuenta + favoritos ============
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [accountCents, setAccountCents] = useState(0);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const pullOrders = useCallback(async () => {
    if (!meEntryId && !caddieId && !playerId) return;
    const sp = new URLSearchParams();
    if (meEntryId) sp.set("entry_id", meEntryId);
    else if (caddieId) sp.set("caddie_id", caddieId);
    else if (playerId) sp.set("player_id", playerId);
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
  }, [meEntryId, caddieId, playerId]);

  useEffect(() => {
    if (!meEntryId && !caddieId && !playerId) return;
    void pullOrders();
    const id = window.setInterval(pullOrders, 15_000);
    return () => window.clearInterval(id);
  }, [meEntryId, caddieId, playerId, pullOrders]);

  // Cargar favoritos del cliente (filtrados por venue seleccionado)
  const pullFavorites = useCallback(async () => {
    if (!meEntryId && !caddieId && !playerId) return;
    const sp = new URLSearchParams();
    if (meEntryId) sp.set("entry_id", meEntryId);
    else if (caddieId) sp.set("caddie_id", caddieId);
    else if (playerId) sp.set("player_id", playerId);
    if (selectedVenueId) sp.set("venue_id", selectedVenueId);
    try {
      const res = await fetch(`/api/captura/fb-favorites?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        favorites: FavoriteItem[];
      };
      if (json.ok) setFavorites(json.favorites);
    } catch {
      // ignore
    }
  }, [meEntryId, caddieId, playerId, selectedVenueId]);

  useEffect(() => {
    void pullFavorites();
  }, [pullFavorites]);

  // Toggle pin / hide para un item
  const toggleFavorite = useCallback(
    async (menuItemId: string, action: "pin" | "unpin" | "hide" | "unhide") => {
      if (!meEntryId && !caddieId && !playerId) return;
      await fetch("/api/captura/fb-favorites/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entry_id: meEntryId,
          caddie_id: caddieId,
          player_id: playerId,
          menu_item_id: menuItemId,
          action,
        }),
      });
      void pullFavorites();
    },
    [meEntryId, caddieId, playerId, pullFavorites]
  );

  const pinnedIds = useMemo(
    () => new Set(favorites.filter((f) => f.source === "pinned").map((f) => f.menuItem.id)),
    [favorites]
  );

  // Ubicación del carrito bar seleccionado (auto-refresh cada 20s)
  interface CartLoc {
    venueId: string;
    venueName: string;
    currentHole: number | null;
    lastSeenAgoMin: number | null;
    etaMinToMyHole: number | null;
  }
  const [cartLocations, setCartLocations] = useState<CartLoc[]>([]);
  const [myCurrentHole, setMyCurrentHole] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedVenue || selectedVenue.type !== "cart" || isHomeDelivery) {
      setCartLocations([]);
      return;
    }
    let cancelled = false;
    async function pull() {
      const sp = new URLSearchParams();
      if (myCurrentHole) sp.set("my_hole", String(myCurrentHole));
      try {
        const res = await fetch(`/api/captura/cart-locations?${sp.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { ok: boolean; carts: CartLoc[] };
        if (!cancelled && json.ok) setCartLocations(json.carts);
      } catch {
        // ignore
      }
    }
    void pull();
    const id = window.setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedVenue, myCurrentHole]);

  // Inferir mi hoyo actual de los pedidos (snapshot al momento de pedir)
  useEffect(() => {
    const latest = myOrders[0];
    if (latest?.requested_hole) setMyCurrentHole(latest.requested_hole);
  }, [myOrders]);

  const cartLocForSelected = cartLocations.find(
    (c) => c.venueId === selectedVenueId
  );

  // ============ Render ============
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:pt-16">
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

        {/* Aviso: Telegram no vinculado (abrió con MENU pero no es socio) */}
        {unlinkedTelegram ? (
          <div className="m-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
            <div className="font-bold">⚠️ Tu Telegram no está vinculado</div>
            <p className="mt-1">
              Puedes ver el menú, pero para pedir, el club debe darte de alta como
              socio. Pásale tu ID de Telegram al comité:
            </p>
            {telegramUserId ? (
              <code className="mt-1 block rounded bg-amber-100 px-2 py-1 font-mono text-[11px]">
                {telegramUserId}
              </code>
            ) : null}
          </div>
        ) : null}

        {/* Saludo al socio identificado */}
        {clientName && !unlinkedTelegram ? (
          <div className="border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
            👋 Hola <span className="font-semibold text-slate-700">{clientName}</span>
          </div>
        ) : null}

        {/* Captura de domicilio — reparto al fraccionamiento */}
        {isHomeDelivery ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              🏡 Domicilio de entrega (fraccionamiento)
            </label>
            <input
              value={homeAddress}
              onChange={(e) => setHomeAddress(e.target.value)}
              placeholder="Calle, número/lote, color de casa, referencias…"
              className="mt-1.5 w-full rounded-md border border-emerald-300 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400"
            />
            <p className="mt-1 text-[10px] text-emerald-700">
              Entregamos dentro del fraccionamiento. Tu domicilio se guarda en tu
              perfil para la próxima vez.
            </p>
          </div>
        ) : null}

        {/* Banner: ubicación del carrito bar seleccionado (si aplica) */}
        {selectedVenue?.type === "cart" && !isHomeDelivery && cartLocForSelected ? (
          <div className="border-b border-cyan-200 bg-cyan-50 px-3 py-2 text-[12px] text-cyan-900">
            {cartLocForSelected.currentHole != null ? (
              <div className="flex items-center justify-between gap-2">
                <span>
                  🚚 {cartLocForSelected.venueName} en{" "}
                  <strong>hoyo {cartLocForSelected.currentHole}</strong>
                  {cartLocForSelected.lastSeenAgoMin != null ? (
                    <span className="ml-1 text-cyan-700">
                      ({cartLocForSelected.lastSeenAgoMin === 0
                        ? "ahorita"
                        : `hace ${cartLocForSelected.lastSeenAgoMin} min`})
                    </span>
                  ) : null}
                </span>
                {cartLocForSelected.etaMinToMyHole != null &&
                cartLocForSelected.etaMinToMyHole > 0 ? (
                  <span className="rounded bg-cyan-700 px-2 py-0.5 font-bold text-white">
                    ~{cartLocForSelected.etaMinToMyHole} min a tu hoyo
                  </span>
                ) : cartLocForSelected.etaMinToMyHole === 0 ? (
                  <span className="rounded bg-emerald-700 px-2 py-0.5 font-bold text-white">
                    ¡está aquí!
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-cyan-700">
                🚚 {cartLocForSelected.venueName} sin ubicación reciente
              </span>
            )}
          </div>
        ) : null}

        {/* Banner: pedidos esperando MI confirmación de entrega */}
        {myOrders
          .filter((o) => o.status === "pending_acceptance")
          .map((o) => (
            <PendingAcceptanceBanner
              key={o.id}
              order={o}
              meEntryId={meEntryId}
              caddieId={caddieId}
              playerId={playerId}
              onResolved={() => void pullOrders()}
            />
          ))}

        {/* Favoritos del cliente (basado en historial) */}
        {favorites.length > 0 ? (
          <section className="border-b border-slate-200 bg-amber-50 px-3 pt-3 pb-2">
            <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
              🌟 Tus favoritos
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {favorites.map((fav) => {
                const inCart = cart.find((c) => c.menuItemId === fav.menuItem.id);
                const icon =
                  fav.menuItem.displayEmoji ??
                  iconForMenuItem(fav.menuItem.name, fav.categoryCode);
                const isPinned = fav.source === "pinned";
                return (
                  <div
                    key={fav.menuItem.id}
                    className={[
                      "relative flex w-[120px] shrink-0 flex-col items-center gap-1 rounded-lg border bg-white p-2 text-center",
                      inCart
                        ? "border-emerald-500 ring-2 ring-emerald-200"
                        : "border-amber-300",
                    ].join(" ")}
                  >
                    {/* Botón ✕ para ocultar este favorito */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isPinned) {
                          // Si está pinned, quitarlo del pin
                          void toggleFavorite(fav.menuItem.id, "unpin");
                        } else {
                          // Si es auto, ocultarlo
                          void toggleFavorite(fav.menuItem.id, "hide");
                        }
                      }}
                      className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white shadow hover:bg-red-600"
                      title={isPinned ? "Quitar del favoritos" : "Ocultar de favoritos"}
                    >
                      ✕
                    </button>

                    {/* Indicador ⭐ si está pinned */}
                    {isPinned ? (
                      <span
                        className="absolute -left-1 -top-1 z-10 text-[14px] drop-shadow"
                        title="Fijado manualmente"
                      >
                        ⭐
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        addToCart({
                          id: fav.menuItem.id,
                          name: fav.menuItem.name,
                          description: null,
                          priceCents: fav.menuItem.priceCents,
                          imageUrl: fav.menuItem.imageUrl,
                          prepMinutes: null,
                          displayEmoji: fav.menuItem.displayEmoji,
                        })
                      }
                      className="flex w-full flex-col items-center gap-1"
                      title={
                        isPinned
                          ? "Favorito fijado"
                          : `Pedido ${fav.timesOrdered}× antes`
                      }
                    >
                      {fav.menuItem.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fav.menuItem.imageUrl}
                          alt={fav.menuItem.name}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="text-3xl leading-none">{icon}</span>
                      )}
                      <span className="line-clamp-2 text-[11px] font-semibold text-slate-900">
                        {fav.menuItem.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-bold text-emerald-700">
                          {formatPrice(fav.menuItem.priceCents)}
                        </span>
                        {inCart ? (
                          <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                            {inCart.qty}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                            +
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500">
                        {isPinned
                          ? "fijado ⭐"
                          : `pedido ${fav.timesOrdered}×`}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

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
                        <div className="flex items-center gap-1.5">
                          {/* Botón ⭐ para fijar/quitar de favoritos */}
                          {hasIdentity ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleFavorite(
                                  it.id,
                                  pinnedIds.has(it.id) ? "unpin" : "pin"
                                )
                              }
                              className={[
                                "h-7 w-7 shrink-0 rounded-full border text-[14px] transition",
                                pinnedIds.has(it.id)
                                  ? "border-amber-400 bg-amber-50"
                                  : "border-slate-300 bg-white opacity-50 hover:opacity-100",
                              ].join(" ")}
                              title={
                                pinnedIds.has(it.id)
                                  ? "Quitar de favoritos"
                                  : "Fijar como favorito"
                              }
                            >
                              {pinnedIds.has(it.id) ? "⭐" : "☆"}
                            </button>
                          ) : null}
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
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {/* Mi ticket / cuenta del torneo */}
          {myOrders.length > 0 ? (
            <MiTicket
              orders={myOrders}
              accountCents={accountCents}
              onPayAccount={
                accountCents > 0
                  ? () => startCheckout({ pay_account: true })
                  : undefined
              }
            />
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
                    ? needsPrepay
                      ? "Abriendo pago…"
                      : "Enviando…"
                    : needsPrepay
                      ? `Pagar con tarjeta · ${formatPrice(cartTotalCents)}`
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
 * Mi ticket de consumos del torneo.
 * Lista todos los pedidos del cliente con su status, items y total.
 * El total grande arriba SOLO suma los confirmados (delivered).
 */
function MiTicket({
  orders,
  accountCents,
  onPayAccount,
}: {
  orders: MyOrder[];
  accountCents: number;
  onPayAccount?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Agrupar por status para resumen
  const counts = useMemo(() => {
    const c = { delivered: 0, pending: 0, disputed: 0, cancelled: 0 };
    for (const o of orders) {
      if (o.status === "delivered") c.delivered++;
      else if (o.status === "cancelled") c.cancelled++;
      else if (o.status === "disputed") c.disputed++;
      else c.pending++; // pending, accepted, preparing, ready, on_the_way, pending_acceptance
    }
    return c;
  }, [orders]);

  return (
    <section className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3 text-left"
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            🧾 Mi ticket del torneo
          </div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-slate-600">
            {counts.delivered > 0 ? (
              <span>{counts.delivered} por cobrar</span>
            ) : null}
            {counts.pending > 0 ? (
              <span className="text-amber-700">{counts.pending} en proceso</span>
            ) : null}
            {counts.disputed > 0 ? (
              <span className="text-red-700">{counts.disputed} en disputa</span>
            ) : null}
            {counts.cancelled > 0 ? (
              <span className="text-slate-400">{counts.cancelled} cancelados</span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-emerald-700">
            {formatPrice(accountCents)}
          </div>
          <div className="text-[10px] text-slate-500">
            {open ? "▲ ocultar" : "▼ ver detalle"}
          </div>
        </div>
      </button>

      {open ? (
        <ul className="divide-y divide-slate-100 text-[12px]">
          {orders.map((o) => {
            const isPending = ![
              "delivered",
              "cancelled",
              "disputed",
            ].includes(o.status);
            const isPorCobrar = o.status === "delivered";
            const isPagado = o.status === "paid";
            const isCancelled = o.status === "cancelled";
            const isDisputed = o.status === "disputed";
            const colorClass = isPagado
              ? "text-slate-600"
              : isPorCobrar
              ? "text-emerald-800"
              : isPending
                ? "text-amber-800"
                : isDisputed
                  ? "text-red-800"
                  : "text-slate-400 line-through";
            return (
              <li key={o.id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase ${colorClass}`}>
                    {isPagado
                      ? "✅ Pagado"
                      : isPorCobrar
                      ? "🧾 Por cobrar"
                      : isCancelled
                        ? "✕ Cancelado"
                        : isDisputed
                          ? "⚠ En disputa"
                          : ORDER_STATUS_LABELS[
                              o.status as keyof typeof ORDER_STATUS_LABELS
                            ] ?? o.status}
                    {o.requested_hole != null ? ` · Hoyo ${o.requested_hole}` : ""}
                  </span>
                  <span
                    className={[
                      "text-sm font-bold",
                      isCancelled ? "text-slate-400 line-through" : "text-slate-900",
                    ].join(" ")}
                  >
                    {formatPrice(o.total_cents)}
                  </span>
                </div>
                <ul className="mt-0.5 text-[11px] text-slate-600">
                  {o.fb_order_items.map((l) => (
                    <li key={l.id}>
                      {l.qty}× {l.item_name_snapshot}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          <li className="bg-emerald-50 px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase text-emerald-700">
                Total por cobrar
              </span>
              <span className="text-base font-bold text-emerald-700">
                {formatPrice(accountCents)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-emerald-700">
              Consumos que ya confirmaste. Los pedidos en proceso o en disputa no
              se han sumado todavía.
            </p>
            {onPayAccount && accountCents > 0 ? (
              <div className="mt-3">
                {payError ? (
                  <p className="mb-2 text-[11px] text-red-700">{payError}</p>
                ) : null}
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => {
                    setPayError(null);
                    setPaying(true);
                    void onPayAccount().catch((e: unknown) => {
                      setPayError(
                        e instanceof Error
                          ? e.message
                          : "No se pudo abrir el pago."
                      );
                      setPaying(false);
                    });
                  }}
                  className="w-full rounded-md bg-indigo-600 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {paying ? "Abriendo Stripe…" : "💳 Pagar con tarjeta"}
                </button>
              </div>
            ) : null}
          </li>
        </ul>
      ) : null}
    </section>
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
  playerId,
  onResolved,
}: {
  order: MyOrder;
  meEntryId: string | null;
  caddieId: string | null;
  playerId: string | null;
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
          player_id: playerId,
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
