import {
  CLUB_CATALOG,
  CLUB_BY_ID,
  defaultThreeQuarterYards,
  type SwingKind,
} from "@/lib/distances/clubCatalog";

export interface PlayerBagClub {
  catalogId: string;
  enabled: boolean;
  yardsFull: number;
  yardsThreeQuarter: number;
}

export interface PlayerBag {
  version: 1;
  clubs: PlayerBagClub[];
}

export interface PlayerBagSyncContext {
  entryId?: string | null;
  caddieId?: string | null;
  telegramUserId?: string | null;
  disabled?: boolean;
}

const STORAGE_PREFIX = "listgolf-player-bag-v1";
const PENDING_BAG_SYNC_STORAGE_KEY = "listgolf-pending-player-bag-sync-v1";
let bagSyncContext: PlayerBagSyncContext | null = null;
let bagSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBagSync: {
  bag: PlayerBag;
  scope?: string;
  ctx?: PlayerBagSyncContext | null;
} | null = null;

interface PendingPlayerBagSyncEntry {
  scopeKey: string;
  entryId: string | null;
  caddieId: string | null;
  telegramUserId: string | null;
  payload: PlayerBag;
  createdAt: string;
}

/** Bolsa inicial típica; el resto del catálogo queda disponible para activar. */
const DEFAULT_ENABLED = new Set([
  "driver",
  "3w",
  "5w",
  "4h",
  "5h",
  "4i",
  "5i",
  "6i",
  "7i",
  "8i",
  "9i",
  "pw",
  "w52",
  "sw",
  "lw",
  "putter",
]);

/** IDs viejos → nuevos (cuñas por grado). */
const LEGACY_CLUB_IDS: Record<string, string> = {
  gw: "w52",
};

export function defaultPlayerBag(): PlayerBag {
  return {
    version: 1,
    clubs: CLUB_CATALOG.map((c) => ({
      catalogId: c.id,
      enabled: DEFAULT_ENABLED.has(c.id),
      yardsFull: c.defaultYardsFull,
      yardsThreeQuarter: defaultThreeQuarterYards(c.defaultYardsFull),
    })),
  };
}

function storageKey(scope?: string): string {
  const s = scope?.trim();
  return s ? `${STORAGE_PREFIX}:${s}` : STORAGE_PREFIX;
}

function resolveBagScope(
  scope?: string,
  ctx?: PlayerBagSyncContext | null
): string | null {
  const s = scope?.trim();
  if (s) return s;
  const entry = ctx?.entryId?.trim();
  if (entry) return entry;
  const tg = ctx?.telegramUserId?.trim();
  if (tg) return tg;
  const caddie = ctx?.caddieId?.trim();
  if (caddie) return `caddie:${caddie}`;
  return null;
}

function loadPendingPlayerBagSyncEntries(): PendingPlayerBagSyncEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_BAG_SYNC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingPlayerBagSyncEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingPlayerBagSyncEntries(entries: PendingPlayerBagSyncEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_BAG_SYNC_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {
    /* modo privado / cuota */
  }
}

function upsertPendingPlayerBagSync(entry: PendingPlayerBagSyncEntry): void {
  const entries = loadPendingPlayerBagSyncEntries();
  const next = entries.filter((item) => item.scopeKey !== entry.scopeKey);
  next.push(entry);
  savePendingPlayerBagSyncEntries(next);
}

function removePendingPlayerBagSync(scopeKey: string): void {
  const entries = loadPendingPlayerBagSyncEntries();
  savePendingPlayerBagSyncEntries(
    entries.filter((item) => item.scopeKey !== scopeKey)
  );
}

export function configurePlayerBagSync(ctx: PlayerBagSyncContext | null): void {
  bagSyncContext = ctx;
}

export function retryPendingPlayerBagSync(): void {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void flushPlayerBagRemoteSync();
}

export function queuePlayerBagRemoteSync(
  bag: PlayerBag,
  scope?: string,
  ctx?: PlayerBagSyncContext | null
): void {
  if (typeof window === "undefined") return;
  const activeCtx = ctx ?? bagSyncContext;
  if (activeCtx?.disabled) return;
  const key = resolveBagScope(scope, activeCtx);
  if (!key) return;

  pendingBagSync = { bag, scope, ctx: activeCtx };
  upsertPendingPlayerBagSync({
    scopeKey: key,
    entryId: activeCtx?.entryId ?? null,
    caddieId: activeCtx?.caddieId ?? null,
    telegramUserId: activeCtx?.telegramUserId ?? null,
    payload: bag,
    createdAt: new Date().toISOString(),
  });
  if (bagSyncTimer) clearTimeout(bagSyncTimer);
  bagSyncTimer = setTimeout(() => {
    void flushPlayerBagRemoteSync();
  }, 450);
}

async function flushPlayerBagRemoteSync(): Promise<void> {
  const job = pendingBagSync;
  pendingBagSync = null;
  bagSyncTimer = null;
  const pendingEntries = loadPendingPlayerBagSyncEntries();
  if (!job && pendingEntries.length === 0) return;

  const activeCtx = job?.ctx ?? bagSyncContext;
  if (activeCtx?.disabled) return;

  const candidates = job
    ? [
        {
          scopeKey: resolveBagScope(job.scope, activeCtx),
          entryId: activeCtx?.entryId ?? null,
          caddieId: activeCtx?.caddieId ?? null,
          telegramUserId: activeCtx?.telegramUserId ?? null,
          payload: job.bag,
          createdAt: new Date().toISOString(),
        },
      ].filter((entry): entry is PendingPlayerBagSyncEntry => Boolean(entry.scopeKey))
    : pendingEntries;

  for (const entry of candidates) {
    try {
      const res = await fetch("/api/captura/distancias/bag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          scope_key: entry.scopeKey,
          entry_id: entry.entryId,
          caddie_id: entry.caddieId,
          telegram_user_id: entry.telegramUserId,
          payload: entry.payload,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      removePendingPlayerBagSync(entry.scopeKey);
    } catch {
      /* sin red: queda en la cola local para reintento */
    }
  }
}

export async function loadPlayerBagRemote(
  scope?: string,
  ctx?: PlayerBagSyncContext | null
): Promise<PlayerBag | null> {
  if (typeof window === "undefined") return null;
  const activeCtx = ctx ?? bagSyncContext;
  if (activeCtx?.disabled) return null;
  const key = resolveBagScope(scope, activeCtx);
  if (!key) return null;

  try {
    const res = await fetch(
      `/api/captura/distancias/bag?scope_key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; payload?: PlayerBag | null };
    if (!data.ok || !data.payload?.clubs) return null;
    return mergeWithCatalog(data.payload);
  } catch {
    return null;
  }
}

export function loadPlayerBag(scope?: string): PlayerBag {
  if (typeof window === "undefined") return defaultPlayerBag();
  try {
    const scopedKey = scope?.trim() ? storageKey(scope.trim()) : null;
    if (scopedKey) {
      const scopedRaw = window.localStorage.getItem(scopedKey);
      if (scopedRaw) {
        const parsed = JSON.parse(scopedRaw) as PlayerBag;
        if (parsed?.version === 1 && Array.isArray(parsed.clubs)) {
          return mergeWithCatalog(parsed);
        }
      }
      // Misma bolsa que sin ?tg= si aún no guardaste con el id de Telegram.
      return loadPlayerBag(undefined);
    }
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return defaultPlayerBag();
    const parsed = JSON.parse(raw) as PlayerBag;
    if (parsed?.version !== 1 || !Array.isArray(parsed.clubs)) {
      return defaultPlayerBag();
    }
    return mergeWithCatalog(parsed);
  } catch {
    return defaultPlayerBag();
  }
}

export function savePlayerBag(
  bag: PlayerBag,
  scope?: string,
  ctx?: PlayerBagSyncContext | null
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(bag));
  } catch {
    /* modo privado / cuota */
  }
  queuePlayerBagRemoteSync(bag, scope, ctx ?? bagSyncContext);
}

/** Añade bastones nuevos del catálogo, migra ids viejos y elimina obsoletos. */
function mergeWithCatalog(bag: PlayerBag): PlayerBag {
  const byId = new Map<string, PlayerBagClub>();
  for (const c of bag.clubs) {
    const id = LEGACY_CLUB_IDS[c.catalogId] ?? c.catalogId;
    if (!CLUB_BY_ID[id]) continue;
    const prev = byId.get(id);
    if (!prev || (c.enabled && !prev.enabled)) {
      byId.set(id, { ...c, catalogId: id });
    }
  }
  return migrateTypicalIrons({
    version: 1,
    clubs: CLUB_CATALOG.map((cat) => {
      const existing = byId.get(cat.id);
      if (existing) return existing;
      return {
        catalogId: cat.id,
        enabled: DEFAULT_ENABLED.has(cat.id),
        yardsFull: cat.defaultYardsFull,
        yardsThreeQuarter: defaultThreeQuarterYards(cat.defaultYardsFull),
      };
    }),
  });
}

/** Si ya juegas 6i–9i, activa 4i/5i en bolsas guardadas sin esos hierros. */
function migrateTypicalIrons(bag: PlayerBag): PlayerBag {
  const byId = new Map(bag.clubs.map((c) => [c.catalogId, c]));
  const midIronsOn = ["6i", "7i", "8i", "9i"].every((id) => byId.get(id)?.enabled);
  if (!midIronsOn) return bag;

  let changed = false;
  const clubs = bag.clubs.map((c) => {
    if ((c.catalogId === "4i" || c.catalogId === "5i") && !c.enabled) {
      changed = true;
      return { ...c, enabled: true };
    }
    return c;
  });
  return changed ? { ...bag, clubs } : bag;
}

function sortBagClubs(clubs: PlayerBagClub[]): PlayerBagClub[] {
  return [...clubs].sort(
    (a, b) =>
      (CLUB_BY_ID[a.catalogId]?.sortOrder ?? 999) -
      (CLUB_BY_ID[b.catalogId]?.sortOrder ?? 999)
  );
}

export function getEnabledBagClubs(bag: PlayerBag): PlayerBagClub[] {
  return bag.clubs.filter((c) => {
    if (!c.enabled) return false;
    const cat = CLUB_BY_ID[c.catalogId];
    return cat != null && cat.defaultYardsFull > 0;
  });
}

/** Bastones del roll bar: incluye putter si está activo en la bolsa. */
export function getShotPlanBagClubs(bag: PlayerBag): PlayerBagClub[] {
  return sortBagClubs(
    bag.clubs.filter((c) => {
      if (!c.enabled) return false;
      const cat = CLUB_BY_ID[c.catalogId];
      if (!cat) return false;
      return cat.category === "putter" || cat.defaultYardsFull > 0;
    })
  );
}

export function clubLabel(catalogId: string): string {
  return CLUB_BY_ID[catalogId]?.shortLabel ?? catalogId;
}

export function clubFullLabel(catalogId: string): string {
  return CLUB_BY_ID[catalogId]?.label ?? catalogId;
}

export { type SwingKind };
