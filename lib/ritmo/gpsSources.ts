import type { SupabaseClient } from "@supabase/supabase-js";

export type GpsSourceInfo = {
  label: string;
  role: "caddie" | "player";
  state: "live" | "stale";
  /** Minutos desde el último ping de este dispositivo. */
  lastAgoMin: number | null;
};

export type GpsActorLookup = {
  byTelegram: Map<string, { label: string; role: "caddie" | "player" }>;
  byPlayerId: Map<string, { label: string; role: "player" }>;
};

type PositionPing = {
  ts: string;
  telegram_user_id: string | null;
  player_id: string | null;
};

function shortName(first: string | null, last: string | null, fallback: string): string {
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  return full || fallback;
}

/** Mapa telegram_user_id / player_id → nombre y rol (caddie o jugador). */
export async function loadGpsActorLookup(
  admin: SupabaseClient,
  tournamentId: string,
  roundId: string,
  entryIds: string[]
): Promise<GpsActorLookup> {
  const byTelegram = new Map<string, { label: string; role: "caddie" | "player" }>();
  const byPlayerId = new Map<string, { label: string; role: "player" }>();

  if (entryIds.length === 0) {
    return { byTelegram, byPlayerId };
  }

  const { data: caRaw } = await admin
    .from("caddie_assignments")
    .select(
      `entry_id,
       caddies ( id, first_name, last_name, telegram )`
    )
    .eq("tournament_id", tournamentId)
    .eq("round_id", roundId)
    .eq("is_active", true)
    .in("entry_id", entryIds);

  type CaRow = {
    caddies:
      | {
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram: string | null;
        }
      | {
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram: string | null;
        }[]
      | null;
  };

  const seenCaddie = new Set<string>();
  for (const row of (caRaw ?? []) as unknown as CaRow[]) {
    const c = Array.isArray(row.caddies) ? row.caddies[0] : row.caddies;
    if (!c || seenCaddie.has(c.id)) continue;
    seenCaddie.add(c.id);
    const label = shortName(c.first_name, c.last_name, "Caddie");
    const tg = String(c.telegram ?? "").trim();
    if (/^\d+$/.test(tg)) {
      byTelegram.set(tg, { label, role: "caddie" });
    }
  }

  const { data: entriesRaw } = await admin
    .from("tournament_entries")
    .select("id, player_id, players ( id, first_name, last_name, telegram_user_id )")
    .in("id", entryIds);

  type ERow = {
    player_id: string;
    players:
      | {
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram_user_id: string | null;
        }
      | {
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram_user_id: string | null;
        }[]
      | null;
  };

  for (const e of (entriesRaw ?? []) as unknown as ERow[]) {
    const p = Array.isArray(e.players) ? e.players[0] : e.players;
    if (!p) continue;
    const label = shortName(p.first_name, p.last_name, "Jugador");
    byPlayerId.set(p.id, { label, role: "player" });
    const tg = String(p.telegram_user_id ?? "").trim();
    if (/^\d+$/.test(tg)) {
      byTelegram.set(tg, { label, role: "player" });
    }
  }

  return { byTelegram, byPlayerId };
}

/** Quién mandó GPS recientemente en este grupo (por dispositivo). */
export function resolveGpsSources(
  positions: PositionPing[],
  lookup: GpsActorLookup,
  now: Date,
  liveMinutes = 12,
  expireMinutes = 45
): GpsSourceInfo[] {
  const latestByKey = new Map<
    string,
    { ts: number; label: string; role: "caddie" | "player" }
  >();

  for (const p of positions) {
    const ts = new Date(p.ts).getTime();
    if (!Number.isFinite(ts)) continue;

    let key: string | null = null;
    let actor: { label: string; role: "caddie" | "player" } | null = null;

    const tg = String(p.telegram_user_id ?? "").trim();
    if (tg) {
      key = `tg:${tg}`;
      actor = lookup.byTelegram.get(tg) ?? {
        label: "Dispositivo",
        role: "player",
      };
    } else if (p.player_id) {
      key = `pl:${p.player_id}`;
      actor = lookup.byPlayerId.get(p.player_id) ?? {
        label: "Jugador",
        role: "player",
      };
    }

    if (!key || !actor) continue;
    const prev = latestByKey.get(key);
    if (!prev || ts > prev.ts) {
      latestByKey.set(key, { ts, label: actor.label, role: actor.role });
    }
  }

  const out: GpsSourceInfo[] = [];
  const nowMs = now.getTime();

  for (const { ts, label, role } of latestByKey.values()) {
    const ageMs = nowMs - ts;
    if (ageMs > expireMinutes * 60 * 1000) continue;
    const lastAgoMin = Math.max(0, Math.round(ageMs / 60000));
    const state: "live" | "stale" =
      ageMs <= liveMinutes * 60 * 1000 ? "live" : "stale";
    out.push({ label, role, state, lastAgoMin });
  }

  out.sort((a, b) => {
    const roleOrder = (r: GpsSourceInfo["role"]) => (r === "caddie" ? 0 : 1);
    const r = roleOrder(a.role) - roleOrder(b.role);
    if (r !== 0) return r;
    const s = (x: GpsSourceInfo["state"]) => (x === "live" ? 0 : 1);
    const st = s(a.state) - s(b.state);
    if (st !== 0) return st;
    return a.label.localeCompare(b.label);
  });

  return out;
}

/** Texto corto para tarjeta de grupo. */
export function formatCapturerGpsLine(args: {
  gpsSources: GpsSourceInfo[];
  caddieNames: string[];
  caddiesWithTelegram: number;
  scoreHolesPlayed: number;
}): { text: string; tone: "live" | "stale" | "off" | "na" } {
  const caddieLive = args.gpsSources.filter(
    (s) => s.role === "caddie" && s.state === "live"
  );
  const caddieStale = args.gpsSources.filter(
    (s) => s.role === "caddie" && s.state === "stale"
  );
  const playerLive = args.gpsSources.filter(
    (s) => s.role === "player" && s.state === "live"
  );

  if (caddieLive.length > 0) {
    const names = caddieLive.map((s) => s.label).join(", ");
    const ago = caddieLive[0]?.lastAgoMin;
    return {
      tone: "live",
      text:
        ago != null && ago < 2
          ? `Caddie ${names} · GPS en vivo`
          : `Caddie ${names} · GPS hace ${ago ?? "?"} min`,
    };
  }

  if (caddieStale.length > 0) {
    const names = caddieStale.map((s) => s.label).join(", ");
    const ago = caddieStale[0]?.lastAgoMin;
    return {
      tone: "stale",
      text: `Caddie ${names} · GPS viejo${ago != null ? ` (${ago} min)` : ""}`,
    };
  }

  if (playerLive.length > 0) {
    const names = playerLive.map((s) => s.label).join(", ");
    return {
      tone: "live",
      text: `Jugador ${names} con GPS (caddie sin señal)`,
    };
  }

  if (args.caddieNames.length === 0) {
    return { tone: "na", text: "Sin caddie asignado" };
  }

  if (args.caddiesWithTelegram === 0) {
    return {
      tone: "off",
      text: `Caddie ${args.caddieNames.join(", ")} · sin Telegram`,
    };
  }

  if (args.scoreHolesPlayed > 0) {
    return {
      tone: "off",
      text: `Capturando tarjeta · caddie sin GPS`,
    };
  }

  return {
    tone: "off",
    text: `Caddie ${args.caddieNames.join(", ")} · GPS apagado`,
  };
}
