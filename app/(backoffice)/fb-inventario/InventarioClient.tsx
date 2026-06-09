"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/fb/types";
import type { InventoryItem, VenueInventory } from "./page";

interface Props {
  venues: VenueInventory[];
}

export default function InventarioClient({ venues: initial }: Props) {
  const router = useRouter();
  const [venues, setVenues] = useState(initial);
  const [activeVenueId, setActiveVenueId] = useState<string>(
    initial[0]?.id ?? ""
  );
  const [filter, setFilter] = useState("");
  const [bulkN, setBulkN] = useState<number>(10);

  // Auto-refresh cada 30s para ver stock actualizado por entregas
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(id);
  }, [router]);

  // Resumen global (sumando todos los venues)
  const totals = useMemo(() => {
    let out = 0;
    let low = 0;
    for (const v of venues) {
      out += v.outOfStockCount;
      low += v.lowStockCount;
    }
    return { out, low };
  }, [venues]);

  // Lista plana de items críticos de TODOS los venues para el panel arriba
  const critical = useMemo(() => {
    const rows: Array<{ venue: VenueInventory; item: InventoryItem }> = [];
    for (const v of venues) {
      for (const it of v.items) {
        if (it.isInfinite) continue;
        if (it.qtyAvailable === 0 || it.qtyAvailable <= it.lowThreshold) {
          rows.push({ venue: v, item: it });
        }
      }
    }
    rows.sort((a, b) => a.item.qtyAvailable - b.item.qtyAvailable);
    return rows;
  }, [venues]);

  const activeVenue = useMemo(
    () => venues.find((v) => v.id === activeVenueId) ?? venues[0] ?? null,
    [venues, activeVenueId]
  );

  const filteredItems = useMemo(() => {
    if (!activeVenue) return [];
    if (!filter) return activeVenue.items;
    const f = filter.toLowerCase();
    return activeVenue.items.filter((it) =>
      it.name.toLowerCase().includes(f)
    );
  }, [activeVenue, filter]);

  async function callStock(
    venueId: string,
    menuItemId: string,
    action: "set" | "inc" | "dec" | "remove",
    qty?: number
  ) {
    const res = await fetch("/api/captura/cart-stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venue_id: venueId, menu_item_id: menuItemId, action, qty }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      qtyAvailable?: number;
      removed?: boolean;
      error?: string;
    };
    if (!json.ok) {
      alert(`Error: ${json.error}`);
      return;
    }
    // Optimista: actualizar venues localmente
    setVenues((cur) =>
      cur.map((v) => {
        if (v.id !== venueId) return v;
        return {
          ...v,
          items: v.items.map((it) => {
            if (it.menuItemId !== menuItemId) return it;
            if (json.removed) {
              return { ...it, qtyAvailable: 0, isInfinite: true };
            }
            return {
              ...it,
              qtyAvailable: json.qtyAvailable ?? it.qtyAvailable,
              isInfinite: false,
            };
          }),
        };
      })
    );
    // Refresh server-side para recalcular contadores out/low
    setTimeout(() => router.refresh(), 300);
  }

  if (!activeVenue) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">Sin venues activos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">📦 Inventario F&B</h1>
            <p className="text-[11px] text-slate-500">
              Stock por venue · auto-descuento al entregar · alertas en tiempo real
            </p>
          </div>
          <Link
            href="/fb-admin"
            className="text-[11px] font-semibold text-slate-600 underline"
          >
            ← F&B Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {/* Resumen global */}
        <section className="grid grid-cols-2 gap-3">
          <div
            className={[
              "rounded-lg p-3 ring-1",
              totals.out > 0
                ? "bg-red-50 ring-red-200 animate-pulse"
                : "bg-slate-50 ring-slate-200",
            ].join(" ")}
          >
            <div className="text-[10px] font-bold uppercase text-red-700">
              Sin stock
            </div>
            <div className="text-3xl font-bold text-red-700">
              {totals.out}
            </div>
            <div className="text-[10px] text-red-600">
              {totals.out > 0
                ? "items se redirigen al restaurante"
                : "todo abastecido"}
            </div>
          </div>
          <div
            className={[
              "rounded-lg p-3 ring-1",
              totals.low > 0
                ? "bg-amber-50 ring-amber-200"
                : "bg-slate-50 ring-slate-200",
            ].join(" ")}
          >
            <div className="text-[10px] font-bold uppercase text-amber-700">
              Stock bajo
            </div>
            <div className="text-3xl font-bold text-amber-700">
              {totals.low}
            </div>
            <div className="text-[10px] text-amber-600">
              items por debajo del umbral
            </div>
          </div>
        </section>

        {/* Panel de alertas críticas */}
        {critical.length > 0 ? (
          <section className="rounded-lg border-2 border-red-300 bg-white p-3 shadow">
            <h2 className="text-sm font-bold text-red-700">
              🚨 Atención · Items críticos en piso
            </h2>
            <div className="mt-2 space-y-1">
              {critical.slice(0, 15).map(({ venue, item }) => (
                <CriticalRow
                  key={`${venue.id}::${item.menuItemId}`}
                  venue={venue}
                  item={item}
                  onReplenish={(n) =>
                    callStock(venue.id, item.menuItemId, "inc", n)
                  }
                />
              ))}
              {critical.length > 15 ? (
                <p className="pt-1 text-center text-[10px] text-slate-500">
                  …y {critical.length - 15} más
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Tabs de venue */}
        <section>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {venues.map((v) => {
              const isActive = v.id === activeVenueId;
              const hasAlerts = v.outOfStockCount + v.lowStockCount > 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveVenueId(v.id)}
                  className={[
                    "shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-bold",
                    isActive
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700",
                    hasAlerts && !isActive ? "ring-1 ring-red-300" : "",
                  ].join(" ")}
                >
                  {v.type === "cart" ? "🚚" : "🍽️"} {v.name}
                  {hasAlerts ? (
                    <span
                      className={[
                        "ml-1 inline-block min-w-[1.25rem] rounded-full px-1 text-[10px]",
                        isActive
                          ? "bg-white text-indigo-700"
                          : "bg-red-600 text-white",
                      ].join(" ")}
                    >
                      {v.outOfStockCount + v.lowStockCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* Editor del venue activo */}
        <section className="rounded-lg bg-white p-3 shadow ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              {activeVenue.type === "cart" ? "🚚" : "🍽️"} {activeVenue.name}
            </h3>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {activeVenue.items.length} items
            </span>
            <span className="ml-auto text-[10px] text-slate-500">
              Sin fila = stock infinito (cocina al momento)
            </span>
          </div>

          {/* Reabastecimiento masivo */}
          {activeVenue.type === "cart" ? (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 p-2 ring-1 ring-emerald-200">
              <span className="text-[11px] font-bold text-emerald-800">
                ⚡ Reabastecimiento rápido:
              </span>
              <input
                type="number"
                min="1"
                value={bulkN}
                onChange={(e) => setBulkN(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-center text-[12px]"
              />
              <span className="text-[10px] text-emerald-700">
                = botones +N abajo
              </span>
            </div>
          ) : null}

          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Buscar item…"
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />

          <div className="mt-3 space-y-1.5">
            {filteredItems.map((it) => (
              <InventoryRow
                key={it.menuItemId}
                item={it}
                bulkN={bulkN}
                onSet={(n) =>
                  callStock(activeVenue.id, it.menuItemId, "set", n)
                }
                onInc={(n) =>
                  callStock(activeVenue.id, it.menuItemId, "inc", n)
                }
                onDec={(n) =>
                  callStock(activeVenue.id, it.menuItemId, "dec", n)
                }
                onRemove={() =>
                  callStock(activeVenue.id, it.menuItemId, "remove")
                }
              />
            ))}
            {filteredItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                Sin items
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function CriticalRow({
  venue,
  item,
  onReplenish,
}: {
  venue: VenueInventory;
  item: InventoryItem;
  onReplenish: (n: number) => void;
}) {
  const isOut = item.qtyAvailable === 0;
  return (
    <div
      className={[
        "flex items-center justify-between gap-2 rounded px-2 py-1.5",
        isOut ? "bg-red-100" : "bg-amber-100",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base">{item.emoji ?? "🍽️"}</span>
          <span className="truncate text-[12px] font-bold text-slate-900">
            {item.name}
          </span>
        </div>
        <div className="text-[10px] text-slate-700">
          {venue.type === "cart" ? "🚚" : "🍽️"} {venue.name} ·{" "}
          {isOut
            ? "🚫 SIN STOCK (pedidos van al restaurante)"
            : `⚠ quedan ${item.qtyAvailable} (umbral ${item.lowThreshold})`}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onReplenish(5)}
          className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
        >
          +5
        </button>
        <button
          type="button"
          onClick={() => onReplenish(10)}
          className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white"
        >
          +10
        </button>
      </div>
    </div>
  );
}

function InventoryRow({
  item,
  bulkN,
  onSet,
  onInc,
  onDec,
  onRemove,
}: {
  item: InventoryItem;
  bulkN: number;
  onSet: (n: number) => void;
  onInc: (n: number) => void;
  onDec: (n: number) => void;
  onRemove: () => void;
}) {
  const isOut = !item.isInfinite && item.qtyAvailable === 0;
  const isLow =
    !item.isInfinite &&
    item.qtyAvailable > 0 &&
    item.qtyAvailable <= item.lowThreshold;

  return (
    <div
      className={[
        "flex items-center justify-between gap-2 rounded-md border bg-white p-2",
        isOut
          ? "border-red-400"
          : isLow
            ? "border-amber-400"
            : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-10 w-10 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-xl">
            {item.emoji ?? "🍽️"}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[12px] font-bold text-slate-900">
            {item.name}
          </div>
          <div className="text-[10px] text-slate-500">
            {formatPrice(item.priceCents)} ·{" "}
            {item.isInfinite ? (
              <span className="text-emerald-600">∞ stock infinito</span>
            ) : isOut ? (
              <span className="font-bold text-red-700">🚫 sin stock</span>
            ) : isLow ? (
              <span className="font-bold text-amber-700">
                ⚠ {item.qtyAvailable} (bajo)
              </span>
            ) : (
              <span>{item.qtyAvailable} disponibles</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onInc(bulkN)}
          className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
          title={`+${bulkN}`}
        >
          +{bulkN}
        </button>
        <button
          type="button"
          onClick={() => onDec(1)}
          disabled={item.isInfinite || item.qtyAvailable === 0}
          className="h-7 w-7 rounded border border-slate-300 bg-slate-100 text-base font-bold disabled:opacity-30"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          value={item.isInfinite ? "" : item.qtyAvailable}
          placeholder="∞"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0) onSet(v);
          }}
          className="h-7 w-14 rounded border border-slate-300 text-center text-sm font-bold"
        />
        <button
          type="button"
          onClick={() => onInc(1)}
          className="h-7 w-7 rounded border border-emerald-300 bg-emerald-50 text-base font-bold text-emerald-700"
        >
          +
        </button>
        {!item.isInfinite ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 text-[10px] text-slate-400 underline"
            title="Volver a stock infinito (quitar fila)"
          >
            ∞
          </button>
        ) : null}
      </div>
    </div>
  );
}
