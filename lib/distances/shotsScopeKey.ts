/** Llave estable para yardage_shot_logs / sync de golpes. */
export function resolveShotsScopeKey(args: {
  scope?: string | null;
  entryId?: string | null;
  caddieId?: string | null;
  telegramUserId?: string | null;
}): string | null {
  const scope = args.scope?.trim();
  if (scope) return scope;
  const entry = args.entryId?.trim();
  if (entry) return entry;
  const tg = args.telegramUserId?.trim();
  if (tg) return tg;
  const caddie = args.caddieId?.trim();
  if (caddie) return `caddie:${caddie}`;
  return null;
}
