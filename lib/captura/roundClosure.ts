export function mexicoTodayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function isRoundClosedByDate(
  roundDate: string | null | undefined,
  todayYmd: string = mexicoTodayYmd()
): boolean {
  const rd = String(roundDate ?? "").trim();
  if (!rd) return false;
  return rd < todayYmd;
}
