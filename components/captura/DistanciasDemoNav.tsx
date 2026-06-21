"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function buildHref(
  searchParams: URLSearchParams,
  path: string,
  extra?: Record<string, string>
): string {
  const p = new URLSearchParams(searchParams.toString());
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

export function DistanciasDemoNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const prueba = searchParams.get("prueba") === "1";

  const href2d = buildHref(searchParams, "/captura/distancias", { prueba: "1" });
  const href3d = buildHref(searchParams, "/captura/distancias/demo-3d");

  const active2d =
    (pathname === "/captura/distancias" && prueba) ||
    (pathname.includes("/captura/distancias/demo") &&
      !pathname.includes("/captura/distancias/demo-3d"));
  const active3d = pathname.includes("/captura/distancias/demo-3d");

  const tabs = [
    { href: href2d, label: "Satélite 2D", hint: "Mapa real", active: active2d },
    { href: href3d, label: "Preview 3D", hint: "Experimental", active: active3d },
  ] as const;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[2100] border-b border-white/10 bg-black/85 px-2 py-2 backdrop-blur-md"
      data-yardage-map-ui
    >
      <div className="mx-auto flex max-w-lg gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "pointer-events-auto flex flex-1 flex-col items-center rounded-xl border px-2 py-2 text-center shadow-lg active:scale-[0.98]",
              tab.active
                ? "border-violet-400/70 bg-violet-600 text-white"
                : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10",
            ].join(" ")}
          >
            <span className="text-[11px] font-black leading-tight">
              {tab.label}
            </span>
            <span
              className={[
                "text-[9px] font-semibold",
                tab.active ? "text-violet-100" : "text-slate-400",
              ].join(" ")}
            >
              {tab.hint}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
