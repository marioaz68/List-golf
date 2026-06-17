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

const STORAGE_PREFIX = "listgolf-player-bag-v1";

/** Bolsa inicial típica; el resto del catálogo queda disponible para activar. */
const DEFAULT_ENABLED = new Set([
  "driver",
  "3w",
  "5w",
  "4h",
  "5h",
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

export function loadPlayerBag(scope?: string): PlayerBag {
  if (typeof window === "undefined") return defaultPlayerBag();
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
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

export function savePlayerBag(bag: PlayerBag, scope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(bag));
  } catch {
    /* modo privado / cuota */
  }
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
  return {
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
  };
}

export function getEnabledBagClubs(bag: PlayerBag): PlayerBagClub[] {
  return bag.clubs.filter((c) => {
    if (!c.enabled) return false;
    const cat = CLUB_BY_ID[c.catalogId];
    return cat != null && cat.defaultYardsFull > 0;
  });
}

export function clubLabel(catalogId: string): string {
  return CLUB_BY_ID[catalogId]?.shortLabel ?? catalogId;
}

export function clubFullLabel(catalogId: string): string {
  return CLUB_BY_ID[catalogId]?.label ?? catalogId;
}

export { type SwingKind };
