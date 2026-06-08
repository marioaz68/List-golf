"use client";

import { useState, useTransition } from "react";
import {
  deactivateCategory,
  deactivateMenuItem,
  deactivateVenue,
  deleteMenuItem,
  upsertCategory,
  upsertMenuItem,
  upsertVenue,
} from "@/lib/fb/actions";
import {
  formatPrice,
  type FbCategory,
  type FbMenuItem,
  type FbVenue,
} from "@/lib/fb/types";

type Tab = "venues" | "categories" | "items";

interface Props {
  initialVenues: FbVenue[];
  initialCategories: FbCategory[];
  initialMenuItems: FbMenuItem[];
}

export default function FbAdminClient({
  initialVenues,
  initialCategories,
  initialMenuItems,
}: Props) {
  const [tab, setTab] = useState<Tab>("items");
  const [venues, setVenues] = useState(initialVenues);
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialMenuItems);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              F&B · Restaurante Hoyo 6 + Carritos Bar
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Edita venues, categorías y menú. Los cambios aparecen en la Mini App de inmediato.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/fb-admin/emojis"
              className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              😀 Revisar emojis del menú →
            </a>
            <a
              href="/fb-admin/mesas-qr"
              className="rounded-md border border-indigo-400 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
            >
              🪑 QR por mesa →
            </a>
          </div>
        </header>

        <div className="mb-4 flex gap-2 border-b border-slate-300">
          {[
            { k: "items" as Tab, label: `Menú (${items.length})` },
            { k: "categories" as Tab, label: `Categorías (${categories.length})` },
            { k: "venues" as Tab, label: `Venues (${venues.length})` },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={[
                "px-4 py-2 text-sm font-semibold transition",
                tab === t.k
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "items" && (
          <ItemsPanel
            items={items}
            categories={categories}
            venues={venues}
            onChange={setItems}
          />
        )}
        {tab === "categories" && (
          <CategoriesPanel categories={categories} onChange={setCategories} />
        )}
        {tab === "venues" && (
          <VenuesPanel venues={venues} onChange={setVenues} />
        )}
      </div>
    </div>
  );
}

// =================== ITEMS ===================

function ItemsPanel({
  items,
  categories,
  venues,
  onChange,
}: {
  items: FbMenuItem[];
  categories: FbCategory[];
  venues: FbVenue[];
  onChange: (next: FbMenuItem[]) => void;
}) {
  const [editing, setEditing] = useState<FbMenuItem | "new" | null>(null);

  const itemsByCat = new Map<string, FbMenuItem[]>();
  for (const it of items) {
    const arr = itemsByCat.get(it.categoryId) ?? [];
    arr.push(it);
    itemsByCat.set(it.categoryId, arr);
  }
  const orderedCats = [...categories].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Items del menú</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + Nuevo item
        </button>
      </div>

      {orderedCats.length === 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Primero crea categorías en la pestaña <strong>Categorías</strong>.
        </div>
      ) : null}

      {orderedCats.map((cat) => {
        const catItems = itemsByCat.get(cat.id) ?? [];
        return (
          <section key={cat.id} className="mb-6">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              {cat.name}{" "}
              <span className="text-slate-400">({catItems.length})</span>
            </h3>
            {catItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                Sin items en esta categoría todavía.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {catItems.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    venues={venues}
                    onEdit={() => setEditing(it)}
                    onChange={(next) => {
                      onChange(items.map((x) => (x.id === next.id ? next : x)));
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {editing != null ? (
        <ItemModal
          item={editing === "new" ? null : editing}
          categories={categories}
          venues={venues}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            if (editing === "new") {
              onChange([...items, saved]);
            } else {
              onChange(items.map((x) => (x.id === saved.id ? saved : x)));
            }
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  venues,
  onEdit,
  onChange,
}: {
  item: FbMenuItem;
  venues: FbVenue[];
  onEdit: () => void;
  onChange: (next: FbMenuItem) => void;
}) {
  const [pending, startTransition] = useTransition();

  const venueNames = item.availableVenueIds
    .map((id) => venues.find((v) => v.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={[
        "rounded-lg border bg-white p-3 shadow-sm",
        item.isActive
          ? "border-slate-200"
          : "border-slate-300 bg-slate-100 opacity-70",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold text-slate-900">
              {item.name}
            </span>
            <span className="font-bold text-emerald-700">
              {formatPrice(item.priceCents)}
            </span>
          </div>
          {item.description ? (
            <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">
              {item.description}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-slate-500">
            Disponible en: {venueNames || "ningún venue"}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Editar
          </button>
          {item.isActive ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`¿Desactivar "${item.name}"?`)) return;
                startTransition(async () => {
                  const r = await deactivateMenuItem(item.id);
                  if (r.ok) onChange({ ...item, isActive: false });
                  else alert(r.error);
                });
              }}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
            >
              Desactivar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemModal({
  item,
  categories,
  venues,
  onClose,
  onSaved,
}: {
  item: FbMenuItem | null;
  categories: FbCategory[];
  venues: FbVenue[];
  onClose: () => void;
  onSaved: (saved: FbMenuItem) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? categories[0]?.id ?? ""
  );
  const [priceString, setPriceString] = useState(
    item ? (item.priceCents / 100).toFixed(0) : ""
  );
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [availableVenueIds, setAvailableVenueIds] = useState<string[]>(
    item?.availableVenueIds ?? venues.map((v) => v.id)
  );
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(item?.displayOrder ?? 0);
  const [prepMinutes, setPrepMinutes] = useState(
    item?.prepMinutes ? String(item.prepMinutes) : ""
  );

  function toggleVenue(id: string) {
    setAvailableVenueIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function onSave() {
    setError(null);
    const priceCents = Math.round(Number(priceString) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError("Precio inválido.");
      return;
    }
    startTransition(async () => {
      const r = await upsertMenuItem({
        id: item?.id,
        categoryId,
        name,
        description: description || null,
        priceCents,
        imageUrl: imageUrl || null,
        availableVenueIds,
        isActive,
        displayOrder,
        prepMinutes: prepMinutes ? Number(prepMinutes) : null,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? "Error al guardar.");
        return;
      }
      onSaved({
        id: r.id,
        categoryId,
        name,
        description: description || null,
        priceCents,
        imageUrl: imageUrl || null,
        availableVenueIds,
        isActive,
        displayOrder,
        prepMinutes: prepMinutes ? Number(prepMinutes) : null,
        displayEmoji: item?.displayEmoji ?? null,
        allergens: item?.allergens ?? null,
        notes: item?.notes ?? null,
      });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-slate-900">
          {item ? `Editar: ${item.name}` : "Nuevo item del menú"}
        </h3>

        <div className="space-y-3">
          <Field label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Hamburguesa clásica"
            />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="200g de res angus, queso cheddar, papas"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio (MXN)">
              <input
                value={priceString}
                onChange={(e) => setPriceString(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="180"
                inputMode="decimal"
              />
            </Field>
            <Field label="Categoría">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="URL de imagen (opcional)">
            <input
              value={imageUrl ?? ""}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </Field>
          <Field label="Disponible en">
            <div className="flex flex-wrap gap-2">
              {venues.map((v) => (
                <label
                  key={v.id}
                  className={[
                    "cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold transition",
                    availableVenueIds.includes(v.id)
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 bg-white text-slate-600",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={availableVenueIds.includes(v.id)}
                    onChange={() => toggleVenue(v.id)}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Orden">
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Min. prep">
              <input
                type="number"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="opcional"
              />
            </Field>
            <Field label="Activo">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-2 h-5 w-5"
              />
            </Field>
          </div>

          {error ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onSave}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== CATEGORIES ===================

function CategoriesPanel({
  categories,
  onChange,
}: {
  categories: FbCategory[];
  onChange: (next: FbCategory[]) => void;
}) {
  const [editing, setEditing] = useState<FbCategory | "new" | null>(null);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Categorías</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + Nueva categoría
        </button>
      </div>
      <div className="space-y-1">
        {[...categories]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onEdit={() => setEditing(c)}
              onChange={(next) =>
                onChange(categories.map((x) => (x.id === next.id ? next : x)))
              }
            />
          ))}
      </div>
      {editing != null ? (
        <CategoryModal
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            if (editing === "new") onChange([...categories, saved]);
            else onChange(categories.map((x) => (x.id === saved.id ? saved : x)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryRow({
  category,
  onEdit,
  onChange,
}: {
  category: FbCategory;
  onEdit: () => void;
  onChange: (next: FbCategory) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div
      className={[
        "flex items-center justify-between rounded-md border bg-white px-3 py-2",
        category.isActive
          ? "border-slate-200"
          : "border-slate-300 bg-slate-100 opacity-70",
      ].join(" ")}
    >
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-900">{category.name}</span>
          <span className="text-xs text-slate-500">#{category.displayOrder}</span>
        </div>
        <span className="text-[10px] text-slate-500">code: {category.code}</span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Editar
        </button>
        {category.isActive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`¿Desactivar "${category.name}"?`)) return;
              startTransition(async () => {
                const r = await deactivateCategory(category.id);
                if (r.ok) onChange({ ...category, isActive: false });
                else alert(r.error);
              });
            }}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
          >
            Desactivar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: FbCategory | null;
  onClose: () => void;
  onSaved: (saved: FbCategory) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [displayOrder, setDisplayOrder] = useState(category?.displayOrder ?? 0);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const r = await upsertCategory({
        id: category?.id,
        code,
        name,
        displayOrder,
        isActive,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? "Error al guardar");
        return;
      }
      onSaved({ id: r.id, code, name, displayOrder, isActive });
    });
  }

  return (
    <ModalShell title={category ? "Editar categoría" : "Nueva categoría"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Código (sin espacios, ej. 'hamburguesas')">
          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orden">
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Activa">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-2 h-5 w-5"
            />
          </Field>
        </div>

        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// =================== VENUES ===================

function VenuesPanel({
  venues,
  onChange,
}: {
  venues: FbVenue[];
  onChange: (next: FbVenue[]) => void;
}) {
  const [editing, setEditing] = useState<FbVenue | "new" | null>(null);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Venues</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + Nuevo venue
        </button>
      </div>
      <div className="space-y-1">
        {[...venues]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((v) => (
            <VenueRow
              key={v.id}
              venue={v}
              onEdit={() => setEditing(v)}
              onChange={(next) =>
                onChange(venues.map((x) => (x.id === next.id ? next : x)))
              }
            />
          ))}
      </div>
      {editing != null ? (
        <VenueModal
          venue={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            if (editing === "new") onChange([...venues, saved]);
            else onChange(venues.map((x) => (x.id === saved.id ? saved : x)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function VenueRow({
  venue,
  onEdit,
  onChange,
}: {
  venue: FbVenue;
  onEdit: () => void;
  onChange: (next: FbVenue) => void;
}) {
  const [pending, startTransition] = useTransition();
  const rangeLabel =
    venue.type === "cart" && venue.holeRangeStart && venue.holeRangeEnd
      ? `Hoyos ${venue.holeRangeStart}–${venue.holeRangeEnd}`
      : venue.type === "restaurant"
        ? "Halfway / Restaurante"
        : "Sin rango";
  return (
    <div
      className={[
        "flex items-center justify-between rounded-md border bg-white px-3 py-2",
        venue.isActive
          ? "border-slate-200"
          : "border-slate-300 bg-slate-100 opacity-70",
      ].join(" ")}
    >
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-900">{venue.name}</span>
          <span className="text-xs text-slate-500">{rangeLabel}</span>
        </div>
        <span className="text-[10px] text-slate-500">
          code: {venue.code} · tipo: {venue.type}
        </span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Editar
        </button>
        {venue.isActive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`¿Desactivar "${venue.name}"?`)) return;
              startTransition(async () => {
                const r = await deactivateVenue(venue.id);
                if (r.ok) onChange({ ...venue, isActive: false });
                else alert(r.error);
              });
            }}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
          >
            Desactivar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function VenueModal({
  venue,
  onClose,
  onSaved,
}: {
  venue: FbVenue | null;
  onClose: () => void;
  onSaved: (saved: FbVenue) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(venue?.code ?? "");
  const [name, setName] = useState(venue?.name ?? "");
  const [type, setType] = useState<FbVenue["type"]>(venue?.type ?? "cart");
  const [holeStart, setHoleStart] = useState(
    venue?.holeRangeStart ? String(venue.holeRangeStart) : ""
  );
  const [holeEnd, setHoleEnd] = useState(
    venue?.holeRangeEnd ? String(venue.holeRangeEnd) : ""
  );
  const [displayOrder, setDisplayOrder] = useState(venue?.displayOrder ?? 0);
  const [isActive, setIsActive] = useState(venue?.isActive ?? true);
  const [notes, setNotes] = useState(venue?.notes ?? "");

  function onSave() {
    setError(null);
    startTransition(async () => {
      const r = await upsertVenue({
        id: venue?.id,
        code,
        name,
        type,
        holeRangeStart: holeStart ? Number(holeStart) : null,
        holeRangeEnd: holeEnd ? Number(holeEnd) : null,
        isActive,
        displayOrder,
        notes: notes || null,
      });
      if (!r.ok || !r.id) {
        setError(r.error ?? "Error al guardar");
        return;
      }
      onSaved({
        id: r.id,
        code,
        name,
        type,
        holeRangeStart: holeStart ? Number(holeStart) : null,
        holeRangeEnd: holeEnd ? Number(holeEnd) : null,
        isActive,
        displayOrder,
        notes: notes || null,
      });
    });
  }

  return (
    <ModalShell title={venue ? "Editar venue" : "Nuevo venue"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Código (ej. 'cart_3', 'h19')">
          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Tipo">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FbVenue["type"])}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="restaurant">Restaurante / Halfway (recoger)</option>
            <option value="cart">Carrito bar (entrega en hoyo)</option>
          </select>
        </Field>
        {type === "cart" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hoyo inicial">
              <input
                type="number"
                value={holeStart}
                onChange={(e) => setHoleStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="1"
              />
            </Field>
            <Field label="Hoyo final">
              <input
                type="number"
                value={holeEnd}
                onChange={(e) => setHoleEnd(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="9"
              />
            </Field>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orden">
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Activo">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-2 h-5 w-5"
            />
          </Field>
        </div>
        <Field label="Notas (opcional)">
          <textarea
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
        </Field>

        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// =================== SHARED ===================

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-slate-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}
