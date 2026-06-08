"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MesaQrRow } from "./page";

interface Props {
  tables: MesaQrRow[];
  appUrl: string;
}

type Size = "small" | "medium" | "large";

const SIZE_PX: Record<Size, number> = {
  small: 240,
  medium: 360,
  large: 520,
};

const PER_PAGE: Record<Size, number> = {
  small: 6,
  medium: 4,
  large: 2,
};

function qrSrc(url: string, sizePx: number): string {
  // QR API público de goqr.me — confiable, sin auth.
  const encoded = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&margin=2&qzone=1&data=${encoded}`;
}

export default function MesasQrClient({ tables, appUrl }: Props) {
  const [size, setSize] = useState<Size>("medium");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");

  const areas = useMemo(
    () => Array.from(new Set(tables.map((t) => t.area))).sort(),
    [tables]
  );
  const venues = useMemo(
    () =>
      Array.from(
        new Map(tables.map((t) => [t.venueId, t.venueName])).entries()
      ),
    [tables]
  );

  const filtered = useMemo(
    () =>
      tables.filter((t) => {
        if (areaFilter !== "all" && t.area !== areaFilter) return false;
        if (venueFilter !== "all" && t.venueId !== venueFilter) return false;
        return true;
      }),
    [tables, areaFilter, venueFilter]
  );

  const px = SIZE_PX[size];
  const perPage = PER_PAGE[size];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar (oculta al imprimir) */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <Link
            href="/fb-admin"
            className="text-[11px] font-semibold text-slate-600 underline"
          >
            ← F&B Admin
          </Link>
          <h1 className="text-base font-bold text-slate-900">QR por mesa</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            {filtered.length} mesas
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold uppercase text-slate-500">
              Tamaño:
            </label>
            <div className="flex rounded-md border border-slate-300 bg-white text-[11px] font-semibold">
              {(["small", "medium", "large"] as Size[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={[
                    "px-2 py-1",
                    size === s ? "bg-indigo-600 text-white" : "text-slate-600",
                  ].join(" ")}
                >
                  {s === "small" ? "Pequeño (6/pág)" : s === "medium" ? "Mediano (4/pág)" : "Grande (2/pág)"}
                </button>
              ))}
            </div>

            {venues.length > 1 ? (
              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
              >
                <option value="all">Todos los venues</option>
                {venues.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}

            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
            >
              <option value="all">Todas las áreas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700"
            >
              🖨 Imprimir
            </button>
          </div>
        </div>
        <p className="mx-auto mt-1 max-w-5xl text-[10px] text-slate-500">
          Cada QR encripta la URL de su mesa (<code>{appUrl}/mesa/&lt;code&gt;</code>).
          Imprime, recorta y pega uno en cada mesa.
        </p>
      </header>

      {/* Grid de QRs */}
      <main className="mx-auto max-w-5xl p-4 print:p-0">
        <div
          className={[
            "grid gap-4 print:gap-0",
            perPage === 2
              ? "grid-cols-1 sm:grid-cols-2"
              : perPage === 4
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3",
          ].join(" ")}
        >
          {filtered.map((t, idx) => {
            const url = `${appUrl}/mesa/${encodeURIComponent(t.code)}`;
            const isPageBreak = (idx + 1) % perPage === 0 && idx !== filtered.length - 1;
            return (
              <div
                key={t.id}
                className={[
                  "break-inside-avoid rounded-lg border-2 border-slate-300 bg-white p-4 text-center shadow-sm",
                  "print:rounded-none print:border print:border-black print:shadow-none",
                  isPageBreak ? "print:break-after-page" : "",
                ].join(" ")}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t.venueName}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {t.area} · {t.capacity}p
                  </span>
                </div>
                <h2 className="text-3xl font-black tracking-wide text-slate-900">
                  {t.code}
                </h2>
                {t.name && t.name !== t.code ? (
                  <p className="text-[11px] text-slate-600">{t.name}</p>
                ) : null}
                <div className="my-3 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc(url, px)}
                    alt={`QR mesa ${t.code}`}
                    width={px}
                    height={px}
                    className="block"
                  />
                </div>
                <p className="text-[12px] font-bold text-slate-700">
                  Escanea con tu cámara para pedir
                </p>
                <p className="mt-1 break-all text-[9px] text-slate-400">
                  {url}
                </p>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Sin mesas con esos filtros
          </p>
        ) : null}
      </main>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
