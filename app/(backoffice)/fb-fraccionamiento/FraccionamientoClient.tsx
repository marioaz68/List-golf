"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  createResident,
  searchPeople,
  setResidentActive,
  updateResident,
  type PersonMatch,
  type ResidentInput,
} from "@/lib/fb/residentActions";

export interface Resident {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  telegramUserId: string | null;
}

interface Props {
  initialResidents: Resident[];
}

const EMPTY_FORM: ResidentInput = {
  firstName: "",
  lastName: "",
  phone: "",
  whatsapp: "",
  address: "",
  telegramUserId: "",
};

export default function FraccionamientoClient({ initialResidents }: Props) {
  const [residents, setResidents] = useState<Resident[]>(initialResidents);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Resident | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter((r) => {
      const name = `${r.firstName} ${r.lastName}`.toLowerCase();
      return (
        name.includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.address ?? "").toLowerCase().includes(q)
      );
    });
  }, [residents, search]);

  const upsertLocal = useCallback((r: Resident) => {
    setResidents((cur) => {
      const idx = cur.findIndex((x) => x.id === r.id);
      if (idx >= 0) {
        const next = cur.slice();
        next[idx] = r;
        return next;
      }
      return [...cur, r].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
          "es"
        )
      );
    });
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🏡 Fraccionamiento</h1>
          <p className="text-sm text-white/50">
            Clientes de reparto a domicilio. Da de alta su domicilio y teléfonos;
            el pedido se envía al carrito Fraccionamiento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-[#63BC46] px-4 py-2 text-sm font-bold text-black hover:brightness-110"
        >
          + Registrar cliente
        </button>
      </header>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre, teléfono o domicilio…"
        className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-white/50">
          {residents.length === 0
            ? "Aún no hay clientes del fraccionamiento. Registra el primero."
            : "Sin resultados para tu búsqueda."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <ResidentRow
              key={r.id}
              resident={r}
              onEdit={() => {
                setEditing(r);
                setShowForm(true);
              }}
              onRemoved={() =>
                setResidents((cur) => cur.filter((x) => x.id !== r.id))
              }
            />
          ))}
        </div>
      )}

      {showForm ? (
        <ResidentFormModal
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={(r) => {
            upsertLocal(r);
            setShowForm(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ResidentRow({
  resident,
  onEdit,
  onRemoved,
}: {
  resident: Resident;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const fullName =
    `${resident.firstName} ${resident.lastName}`.trim() || "(sin nombre)";

  function remove() {
    if (
      !window.confirm(
        `¿Quitar a ${fullName} de los clientes del fraccionamiento? (no se borra el jugador)`
      )
    )
      return;
    startTransition(async () => {
      const r = await setResidentActive(resident.id, false);
      if (r.ok) onRemoved();
      else alert(r.error ?? "Error");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{fullName}</span>
          {resident.telegramUserId ? (
            <span className="rounded-full bg-sky-900 px-2 py-0.5 text-[10px] font-bold text-sky-200">
              ✈ Telegram
            </span>
          ) : (
            <span className="rounded-full bg-amber-900 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              sin Telegram
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-white/60">
          {resident.address ? (
            <span>🏡 {resident.address}</span>
          ) : (
            <span className="text-amber-300/70">🏡 sin domicilio</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-3 text-[12px] text-white/50">
          {resident.phone ? <span>📞 {resident.phone}</span> : null}
          {resident.whatsapp ? <span>🟢 {resident.whatsapp}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <a
          href={`/captura/menu?player=${resident.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-[#63BC46] px-3 py-1.5 text-[12px] font-bold text-black hover:brightness-110"
        >
          🛒 Tomar pedido
        </a>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-white/80 hover:bg-white/10"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-red-500/40 px-3 py-1.5 text-[12px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          Quitar
        </button>
      </div>
    </div>
  );
}

function ResidentFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Resident | null;
  onClose: () => void;
  onSaved: (r: Resident) => void;
}) {
  const [form, setForm] = useState<ResidentInput>(
    editing
      ? {
          firstName: editing.firstName,
          lastName: editing.lastName,
          phone: editing.phone ?? "",
          whatsapp: editing.whatsapp ?? "",
          address: editing.address ?? "",
          telegramUserId: editing.telegramUserId ?? "",
        }
      : EMPTY_FORM
  );
  const [linkedId, setLinkedId] = useState<string | null>(editing?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Buscar personas ya en el sistema (solo en alta nueva)
  const [matches, setMatches] = useState<PersonMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchPeople(q);
      setMatches(res);
    } finally {
      setSearching(false);
    }
  }, []);

  function update<K extends keyof ResidentInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickMatch(m: PersonMatch) {
    setLinkedId(m.id);
    const [first, ...rest] = m.name.split(" ");
    setForm((f) => ({
      ...f,
      firstName: first ?? m.name,
      lastName: rest.join(" "),
      phone: m.phone ?? f.phone,
    }));
    setMatches([]);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = linkedId
        ? await updateResident(linkedId, form)
        : await createResident(form);
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo guardar.");
        return;
      }
      onSaved({
        id: res.id,
        firstName: form.firstName.trim(),
        lastName: (form.lastName ?? "").trim(),
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        address: form.address?.trim() || null,
        telegramUserId: form.telegramUserId?.trim() || null,
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-[#1C252D] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {linkedId ? "Editar cliente" : "Registrar cliente"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white"
          >
            ✕
          </button>
        </div>

        {!editing ? (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Buscar persona ya conectada al sistema
            </label>
            <input
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Nombre, teléfono o ID de Telegram…"
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0F1720] px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            {searching ? (
              <p className="mt-1 text-[11px] text-white/40">Buscando…</p>
            ) : null}
            {matches.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pickMatch(m)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0F1720] px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                    >
                      <span>
                        {m.name}
                        {m.phone ? (
                          <span className="text-white/40"> · {m.phone}</span>
                        ) : null}
                      </span>
                      <span className="flex gap-1">
                        {m.telegramLinked ? (
                          <span className="rounded-full bg-sky-900 px-1.5 text-[9px] font-bold text-sky-200">
                            ✈
                          </span>
                        ) : null}
                        {m.isResident ? (
                          <span className="rounded-full bg-emerald-900 px-1.5 text-[9px] font-bold text-emerald-200">
                            residente
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-[10px] text-white/40">
              Selecciona uno para no duplicar, o llena los datos abajo para crear
              uno nuevo.
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Nombre *"
              value={form.firstName}
              onChange={(v) => update("firstName", v)}
            />
            <Field
              label="Apellido"
              value={form.lastName}
              onChange={(v) => update("lastName", v)}
            />
          </div>
          <Field
            label="Domicilio (fraccionamiento)"
            value={form.address ?? ""}
            onChange={(v) => update("address", v)}
            placeholder="Calle, número/lote, color de casa, referencias…"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Teléfono"
              value={form.phone ?? ""}
              onChange={(v) => update("phone", v)}
            />
            <Field
              label="WhatsApp"
              value={form.whatsapp ?? ""}
              onChange={(v) => update("whatsapp", v)}
            />
          </div>
          <Field
            label="ID de Telegram"
            value={form.telegramUserId ?? ""}
            onChange={(v) => update("telegramUserId", v)}
            placeholder="El cliente lo obtiene escribiendo ID al bot"
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[12px] text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-[#63BC46] px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-white/10 bg-[#0F1720] px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
    </label>
  );
}
