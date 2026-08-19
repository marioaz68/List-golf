/** Iniciales cortas para marcadores de marshal en el mapa de ritmo. */
export function profileInitials(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  const fn = String(first ?? "").trim();
  const ln = String(last ?? "").trim();
  if (fn && ln) return `${fn[0]}${ln[0]}`.toUpperCase();
  if (ln.length >= 2) return ln.slice(0, 2).toUpperCase();
  if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
  return "M";
}
