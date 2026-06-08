"use client";

import { useMemo, useState, useTransition } from "react";
import {
  committeeApproveDispute,
  committeeRefundDispute,
} from "@/lib/fb/orderActions";
import { formatPrice, ORDER_STATUS_LABELS } from "@/lib/fb/types";
import type { DisputeRow, HistoryEntry } from "./page";

interface Props {
  active: DisputeRow[];
  resolved: DisputeRow[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - dt) / 60000);
  if (diffMin < 1) return "hace segundos";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `hace ${days} d`;
}

export default function DisputasClient({ active, resolved }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});

  const visibleActive = useMemo(
    () => active.filter((d) => !removed.has(d.id)),
    [active, removed]
  );

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resolveDispute(d: DisputeRow, action: "approve" | "refund") {
    const note = notes[d.id]?.trim() || "";
    if (action === "refund" && !note) {
      const c = confirm(
        "Vas a cancelar este pedido sin nota. ¿Continuar?\n\n(Recomendado: escribe el motivo de la cancelación)"
      );
      if (!c) return;
    }
    setPendingId(d.id);
    startTransition(async () => {
      const fn =
        action === "approve" ? committeeApproveDispute : committeeRefundDispute;
      const res = await fn(d.id, note);
      if (res.ok) {
        setRemoved((cur) => new Set([...cur, d.id]));
      } else {
        alert(`Error: ${res.error ?? "no se pudo resolver."}`);
      }
      setPendingId(null);
    });
  }

  const totalEnDisputa = visibleActive.reduce((a, b) => a + b.totalCents, 0);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">
            Disputas F&B · Comité
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pedidos que el cliente rechazó desde su Mini App. Decide si se
            carga al cliente o se cancela.
          </p>
        </header>

        {/* Resumen */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
            <div className="text-[10px] font-bold uppercase text-red-700">
              En disputa
            </div>
            <div className="text-2xl font-bold text-red-800">
              {visibleActive.length}
            </div>
            <div className="text-[10px] text-red-700">
              {formatPrice(totalEnDisputa)} en juego
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-[10px] font-bold uppercase text-slate-700">
              Resueltas (últimas)
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {resolved.length}
            </div>
            <div className="text-[10px] text-slate-600">
              Histórico de auditoría
            </div>
          </div>
        </div>

        {/* Activas */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            Pendientes de resolver
          </h2>
          {visibleActive.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
              <div className="text-3xl">✅</div>
              <div className="mt-2 text-sm font-bold text-emerald-800">
                Sin disputas pendientes
              </div>
              <div className="mt-1 text-xs text-emerald-700">
                Todos los pedidos del torneo van como deben.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleActive.map((d) => (
                <DisputeCard
                  key={d.id}
                  d={d}
                  expanded={expanded.has(d.id)}
                  onToggle={() => toggle(d.id)}
                  pending={pending && pendingId === d.id}
                  note={notes[d.id] ?? ""}
                  onNote={(v) => setNotes((cur) => ({ ...cur, [d.id]: v }))}
                  onApprove={() => resolveDispute(d, "approve")}
                  onRefund={() => resolveDispute(d, "refund")}
                />
              ))}
            </div>
          )}
        </section>

        {/* Resueltas (histórico) */}
        {resolved.length > 0 ? (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
              Histórico
            </h2>
            <div className="space-y-2">
              {resolved.map((d) => (
                <ResolvedRow key={d.id} d={d} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function DisputeCard({
  d,
  expanded,
  onToggle,
  pending,
  note,
  onNote,
  onApprove,
  onRefund,
}: {
  d: DisputeRow;
  expanded: boolean;
  onToggle: () => void;
  pending: boolean;
  note: string;
  onNote: (v: string) => void;
  onApprove: () => void;
  onRefund: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 bg-red-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-900">
              {d.clientName}
            </span>
            {d.clientKind === "caddie" ? (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                caddie
              </span>
            ) : null}
            {d.groupNo != null ? (
              <span className="text-xs text-slate-500">
                Grupo {d.groupNo}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            {d.venueName} · {timeAgo(d.disputedAt)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-red-700">
            {formatPrice(d.totalCents)}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] font-semibold text-slate-600 underline"
          >
            {expanded ? "Ocultar detalle" : "Ver detalle"}
          </button>
        </div>
      </header>

      {d.disputedReason ? (
        <div className="border-b border-red-100 bg-red-50/50 px-4 py-2">
          <div className="text-[10px] font-bold uppercase text-red-700">
            Motivo del cliente
          </div>
          <div className="mt-0.5 text-sm italic text-red-900">
            &ldquo;{d.disputedReason}&rdquo;
          </div>
        </div>
      ) : (
        <div className="border-b border-red-100 bg-red-50/50 px-4 py-2 text-[12px] text-red-700">
          (Sin motivo escrito por el cliente)
        </div>
      )}

      {expanded ? (
        <div className="space-y-3 px-4 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Items
            </div>
            <ul className="mt-1 space-y-0.5">
              {d.items.map((it) => (
                <li key={it.id} className="text-sm text-slate-800">
                  {it.qty}× {it.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Historia del pedido
            </div>
            <ul className="mt-1 space-y-0.5">
              {d.history.map((h, i) => (
                <HistoryRow key={i} h={h} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-slate-600">
            Nota del comité (opcional para cargo, recomendada para cancelar)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ej: Cliente confirmó después por WhatsApp / Carrito no llegó al hoyo"
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onApprove}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✓ Cargar al cliente
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onRefund}
            className="rounded bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            ✕ Cancelar pedido
          </button>
        </div>
      </div>
    </article>
  );
}

function HistoryRow({ h }: { h: HistoryEntry }) {
  const dt = new Date(h.at);
  const time = dt.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex items-baseline gap-2 text-[12px] text-slate-700">
      <span className="shrink-0 text-slate-400">·</span>
      <span className="shrink-0 font-mono text-[11px] text-slate-500">{time}</span>
      <span>{h.label}</span>
    </li>
  );
}

function ResolvedRow({ d }: { d: DisputeRow }) {
  const wasApproved = d.status === "delivered" || d.status === "paid";
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-800">
          {d.clientName}
          <span className="ml-2 text-[10px] font-normal text-slate-500">
            {d.venueName}
          </span>
        </div>
        <div className="truncate text-[11px] text-slate-500">
          {d.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold text-slate-700">
          {formatPrice(d.totalCents)}
        </div>
        <div
          className={[
            "text-[10px] font-bold uppercase",
            wasApproved ? "text-emerald-700" : "text-red-700",
          ].join(" ")}
        >
          {wasApproved
            ? `Cargado · ${ORDER_STATUS_LABELS[d.status as keyof typeof ORDER_STATUS_LABELS] ?? d.status}`
            : "Cancelado"}
        </div>
      </div>
    </div>
  );
}
