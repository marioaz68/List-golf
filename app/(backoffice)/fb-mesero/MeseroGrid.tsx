"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/fb/types";
import type { TableWithState } from "@/lib/fb/loadTables";
import type { VenueWithTables } from "./page";

interface Props {
  venues: VenueWithTables[];
}

function minutesAgo(iso: string | null): number {
  if (!iso) return 0;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function stateChip(t: TableWithState): { label: string; bg: string; fg: string } {
  if (t.state === "pending_approval")
    return { label: "QR por aprobar", bg: "bg-amber-100", fg: "text-amber-800" };
  if (t.state === "open")
    return { label: "Abierta", bg: "bg-emerald-100", fg: "text-emerald-800" };
  return { label: "Libre", bg: "bg-slate-100", fg: "text-slate-600" };
}

export default function MeseroGrid({ venues: initial }: Props) {
  const [venues, setVenues] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVenueId, setActiveVenueId] = useState<string>(
    initial[0]?.id ?? ""
  );

  // Auto-refresh cada 15s
  useEffect(() => {
    const id = setInterval(async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/mesero/state", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { venues: VenueWithTables[] };
          setVenues(json.venues);
        }
      } finally {
        setRefreshing(false);
      }
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const activeVenue = useMemo(
    () => venues.find((v) => v.id === activeVenueId) ?? venues[0],
    [venues, activeVenueId]
  );

  const stats = useMemo(() => {
    let open = 0;
    let total = 0;
    let pending = 0;
    for (const t of activeVenue?.tables ?? []) {
      if (t.state === "open") open++;
      if (t.state === "pending_approval") pending++;
      total += t.openTotalCents;
    }
    return { open, total, pending };
  }, [activeVenue]);

  if (!activeVenue) {
    return (
      <div className="p-6 text-center text-sm text-slate-600">
        No hay restaurantes asignados.
      </div>
    );
  }

  // Agrupar mesas por área
  const byArea = new Map<string, TableWithState[]>();
  for (const t of activeVenue.tables) {
    const arr = byArea.get(t.area) ?? [];
    arr.push(t);
    byArea.set(t.area, arr);
  }
  const areas = Array.from(byArea.keys()).sort();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-bold">🍽️ Mesero · {activeVenue.name}</h1>
          <div className="flex items-center gap-2">
            {refreshing ? (
              <span className="text-[10px] text-slate-400">actualizando…</span>
            ) : null}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-red-400/40 bg-red-500/20 px-3 py-1 text-[11px] font-bold text-red-100 hover:bg-red-500/30"
              >
                🚪 Salir
              </button>
            </form>
          </div>
        </div>
        {venues.length > 1 ? (
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {venues.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVenueId(v.id)}
                className={[
                  "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                  v.id === activeVenueId
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >
                {v.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Abiertas" value={String(stats.open)} bg="bg-emerald-900/40" />
          <Stat
            label="Por aprobar"
            value={String(stats.pending)}
            bg={stats.pending > 0 ? "bg-amber-900/60 animate-pulse" : "bg-slate-800/60"}
          />
          <Stat label="En piso" value={formatPrice(stats.total)} bg="bg-slate-800/60" />
        </div>
      </header>

      <main className="space-y-4 p-3">
        {areas.map((area) => (
          <section key={area}>
            <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {area}
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(byArea.get(area) ?? []).map((t) => {
                const chip = stateChip(t);
                return (
                  <Link
                    key={t.id}
                    href={`/fb-mesero/${encodeURIComponent(t.code)}`}
                    className={[
                      "block rounded-lg border p-2 text-left transition-colors",
                      t.state === "pending_approval"
                        ? "border-amber-500 bg-amber-950/40 ring-2 ring-amber-500/40 animate-pulse"
                        : t.state === "open"
                          ? "border-emerald-700 bg-emerald-950/40 hover:bg-emerald-900/40"
                          : "border-slate-700 bg-slate-900 hover:bg-slate-800",
                    ].join(" ")}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-bold">{t.code}</span>
                      <span className="text-[10px] text-slate-400">
                        {t.capacity}p
                      </span>
                    </div>
                    {t.name && t.name !== t.code ? (
                      <div className="truncate text-[10px] text-slate-400">
                        {t.name}
                      </div>
                    ) : null}
                    <div
                      className={[
                        "mt-1 inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
                        chip.bg,
                        chip.fg,
                      ].join(" ")}
                    >
                      {chip.label}
                    </div>
                    {t.openTotalCents > 0 ? (
                      <div className="mt-1 text-sm font-bold text-emerald-300">
                        {formatPrice(t.openTotalCents)}
                      </div>
                    ) : null}
                    {t.oldestOpenAt ? (
                      <div className="text-[10px] text-slate-400">
                        {minutesAgo(t.oldestOpenAt)} min
                      </div>
                    ) : null}
                    {t.pendingApprovalCount > 0 ? (
                      <div className="mt-1 text-[10px] font-bold text-amber-300">
                        🔔 {t.pendingApprovalCount} QR
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function Stat({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div className={["rounded-md px-2 py-1.5", bg].join(" ")}>
      <div className="text-[9px] font-bold uppercase text-slate-400">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
