"use client";

import Link from "next/link";

/**
 * Área táctil del nombre: abre/cierra el detalle hoyo por hoyo.
 * La flecha es solo indicador visual (no es el objetivo del toque).
 */
export default function PublicLeaderboardPlayerDetailTrigger({
  href,
  isOpen,
  ariaLabel,
  children,
}: {
  href: string;
  isOpen: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        scroll={false}
        href={href}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className={`min-w-0 flex-1 rounded-md px-1 py-1 -mx-0.5 transition hover:bg-cyan-500/10 active:bg-cyan-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400/60 ${
          isOpen ? "bg-cyan-500/10 ring-1 ring-cyan-400/25" : ""
        }`}
      >
        {children}
      </Link>
      <span
        className="pointer-events-none shrink-0 select-none self-center text-[11px] font-semibold leading-none text-cyan-400/90 sm:text-xs"
        aria-hidden
      >
        {isOpen ? "▴" : "▾"}
      </span>
    </div>
  );
}
