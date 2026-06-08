"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { setMenuItemEmoji } from "@/lib/fb/actions";
import { iconForCategory, iconForMenuItem } from "@/lib/fb/icons";
import {
  formatPrice,
  type FbCategory,
  type FbMenuItem,
  type FbVenue,
} from "@/lib/fb/types";

type Choice = "specific" | "category" | "custom";

interface Props {
  venues: FbVenue[];
  categories: FbCategory[];
  items: FbMenuItem[];
}

export default function EmojiReviewClient({
  venues: _venues,
  categories,
  items: initialItems,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [onlyActive, setOnlyActive] = useState(true);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (onlyActive && !it.isActive) return false;
      if (categoryFilter && it.categoryId !== categoryFilter) return false;
      if (filter) {
        const f = filter.toLowerCase();
        if (!it.name.toLowerCase().includes(f)) return false;
      }
      return true;
    });
  }, [items, filter, categoryFilter, onlyActive]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, FbMenuItem[]>();
    for (const it of filtered) {
      const arr = byCat.get(it.categoryId) ?? [];
      arr.push(it);
      byCat.set(it.categoryId, arr);
    }
    return [...categories]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({ category: c, items: byCat.get(c.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, categories]);

  const totalDecided = items.filter((it) => it.displayEmoji != null).length;
  const totalActive = items.filter((it) => it.isActive).length;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Revisor de emojis del menú
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Por cada item elige: <strong>específico</strong> (helper inteligente)
              · <strong>categoría</strong> (genérico) ·{" "}
              <strong>personalizado</strong> (cualquier emoji).
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {totalDecided} de {totalActive} items con emoji elegido manualmente.
              El resto usa el helper automático.
            </p>
          </div>
          <Link
            href="/fb-admin"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Volver al menú
          </Link>
        </header>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar item..."
            className="flex-1 min-w-[180px] rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Todas las categorías</option>
            {[...categories]
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="h-4 w-4"
            />
            Solo activos
          </label>
        </div>

        {/* Lista agrupada */}
        {grouped.map((g) => (
          <section key={g.category.id} className="mb-5">
            <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>{iconForCategory(g.category.code)}</span>
              {g.category.name}
              <span className="text-slate-400">({g.items.length})</span>
            </h2>
            <div className="overflow-hidden rounded-lg bg-white shadow-sm">
              {g.items.map((it, idx) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  categoryCode={g.category.code}
                  isFirst={idx === 0}
                  onUpdated={(emoji) =>
                    setItems((cur) =>
                      cur.map((x) =>
                        x.id === it.id ? { ...x, displayEmoji: emoji } : x
                      )
                    )
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  categoryCode,
  isFirst,
  onUpdated,
}: {
  item: FbMenuItem;
  categoryCode: string;
  isFirst: boolean;
  onUpdated: (emoji: string | null) => void;
}) {
  const specificEmoji = iconForMenuItem(item.name, categoryCode);
  const categoryEmoji = iconForCategory(categoryCode);
  const [customEmoji, setCustomEmoji] = useState(
    item.displayEmoji && item.displayEmoji !== specificEmoji && item.displayEmoji !== categoryEmoji
      ? item.displayEmoji
      : ""
  );
  const [pending, startTransition] = useTransition();
  const [hint, setHint] = useState<string | null>(null);

  // Determinar elección actual
  let currentChoice: Choice;
  if (item.displayEmoji == null) {
    currentChoice = "specific"; // helper automático (que en este momento es el "específico")
  } else if (item.displayEmoji === categoryEmoji && specificEmoji !== categoryEmoji) {
    currentChoice = "category";
  } else if (item.displayEmoji === specificEmoji) {
    currentChoice = "specific";
  } else {
    currentChoice = "custom";
  }

  function applyChoice(choice: Choice, customValue?: string) {
    let value: string | null;
    if (choice === "specific") {
      value = null; // null = usar helper automático
    } else if (choice === "category") {
      value = categoryEmoji;
    } else {
      const v = (customValue ?? customEmoji).trim();
      if (!v) {
        setHint("Escribe un emoji antes de aplicar.");
        return;
      }
      value = v;
    }
    startTransition(async () => {
      const r = await setMenuItemEmoji(item.id, value);
      if (r.ok) {
        onUpdated(value);
        setHint(null);
      } else {
        setHint(r.error ?? "Error al guardar");
      }
    });
  }

  return (
    <div
      className={[
        "grid items-center gap-2 p-3 md:grid-cols-[1fr_auto]",
        isFirst ? "" : "border-t border-slate-100",
        !item.isActive ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl leading-none">
            {item.displayEmoji ?? specificEmoji}
          </span>
          <span className="truncate font-semibold text-slate-900">{item.name}</span>
          <span className="shrink-0 text-xs font-bold text-emerald-700">
            {formatPrice(item.priceCents)}
          </span>
        </div>
        {item.description ? (
          <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">
            {item.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Opción específico (helper) */}
        <button
          type="button"
          disabled={pending}
          onClick={() => applyChoice("specific")}
          className={[
            "flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition",
            currentChoice === "specific"
              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
          ].join(" ")}
          title={`Auto (helper inteligente): ${specificEmoji}`}
        >
          <span className="text-base">{specificEmoji}</span>
          <span>auto</span>
        </button>

        {/* Opción categoría (solo si es distinta) */}
        {categoryEmoji !== specificEmoji ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => applyChoice("category")}
            className={[
              "flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition",
              currentChoice === "category"
                ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
            title={`Emoji de la categoría: ${categoryEmoji}`}
          >
            <span className="text-base">{categoryEmoji}</span>
            <span>categoría</span>
          </button>
        ) : null}

        {/* Opción custom */}
        <div
          className={[
            "flex items-center gap-1 rounded-md border px-1.5 py-1 transition",
            currentChoice === "custom"
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-white",
          ].join(" ")}
        >
          <input
            type="text"
            value={customEmoji}
            onChange={(e) => setCustomEmoji(e.target.value.slice(0, 8))}
            placeholder="🎉"
            className="w-12 bg-transparent text-center text-base outline-none"
          />
          <button
            type="button"
            disabled={pending || !customEmoji.trim()}
            onClick={() => applyChoice("custom", customEmoji)}
            className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            usar
          </button>
        </div>
      </div>

      {hint ? (
        <div className="col-span-full text-[11px] text-red-700">{hint}</div>
      ) : null}
    </div>
  );
}
