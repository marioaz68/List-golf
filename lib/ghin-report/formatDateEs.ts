const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function parseIsoDate(
  iso: string | null | undefined
): { y: number; mo: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d || mo < 1 || mo > 12) return null;
  return { y, mo, d };
}

/** Fecha ISO (YYYY-MM-DD) → "8 de agosto de 2026" (es-MX, sin zona horaria). */
export function formatDateEs(iso: string | null | undefined): string | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  return `${p.d} de ${MONTHS_LONG[p.mo - 1]} de ${p.y}`;
}

/** Tick corto del eje: "3 may". */
export function formatDateTickEs(iso: string | null | undefined): string {
  const p = parseIsoDate(iso);
  if (!p) return iso?.slice(0, 10) ?? "";
  return `${p.d} ${MONTHS_SHORT[p.mo - 1]}`;
}

/**
 * Rango real de los datos: "Del 3 de mayo al 29 de julio de 2026".
 * El año se omite a la izquierda si coincide.
 */
export function formatDateRangeEs(
  fromIso: string | null | undefined,
  toIso: string | null | undefined
): string | null {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b) return formatDateEs(fromIso ?? toIso);
  if (a.y === b.y && a.mo === b.mo && a.d === b.d) {
    return formatDateEs(fromIso);
  }
  const left =
    a.y === b.y
      ? `${a.d} de ${MONTHS_LONG[a.mo - 1]}`
      : `${a.d} de ${MONTHS_LONG[a.mo - 1]} de ${a.y}`;
  const right = `${b.d} de ${MONTHS_LONG[b.mo - 1]} de ${b.y}`;
  return `Del ${left} al ${right}`;
}

export function formatRevisionHistorySub(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
  n: number
): string {
  const count = n === 1 ? "1 revisión" : `${n} revisiones`;
  const range = formatDateRangeEs(fromIso, toIso);
  return range ? `${range} · ${count}` : count;
}
