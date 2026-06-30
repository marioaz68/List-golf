import type { PlayerBag } from "@/lib/distances/playerBag";

/** Mismo shape que HoleShotsSyncContext: identidad del jugador. */
export interface PlayerBagSyncContext {
  entryId?: string | null;
  caddieId?: string | null;
  telegramUserId?: string | null;
  /** Demo u offline: no toca el servidor. */
  disabled?: boolean;
}

function scopeKey(
  scope: string | undefined,
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

function isPlayerBag(raw: unknown): raw is PlayerBag {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as { clubs?: unknown };
  return Array.isArray(o.clubs);
}

/** Descarga la bolsa guardada del servidor para este jugador (o null). */
export async function loadPlayerBagRemote(
  scope: string | undefined,
  ctx: PlayerBagSyncContext
): Promise<PlayerBag | null> {
  if (typeof window === "undefined" || ctx.disabled) return null;
  const key = scopeKey(scope, ctx);
  if (!key) return null;
  try {
    const res = await fetch(
      `/api/captura/distancias/bag?scope_key=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; payload?: unknown };
    if (json?.ok && isPlayerBag(json.payload)) return json.payload;
    return null;
  } catch {
    return null;
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pending: {
  bag: PlayerBag;
  scope?: string;
  ctx: PlayerBagSyncContext;
} | null = null;

/** Sube la bolsa al servidor (debounced) — alta/edición persistente. */
export function queuePlayerBagRemoteSync(
  bag: PlayerBag,
  scope: string | undefined,
  ctx: PlayerBagSyncContext
): void {
  if (typeof window === "undefined" || ctx.disabled) return;
  if (scopeKey(scope, ctx) == null) return;
  pending = { bag, scope, ctx };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void flush();
  }, 450);
}

async function flush(): Promise<void> {
  const job = pending;
  pending = null;
  syncTimer = null;
  if (!job) return;
  const key = scopeKey(job.scope, job.ctx);
  if (!key) return;
  try {
    await fetch("/api/captura/distancias/bag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        scope_key: key,
        entry_id: job.ctx.entryId ?? null,
        caddie_id: job.ctx.caddieId ?? null,
        telegram_user_id: job.ctx.telegramUserId ?? null,
        payload: job.bag,
      }),
    });
  } catch {
    /* sin red: localStorage sigue siendo la copia de trabajo */
  }
}
