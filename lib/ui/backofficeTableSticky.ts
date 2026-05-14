import type { CSSProperties } from "react";

/**
 * Scrollport compartido para tablas del backoffice con encabezado `position: sticky`.
 * Evita envolver la tabla solo en `overflow-x: auto`, que suele romper el sticky vertical.
 */
export const backofficeTableStickyScroll: CSSProperties = {
  width: "100%",
  maxHeight: "min(78dvh, calc(100dvh - 11rem))",
  minHeight: 0,
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
  background: "#ffffff",
};

/** Tabla a ancho completo dentro de una tarjeta con cabecera (p. ej. staff). */
export const backofficeTableStickyScrollCardBody: CSSProperties = {
  ...backofficeTableStickyScroll,
  borderRadius: "0 0 12px 12px",
};

/** Tarjeta que solo contiene la tabla (p. ej. listado de torneos). */
export const backofficeTableStickyScrollRounded: CSSProperties = {
  ...backofficeTableStickyScroll,
  borderRadius: 12,
};

/** Propiedades a combinar con el `th` existente (mantener `background` opaco del tema). */
export const stickyTableHeaderCell: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  boxShadow: "0 1px 0 rgba(226, 232, 240, 0.9)",
};

export function cardStyleAllowTableSticky(card: CSSProperties): CSSProperties {
  return { ...card, overflow: "visible" };
}

export function thStyleWithSticky(base: CSSProperties): CSSProperties {
  return { ...base, ...stickyTableHeaderCell };
}

/** Tailwind: combinar con clases existentes del `<th>` (fondo gray-200). */
export const twStickyThGray200 =
  "sticky top-0 z-[2] bg-gray-200 shadow-[0_1px_0_rgba(209,213,219,0.95)]";

export const twStickyThGray100 =
  "sticky top-0 z-[2] bg-gray-100 shadow-[0_1px_0_rgba(209,213,219,0.95)]";

export const twStickyThSlate50 =
  "sticky top-0 z-[2] bg-slate-50 shadow-[0_1px_0_rgba(226,232,240,0.9)]";

/** Vista previa categorías (fondo oscuro). */
export const twStickyThDarkGlass =
  "sticky top-0 z-[2] bg-slate-900/95 text-white/60 shadow-[0_1px_0_rgba(255,255,255,0.08)]";

/** Bloque `thead` con varias filas (p. ej. tarjeta de score). */
export const twStickyTheadGray50 =
  "sticky top-0 z-[2] bg-gray-50 shadow-[0_1px_0_rgba(229,231,235,0.95)]";

export const twStickyTheadSlate50 =
  "sticky top-0 z-[2] bg-slate-50 shadow-[0_1px_0_rgba(226,232,240,0.9)]";
