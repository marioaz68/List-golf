"use client";

import { useMemo, useState, useTransition } from "react";
import { formatPrice } from "@/lib/fb/types";
import type { FbMenuItem, FbCategory } from "@/lib/fb/types";

interface Props {
  tableCode: string;
  tableName: string | null;
  venueName: string;
  categories: FbCategory[];
  items: FbMenuItem[];
}

interface Line {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  qty: number;
  notes: string;
}

export default function MesaComensal({
  tableCode,
  tableName,
  venueName,
  categories,
  items,
}: Props) {
  const [dinerName, setDinerName] = useState("");
  const [filter, setFilter] = useState("");
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sentOk, setSentOk] = useState(false);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (f) return items.filter((it) => it.name.toLowerCase().includes(f)).slice(0, 40);
    if (activeCat) return items.filter((it) => it.categoryId === activeCat);
    return items;
  }, [items, filter, activeCat]);

  function add(it: FbMenuItem) {
    setLines((cur) => {
      const idx = cur.findIndex((l) => l.menuItemId === it.id);
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

  function inc(menuItemId: string, delta: number) {
    setLines((cur) =>
      cur
        .map((l) =>
          l.menuItemId === menuItemId
            ? { ...l, qty: Math.max(0, l.qty + delta) }
            : l
        )
        .filter((l) => l.qty > 0)
    );
  }

  function setNote(menuItemId: string, note: string) {
    setLines((cur) =>
      cur.map((l) => (l.menuItemId === menuItemId ? { ...l, notes: note } : l))
    );
  }

  const total = lines.reduce((a, b) => a + b.unitPriceCents * b.qty, 0);
  const itemCount = lines.reduce((a, b) => a + b.qty, 0);

  function submit() {
    if (lines.length === 0) return;
    if (!dinerName.trim()) {
      alert("Escribe tu nombre para que el mesero sepa quién pidió.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/mesa/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tableCode,
          dinerName: dinerName.trim(),
          items: lines.map((l) => ({
            menuItemId: l.menuItemId,
            qty: l.qty,
            notes: l.notes.trim() || null,
          })),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setSentOk(true);
        setLines([]);
        setShowCheckout(false);
      } else {
        alert(`Error: ${json.error}`);
      }
    });
  }

  if (sentOk) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow ring-1 ring-slate-200">
          <div className="text-5xl">🍽️</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            ¡Pedido recibido!
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            El mesero va a confirmar tu pedido en un momento. Pronto llega tu
            comida a la mesa <strong>{tableCode}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setSentOk(false)}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
          >
            Pedir algo más
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <h1 className="text-base font-bold text-slate-900">
          🍽️ {venueName}
        </h1>
        <p className="text-[11px] text-slate-600">
          Mesa <strong>{tableCode}</strong>
          {tableName && tableName !== tableCode ? ` · ${tableName}` : ""}
        </p>
        {!dinerName ? (
          <input
            type="text"
            value={dinerName}
            onChange={(e) => setDinerName(e.target.value)}
            placeholder="Tu nombre (para que el mesero sepa quién pidió)"
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        ) : (
          <div className="mt-1 text-[11px] text-emerald-700">
            👤 {dinerName}{" "}
            <button
              type="button"
              onClick={() => setDinerName("")}
              className="ml-1 text-slate-500 underline"
            >
              cambiar
            </button>
          </div>
        )}
      </header>

      {/* Búsqueda + cats */}
      <section className="mx-3 mt-3 space-y-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 Buscar"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        {!filter ? (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                className={[
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                  c.id === activeCat
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-300",
                ].join(" ")}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* Catálogo */}
      <section className="mx-3 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((it) => {
          const line = lines.find((l) => l.menuItemId === it.id);
          return (
            <div
              key={it.id}
              className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200"
            >
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageUrl}
                  alt={it.name}
                  className="h-24 w-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-full items-center justify-center bg-slate-100 text-4xl">
                  {it.displayEmoji ?? "🍽️"}
                </div>
              )}
              <div className="p-2">
                <div className="line-clamp-2 text-[12px] font-bold text-slate-900">
                  {it.name}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-emerald-700">
                  {formatPrice(it.priceCents)}
                </div>
                {line ? (
                  <div className="mt-1.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => inc(it.id, -1)}
                      className="h-7 w-7 rounded-full bg-slate-200 text-base font-bold"
                    >
                      −
                    </button>
                    <span className="text-sm font-bold">{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => inc(it.id, +1)}
                      className="h-7 w-7 rounded-full bg-emerald-600 text-base font-bold text-white"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => add(it)}
                    className="mt-1.5 w-full rounded-md bg-indigo-600 py-1.5 text-[12px] font-bold text-white"
                  >
                    Agregar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Barra inferior con total */}
      {itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-3 py-2 shadow-2xl">
          <button
            type="button"
            onClick={() => setShowCheckout(true)}
            className="w-full rounded-md bg-emerald-600 py-3 text-sm font-bold text-white"
          >
            Ver mi pedido · {itemCount}{" "}
            {itemCount === 1 ? "item" : "items"} · {formatPrice(total)}
          </button>
        </div>
      ) : null}

      {/* Checkout sheet */}
      {showCheckout ? (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/50"
          onClick={() => setShowCheckout(false)}
        >
          <div
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">Tu pedido</h2>
            <p className="text-[11px] text-slate-500">
              Mesa {tableCode} · El mesero te lo confirmará en unos segundos.
            </p>

            <ul className="mt-3 space-y-2">
              {lines.map((l) => (
                <li
                  key={l.menuItemId}
                  className="rounded border border-slate-200 bg-slate-50 p-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">
                        {l.name}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {formatPrice(l.unitPriceCents)} c/u
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => inc(l.menuItemId, -1)}
                        className="h-7 w-7 rounded-full bg-slate-200 text-base font-bold"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-bold">
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => inc(l.menuItemId, +1)}
                        className="h-7 w-7 rounded-full bg-emerald-600 text-base font-bold text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={l.notes}
                    onChange={(e) => setNote(l.menuItemId, e.target.value)}
                    placeholder="Nota (alergias, término…)"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px]"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-700">Total</span>
              <span className="text-lg font-bold text-emerald-700">
                {formatPrice(total)}
              </span>
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="mt-3 w-full rounded-md bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              ✈ Mandar pedido al mesero
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              El cobro se hace al final con el mesero (efectivo / tarjeta / a tu
              cuenta de socio).
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
