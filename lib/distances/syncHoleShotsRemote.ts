import type { HoleShotsStore } from "@/lib/distances/holeShots";
import { mergeHoleShotsStores } from "@/lib/distances/holeShots";

export interface HoleShotsSyncContext {
  entryId?: string | null;
  caddieId?: string | null;
  telegramUserId?: string | null;
  /** Demo u offline forzado: no escribe en servidor. */
  disabled?: boolean;
}

let syncCtx: HoleShotsSyncContext | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSync: {
  store: HoleShotsStore;
  scope?: string;
} | null = null;

function scopeKey(scope?: string, ctx?: HoleShotsSyncContext | null): string | null {
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

export function configureHoleShotsSync(ctx: HoleShotsSyncContext | null): void {
  syncCtx = ctx;
}

export function queueHoleShotsRemoteSync(
  store: HoleShotsStore,
  scope?: string
): void {
  if (typeof window === "undefined") return;
  if (syncCtx?.disabled) return;
  const key = scopeKey(scope, syncCtx);
  if (!key) return;

  pendingSync = { store, scope };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void flushHoleShotsRemoteSync();
  }, 450);
}

async function flushHoleShotsRemoteSync(): Promise<void> {
  const job = pendingSync;
  pendingSync = null;
  syncTimer = null;
  if (!job || syncCtx?.disabled) return;

  const key = scopeKey(job.scope, syncCtx);
  if (!key) return;

  try {
    await fetch("/api/captura/distancias/shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        scope_key: key,
        entry_id: syncCtx?.entryId ?? null,
        caddie_id: syncCtx?.caddieId ?? null,
        telegram_user_id: syncCtx?.telegramUserId ?? null,
        payload: job.store,
      }),
    });
  } catch {
    /* sin red: localStorage sigue siendo la copia de trabajo */
  }
}

/** Descarga snapshot del servidor y lo fusiona con la copia local. */
export async function loadHoleShotsMerged(
  local: HoleShotsStore,
  scope?: string,
  ctx?: HoleShotsSyncContext | null
): Promise<HoleShotsStore> {
  if (typeof window === "undefined" || ctx?.disabled) return local;

  const key = scopeKey(scope, ctx ?? syncCtx);
  if (!key) return local;

  try {
    const res = await fetch(
      `/api/captura/distancias/shots?scope_key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return local;
    const data = (await res.json()) as {
      ok?: boolean;
      payload?: HoleShotsStore | null;
    };
    if (!data.ok || !data.payload?.byHole) return local;
    return mergeHoleShotsStores(local, data.payload);
  } catch {
    return local;
  }
}
