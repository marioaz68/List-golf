"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderForClient } from "@/lib/fb/orderActions";
import { iconForCategory, iconForMenuItem } from "@/lib/fb/icons";
import { formatPrice, type FbCategory, type FbMenuItem, type FbVenue } from "@/lib/fb/types";
import type { NearbyClient } from "@/lib/fb/nearbyClients";
import type { ClientOption } from "./page";

interface MenuGroup {
  category: FbCategory;
  items: FbMenuItem[];
}

interface NearbyMeta {
  venueCode: string;
  cartLocated: boolean;
  cartHole: number | null;
  cartLastSeenAgoMin: number | null;
}

interface Props {
  venues: FbVenue[];
  menu: MenuGroup[];
  clients: ClientOption[];
  nearby?: NearbyClient[];
  nearbyMeta?: NearbyMeta | null;
  defaultVenueCode?: string | null;
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

interface CartLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  qty: number;
}

export default function NuevoPedidoClient({
  venues,
  menu,
  clients,
  nearby = [],
  nearbyMeta = null,
  defaultVenueCode = null,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>(
    // Preseleccionar venue del URL si vino (?venue=cart_front)
    (defaultVenueCode &&
      venues.find((v) => v.code === defaultVenueCode)?.id) ||
      venues[0]?.id ||
      ""
  );

  // Si vino con ?venue=XXX (operador del carrito), refrescar la lista de
  // cercanos cada 20s para ver clientes que se acaban de acercar.
  useEffect(() => {
    if (!nearbyMeta?.venueCode) return;
    const id = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(id);
  }, [nearbyMeta?.venueCode, router]);

  // Favoritos del cliente seleccionado para el venue activo
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  useEffect(() => {
    if (!selectedClient || !selectedVenueId) {
      setFavorites([]);
      return;
    }
    const idParam = selectedClient.kind === "player" ? "entry_id" : "caddie_id";
    const url = `/api/captura/fb-favorites?${idParam}=${encodeURIComponent(selectedClient.id)}&venue_id=${encodeURIComponent(selectedVenueId)}`;
    let cancelled = false;
    setFavoritesLoading(true);
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok: boolean; favorites?: FavoriteItem[] }) => {
        if (cancelled) return;
        setFavorites(j.ok ? j.favorites ?? [] : []);
      })
      .catch(() => {
        if (!cancelled) setFavorites([]);
      })
      .finally(() => {
        if (!cancelled) setFavoritesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClient, selectedVenueId]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [requestedHole, setRequestedHole] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [alreadyDelivered, setAlreadyDelivered] = useState(true);
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    const f = clientSearch.toLowerCase().trim();
    if (!f) return clients.slice(0, 30);
    return clients.filter((c) => c.name.toLowerCase().includes(f)).slice(0, 30);
  }, [clientSearch, clients]);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) ?? null,
    [venues, selectedVenueId]
  );

  // Filtrar items por venue
  const filteredMenu = useMemo(() => {
    if (!selectedVenueId) return menu;
    return menu
      .map((g) => ({
        ...g,
        items: g.items.filter((it) =>
          it.availableVenueIds.includes(selectedVenueId)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [menu, selectedVenueId]);

  const totalCents = cart.reduce((acc, l) => acc + l.priceCents * l.qty, 0);

  function addOne(item: FbMenuItem) {
    setCart((cur) => {
      const idx = cur.findIndex((c) => c.menuItemId === item.id);
      if (idx >= 0) {
        const next = cur.slice();
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...cur,
        { menuItemId: item.id, name: item.name, priceCents: item.priceCents, qty: 1 },
      ];
    });
  }
  function decOne(menuItemId: string) {
    setCart((cur) => {
      const idx = cur.findIndex((c) => c.menuItemId === menuItemId);
      if (idx < 0) return cur;
      const next = cur.slice();
      if (next[idx].qty <= 1) next.splice(idx, 1);
      else next[idx] = { ...next[idx], qty: next[idx].qty - 1 };
      return next;
    });
  }

  function submit() {
    setErrorMsg(null);
    if (!selectedClient) {
      setErrorMsg("Selecciona un cliente.");
      setStep(1);
      return;
    }
    if (!selectedVenue) {
      setErrorMsg("Selecciona un venue.");
      setStep(2);
      return;
    }
    if (cart.length === 0) {
      setErrorMsg("Agrega items al pedido.");
      setStep(2);
      return;
    }
    const deliveryType: "pickup" | "on_course" =
      selectedVenue.type === "cart" ? "on_course" : "pickup";
    const reqHole = requestedHole ? Number(requestedHole) : null;

    startTransition(async () => {
      const r = await createOrderForClient({
        entryId: selectedClient.kind === "player" ? selectedClient.id : null,
        caddieId: selectedClient.kind === "caddie" ? selectedClient.id : null,
        venueId: selectedVenue.id,
        deliveryType,
        requestedHole: reqHole,
        notes: notes || null,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })),
        alreadyDelivered,
      });
      if (!r.ok) {
        setErrorMsg(r.error ?? "Error.");
        return;
      }
      alert(
        `✅ Pedido creado por ${formatPrice(r.total ?? 0)}.\n${
          alreadyDelivered
            ? "El cliente recibirá un banner en su Mini App para confirmar el cargo."
            : "El pedido entró a cocina para preparar."
        }`
      );
      router.push("/fb-cocina");
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">
            + Nuevo pedido manual
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Para cuando el cliente pide verbalmente. El cliente recibirá un
            aviso en su Mini App para confirmar el cargo antes de cobrarse.
          </p>
        </header>

        {/* Stepper */}
        <div className="mb-4 flex gap-2 rounded-lg bg-white p-2 shadow-sm">
          {[
            { n: 1, label: "1. Cliente", done: !!selectedClient },
            { n: 2, label: "2. Venue + items", done: cart.length > 0 },
            { n: 3, label: "3. Confirmar", done: false },
          ].map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n as 1 | 2 | 3)}
              className={[
                "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition",
                step === s.n
                  ? "bg-emerald-600 text-white"
                  : s.done
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {s.done ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>

        {step === 1 ? (
          <section className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              ¿Quién es el cliente?
            </h2>

            {/* Sección: cercanos al carrito (si el GPS del carrito está activo) */}
            {nearbyMeta ? (
              <NearbySection
                nearby={nearby}
                meta={nearbyMeta}
                selectedKey={selectedClient?.key ?? null}
                onPick={(n) => {
                  const c = clients.find((c) => c.key === n.key);
                  if (c) {
                    setSelectedClient(c);
                    setStep(2);
                  } else {
                    // Si el cliente cercano no está en la lista pre-cargada
                    // (puede pasar si llegó hace muy poco), lo creamos al vuelo
                    setSelectedClient({
                      key: n.key,
                      kind: n.kind,
                      id: (n.entryId ?? n.caddieId) as string,
                      name: n.name,
                      tournamentName: n.tournamentName,
                      groupNo: n.groupNo,
                    });
                    setStep(2);
                  }
                }}
              />
            ) : null}

            <input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="max-h-[400px] space-y-1 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Sin resultados
                </div>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setSelectedClient(c);
                      setStep(2);
                    }}
                    className={[
                      "flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-slate-50",
                      selectedClient?.key === c.key
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200",
                    ].join(" ")}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                          {c.kind === "player" ? "🏌️ Jugador" : "🎒 Caddie"}
                        </span>
                        <span className="font-semibold">{c.name}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {c.tournamentName}
                        {c.groupNo != null ? ` · Grupo ${c.groupNo}` : ""}
                      </div>
                    </div>
                    {selectedClient?.key === c.key ? (
                      <span className="text-emerald-700">✓</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Cliente seleccionado
              </p>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {selectedClient?.name}{" "}
                  <span className="text-xs text-slate-500">
                    ({selectedClient?.kind === "player" ? "Jugador" : "Caddie"})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-500 underline"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Venue de entrega
              </p>
              <div className="flex flex-wrap gap-2">
                {venues.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setSelectedVenueId(v.id);
                      setCart([]);
                    }}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                      selectedVenueId === v.id
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 bg-white text-slate-600",
                    ].join(" ")}
                  >
                    {v.type === "restaurant" ? "🏠 " : "🚚 "}
                    {v.name}
                  </button>
                ))}
              </div>
              {selectedVenue?.type === "cart" ? (
                <div className="mt-3">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Hoyo de entrega (opcional, si lo sabes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    value={requestedHole}
                    onChange={(e) => setRequestedHole(e.target.value)}
                    placeholder={
                      selectedVenue.holeRangeStart && selectedVenue.holeRangeEnd
                        ? `Ej. ${selectedVenue.holeRangeStart}-${selectedVenue.holeRangeEnd}`
                        : "1-18"
                    }
                    className="mt-1 w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
              ) : null}
            </div>

            {/* Favoritos del cliente (lo que más pide) */}
            {favorites.length > 0 ? (
              <FavoritesSection
                favorites={favorites}
                clientName={selectedClient?.name ?? ""}
                cart={cart}
                onAdd={(it) =>
                  addOne({
                    id: it.menuItem.id,
                    name: it.menuItem.name,
                    priceCents: it.menuItem.priceCents,
                  } as FbMenuItem)
                }
                onDec={(it) => decOne(it.menuItem.id)}
              />
            ) : favoritesLoading ? (
              <div className="rounded-lg bg-amber-50 p-2 text-center text-[11px] text-amber-700">
                Cargando favoritos de {selectedClient?.name}…
              </div>
            ) : selectedClient ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2 text-center text-[11px] text-slate-500">
                ⭐ {selectedClient.name} aún no tiene historial de pedidos
              </div>
            ) : null}

            <div className="rounded-lg bg-white p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Items disponibles en {selectedVenue?.name}
              </p>
              {filteredMenu.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  No hay items disponibles en este venue.
                </div>
              ) : (
                filteredMenu.map((g) => (
                  <div key={g.category.id} className="mt-3 first:mt-0">
                    <h3 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>{iconForCategory(g.category.code)}</span>
                      {g.category.name}
                    </h3>
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {g.items.map((it) => {
                        const inCart = cart.find((c) => c.menuItemId === it.id);
                        const ic =
                          it.displayEmoji ??
                          iconForMenuItem(it.name, g.category.code);
                        return (
                          <div
                            key={it.id}
                            className={[
                              "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5",
                              inCart ? "border-emerald-400 bg-emerald-50" : "border-slate-200",
                            ].join(" ")}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-1.5">
                              <span className="shrink-0 text-base leading-tight">{ic}</span>
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-[12px] font-semibold text-slate-800">
                                  {it.name}
                                </div>
                                <div className="text-[11px] font-bold text-emerald-700">
                                  {formatPrice(it.priceCents)}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {inCart ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => decOne(it.id)}
                                    className="h-7 w-7 rounded-full border border-slate-300 text-base font-bold"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[18px] text-center text-sm font-bold">
                                    {inCart.qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addOne(it)}
                                    className="h-7 w-7 rounded-full border border-emerald-500 bg-white text-base font-bold text-emerald-700"
                                  >
                                    +
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addOne(it)}
                                  className="rounded-md border border-emerald-500 bg-white px-3 py-1 text-xs font-bold text-emerald-700"
                                >
                                  + Agregar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 ? (
              <div className="sticky bottom-0 rounded-lg bg-emerald-600 p-3 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {cart.reduce((s, l) => s + l.qty, 0)} items ·{" "}
                    {formatPrice(totalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="rounded-md bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Confirmar pedido
            </h2>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Cliente</div>
              <div className="font-semibold">{selectedClient?.name}</div>

              <div className="mt-2 text-xs text-slate-500">Venue</div>
              <div className="font-semibold">{selectedVenue?.name}</div>
              {requestedHole ? (
                <div className="text-xs text-slate-500">
                  Hoyo de entrega: {requestedHole}
                </div>
              ) : null}

              <div className="mt-2 text-xs text-slate-500">Items</div>
              <ul className="text-sm">
                {cart.map((l) => (
                  <li
                    key={l.menuItemId}
                    className="flex items-baseline justify-between"
                  >
                    <span>
                      {l.qty}× {l.name}
                    </span>
                    <span className="font-semibold">
                      {formatPrice(l.priceCents * l.qty)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-bold uppercase text-slate-500">
                  Total
                </span>
                <span className="text-lg font-bold text-emerald-700">
                  {formatPrice(totalCents)}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[11px] font-semibold text-slate-600">
                Notas (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ej. sin hielo, para el pasajero del carrito..."
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>

            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alreadyDelivered}
                  onChange={(e) => setAlreadyDelivered(e.target.checked)}
                  className="mt-0.5 h-5 w-5"
                />
                <span className="text-sm text-amber-900">
                  <strong>Ya entregado</strong> al cliente — el cliente recibirá
                  el banner amarillo para confirmar / disputar.
                  <br />
                  <span className="text-xs">
                    Si lo dejas <strong>desactivado</strong>, el pedido entra a
                    cocina como nuevo y sigue el flujo normal.
                  </span>
                </span>
              </label>
            </div>

            {errorMsg ? (
              <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                {errorMsg}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                ← Atrás
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="rounded-md bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "Creando..." : `✅ Crear pedido (${formatPrice(totalCents)})`}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Sección "📍 Cerca del carrito" — solo si vino ?venue=XXX
// ============================================================
function NearbySection({
  nearby,
  meta,
  selectedKey,
  onPick,
}: {
  nearby: NearbyClient[];
  meta: NearbyMeta;
  selectedKey: string | null;
  onPick: (n: NearbyClient) => void;
}) {
  // Sin GPS del carrito → mensaje sutil
  if (!meta.cartLocated) {
    return (
      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
        📡 El GPS del carrito no está activo o aún no manda señal. Activa el chip
        GPS en tu Mini App del carrito para ver clientes cerca de ti automáticamente.
      </div>
    );
  }

  // Carrito ubicado pero nadie cerca
  if (nearby.length === 0) {
    return (
      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
        📍 Nadie con GPS activo cerca del carrito en este momento
        {meta.cartHole != null ? ` (carrito en hoyo ${meta.cartHole})` : ""}.
        Búscalo por nombre abajo.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold text-emerald-800">
          📍 Cerca del carrito
        </h3>
        <span className="text-[10px] text-emerald-700">
          {meta.cartHole != null ? `Hoyo ${meta.cartHole} · ` : ""}
          {nearby.length} {nearby.length === 1 ? "cliente" : "clientes"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {nearby.map((n) => {
          const isSelected = selectedKey === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => onPick(n)}
              className={[
                "flex items-center justify-between gap-2 rounded-md border bg-white p-2 text-left transition",
                isSelected
                  ? "border-emerald-600 ring-2 ring-emerald-400"
                  : "border-emerald-200 hover:border-emerald-400 active:bg-emerald-50",
              ].join(" ")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base leading-none">
                    {n.kind === "player" ? "🏌️" : "🎒"}
                  </span>
                  <span className="truncate text-[13px] font-bold text-slate-900">
                    {n.name}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {n.distanceMeters < 50
                    ? `📍 ~${n.distanceMeters}m (a tu lado)`
                    : `📍 ~${n.distanceMeters}m`}
                  {n.currentHole != null ? ` · hoyo ${n.currentHole}` : ""}
                  {n.groupNo != null ? ` · grupo ${n.groupNo}` : ""}
                  {n.lastSeenAgoMin > 1
                    ? ` · hace ${n.lastSeenAgoMin}m`
                    : ""}
                </div>
              </div>
              <span className="shrink-0 text-lg text-emerald-600">→</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[9px] text-emerald-700">
        Toca a un cliente para crear pedido al instante · refresco cada 20s
      </p>
    </div>
  );
}

// ============================================================
// Sección "⭐ Favoritos de <cliente>"
// ============================================================
function FavoritesSection({
  favorites,
  clientName,
  cart,
  onAdd,
  onDec,
}: {
  favorites: FavoriteItem[];
  clientName: string;
  cart: CartLine[];
  onAdd: (f: FavoriteItem) => void;
  onDec: (f: FavoriteItem) => void;
}) {
  const cartByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cart) map.set(c.menuItemId, c.qty);
    return map;
  }, [cart]);

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold text-amber-800">
          ⭐ Lo que más pide {clientName}
        </h3>
        <span className="text-[9px] text-amber-700">
          Toca para agregar al pedido
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {favorites.map((f) => {
          const inCart = cartByItem.get(f.menuItem.id) ?? 0;
          return (
            <div
              key={f.menuItem.id}
              className={[
                "flex items-center justify-between gap-2 rounded-md border bg-white p-2",
                inCart > 0
                  ? "border-emerald-400 ring-2 ring-emerald-200"
                  : "border-amber-200",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onAdd(f)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="shrink-0 text-2xl leading-none">
                  {f.menuItem.displayEmoji ?? "🍽️"}
                </span>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[12px] font-bold text-slate-900">
                    {f.menuItem.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {formatPrice(f.menuItem.priceCents)} ·{" "}
                    {f.source === "pinned" ? (
                      <span className="text-amber-700">📌 Fijado</span>
                    ) : (
                      <span>
                        Pedido {f.timesOrdered}{" "}
                        {f.timesOrdered === 1 ? "vez" : "veces"}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {inCart > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onDec(f)}
                      className="h-7 w-7 rounded-full border border-slate-300 text-base font-bold"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center text-sm font-bold">
                      {inCart}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAdd(f)}
                      className="h-7 w-7 rounded-full border border-emerald-500 bg-white text-base font-bold text-emerald-700"
                    >
                      +
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(f)}
                    className="rounded-md border border-emerald-500 bg-white px-3 py-1 text-xs font-bold text-emerald-700"
                  >
                    + Agregar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
