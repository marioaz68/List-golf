"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderForClient } from "@/lib/fb/orderActions";
import { iconForCategory, iconForMenuItem } from "@/lib/fb/icons";
import { formatPrice, type FbCategory, type FbMenuItem, type FbVenue } from "@/lib/fb/types";
import type { ClientOption } from "./page";

interface MenuGroup {
  category: FbCategory;
  items: FbMenuItem[];
}

interface Props {
  venues: FbVenue[];
  menu: MenuGroup[];
  clients: ClientOption[];
}

interface CartLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  qty: number;
}

export default function NuevoPedidoClient({ venues, menu, clients }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>(
    venues[0]?.id ?? ""
  );
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
                              "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[12px]",
                              inCart ? "border-emerald-400 bg-emerald-50" : "border-slate-200",
                            ].join(" ")}
                          >
                            <span className="truncate">
                              <span className="mr-1">{ic}</span>
                              {it.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold text-emerald-700">
                                {formatPrice(it.priceCents)}
                              </span>
                              {inCart ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => decOne(it.id)}
                                    className="h-6 w-6 rounded-full border border-slate-300 text-[12px] font-bold"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[14px] text-center text-[11px] font-bold">
                                    {inCart.qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addOne(it)}
                                    className="h-6 w-6 rounded-full border border-emerald-500 bg-white text-[12px] font-bold text-emerald-700"
                                  >
                                    +
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addOne(it)}
                                  className="rounded-md border border-emerald-500 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                                >
                                  +
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
