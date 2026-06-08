"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/fb/types";
import type { DayReport } from "./page";

export default function ReportesClient({ report }: { report: DayReport }) {
  const router = useRouter();
  const [date, setDate] = useState(report.date);

  const maxHourTotal = useMemo(
    () => Math.max(1, ...report.byHour.map((h) => h.totalCents)),
    [report.byHour]
  );

  function onDateChange(v: string) {
    setDate(v);
    router.push(`/fb-reportes?date=${v}`);
  }

  const grandTotal =
    report.totalCobradoCents +
    report.totalPorCobrarCents; // todo lo que NO es cancelado/disputado

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              📊 Reportes F&B del día
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Resumen de ventas, pedidos y top items del día seleccionado.
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </header>

        {/* Resumen ejecutivo */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card
            label="Ventas totales"
            value={formatPrice(grandTotal)}
            sub={`${report.ordersCount} pedidos · ${report.uniqueClients} clientes`}
            color="slate"
          />
          <Card
            label="Cobrado"
            value={formatPrice(report.totalCobradoCents)}
            sub="Pagos recibidos"
            color="emerald"
          />
          <Card
            label="Por cobrar"
            value={formatPrice(report.totalPorCobrarCents)}
            sub="Cuentas abiertas"
            color="amber"
          />
          <Card
            label="Cancelado · disputa"
            value={formatPrice(
              report.totalCanceladoCents + report.totalDisputaCents
            )}
            sub={`${formatPrice(report.totalDisputaCents)} en disputa`}
            color="red"
          />
        </div>

        {/* Por venue */}
        <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Ventas por venue
          </h2>
          {report.byVenue.length === 0 ? (
            <div className="text-sm text-slate-400">Sin pedidos en el día.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="text-left py-1">Venue</th>
                  <th className="text-right py-1">Pedidos</th>
                  <th className="text-right py-1">Cobrado</th>
                  <th className="text-right py-1">Por cobrar</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.byVenue.map((v) => (
                  <tr key={v.venueId} className="border-t border-slate-100">
                    <td className="py-1.5">
                      <span className="mr-1">
                        {v.venueType === "restaurant" ? "🏠" : "🚚"}
                      </span>
                      {v.venueName}
                    </td>
                    <td className="text-right py-1.5 tabular-nums">{v.orders}</td>
                    <td className="text-right py-1.5 tabular-nums text-emerald-700">
                      {formatPrice(v.cobradoCents)}
                    </td>
                    <td className="text-right py-1.5 tabular-nums text-amber-700">
                      {formatPrice(v.porCobrarCents)}
                    </td>
                    <td className="text-right py-1.5 tabular-nums font-bold">
                      {formatPrice(v.cobradoCents + v.porCobrarCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Top items */}
        <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Top items vendidos
          </h2>
          {report.topItems.length === 0 ? (
            <div className="text-sm text-slate-400">Sin items en el día.</div>
          ) : (
            <ol className="space-y-1">
              {report.topItems.map((it, idx) => (
                <li
                  key={it.menuItemId}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm odd:bg-slate-50"
                >
                  <span className="flex items-baseline gap-2 truncate">
                    <span className="w-5 text-right text-[10px] font-bold text-slate-400">
                      {idx + 1}.
                    </span>
                    <span className="font-semibold text-slate-900">
                      {it.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 text-xs">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold tabular-nums">
                      {it.totalQty}×
                    </span>
                    <span className="font-bold tabular-nums text-emerald-700">
                      {formatPrice(it.totalCents)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Ventas por hora — bar chart simple en CSS */}
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Ventas por hora
          </h2>
          {report.byHour.length === 0 ? (
            <div className="text-sm text-slate-400">Sin actividad.</div>
          ) : (
            <div className="space-y-1">
              {report.byHour.map((h) => {
                const pct = (h.totalCents / maxHourTotal) * 100;
                const hourLabel = `${h.hour.toString().padStart(2, "0")}:00`;
                return (
                  <div key={h.hour} className="flex items-center gap-2 text-xs">
                    <span className="w-12 tabular-nums text-slate-500">
                      {hourLabel}
                    </span>
                    <div className="relative h-5 flex-1 rounded bg-slate-100">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-end pr-2 font-bold text-[11px] text-slate-700 tabular-nums">
                        {formatPrice(h.totalCents)} · {h.orders}p
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "slate" | "emerald" | "amber" | "red";
}) {
  const colorClasses: Record<typeof color, string> = {
    slate: "bg-slate-50 text-slate-700 ring-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  };
  return (
    <div className={`rounded-lg p-3 ring-1 ${colorClasses[color]}`}>
      <div className="text-[10px] font-bold uppercase">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] opacity-75">{sub}</div>
    </div>
  );
}
