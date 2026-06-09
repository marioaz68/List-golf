/**
 * Resuelve los clientes (jugadores + caddies) más cercanos a un venue (típicamente
 * un carrito bar) usando los pings recientes de ritmo_positions.
 *
 * Uso: el operador del carrito quiere capturar un pedido verbal sin escribir
 * el nombre — el sistema le ofrece la lista de quienes están parados al lado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NearbyClient {
  /** Key estable para la UI: "e:<entryId>" o "c:<caddieId>" */
  key: string;
  kind: "player" | "caddie";
  entryId: string | null;
  caddieId: string | null;
  name: string;
  groupNo: number | null;
  tournamentName: string;
  /** Distancia al carrito en metros. */
  distanceMeters: number;
  /** Hoyo donde estaba el cliente según último ping. */
  currentHole: number | null;
  lastSeenAgoMin: number;
}

interface Options {
  /** Distancia máxima en metros para considerar "cerca". Default 300m. */
  maxMeters?: number;
  /** Máximo de resultados a regresar. Default 8. */
  maxResults?: number;
  /** Antigüedad máxima del ping del cliente en min. Default 30. */
  maxAgeMinutes?: number;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function loadNearbyClients(
  admin: SupabaseClient,
  venueCode: string,
  opts: Options = {}
): Promise<{
  cartLocated: boolean;
  cartHole: number | null;
  cartLastSeenAgoMin: number | null;
  clients: NearbyClient[];
}> {
  const maxMeters = opts.maxMeters ?? 300;
  const maxResults = opts.maxResults ?? 8;
  const maxAgeMinutes = opts.maxAgeMinutes ?? 30;

  // 1. Resolver venue por code
  const { data: venue } = await admin
    .from("fb_venues")
    .select("id, type")
    .eq("code", venueCode)
    .maybeSingle();
  if (!venue) {
    return { cartLocated: false, cartHole: null, cartLastSeenAgoMin: null, clients: [] };
  }
  const venueId = String((venue as { id: string }).id);

  // 2. Último ping del carrito (últimos 15 min)
  const cartCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: cartPings } = await admin
    .from("ritmo_positions")
    .select("lat, lon, hoyo_detectado, ts")
    .eq("fb_venue_id", venueId)
    .gte("ts", cartCutoff)
    .order("ts", { ascending: false })
    .limit(1);
  const cartPos = (cartPings ?? [])[0] as
    | { lat: number; lon: number; hoyo_detectado: number | null; ts: string }
    | undefined;
  if (!cartPos) {
    return { cartLocated: false, cartHole: null, cartLastSeenAgoMin: null, clients: [] };
  }
  const cartLat = Number(cartPos.lat);
  const cartLon = Number(cartPos.lon);
  const cartHole = cartPos.hoyo_detectado != null ? Number(cartPos.hoyo_detectado) : null;
  const cartLastSeenAgoMin = Math.round(
    (Date.now() - new Date(cartPos.ts).getTime()) / 60000
  );

  // 3. Pings recientes de jugadores y caddies (últimos N min)
  const pingCutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { data: pingsRaw } = await admin
    .from("ritmo_positions")
    .select(
      "player_id, telegram_user_id, group_id, tournament_id, lat, lon, hoyo_detectado, ts"
    )
    .or("player_id.not.is.null,telegram_user_id.not.is.null")
    .gte("ts", pingCutoff)
    .order("ts", { ascending: false });

  // Quedarse con el último ping por (player_id o telegram_user_id)
  type Ping = {
    playerId: string | null;
    tgId: string | null;
    groupId: string | null;
    tournamentId: string | null;
    lat: number;
    lon: number;
    hoyo: number | null;
    ts: string;
  };
  const byKey = new Map<string, Ping>();
  for (const p of (pingsRaw ?? []) as Array<Record<string, unknown>>) {
    const playerId = p.player_id ? String(p.player_id) : null;
    const tgId = p.telegram_user_id ? String(p.telegram_user_id) : null;
    const k = playerId ? `p:${playerId}` : tgId ? `t:${tgId}` : null;
    if (!k) continue;
    if (byKey.has(k)) continue; // ya tenemos el más reciente (orden DESC)
    byKey.set(k, {
      playerId,
      tgId,
      groupId: p.group_id ? String(p.group_id) : null,
      tournamentId: p.tournament_id ? String(p.tournament_id) : null,
      lat: Number(p.lat),
      lon: Number(p.lon),
      hoyo: p.hoyo_detectado != null ? Number(p.hoyo_detectado) : null,
      ts: String(p.ts),
    });
  }

  if (byKey.size === 0) {
    return { cartLocated: true, cartHole, cartLastSeenAgoMin, clients: [] };
  }

  // 4. Calcular distancias y filtrar por radio
  type WithDist = Ping & { distance: number };
  const nearby: WithDist[] = [];
  for (const p of byKey.values()) {
    const d = haversineMeters(cartLat, cartLon, p.lat, p.lon);
    if (d <= maxMeters) nearby.push({ ...p, distance: d });
  }
  nearby.sort((a, b) => a.distance - b.distance);
  const candidates = nearby.slice(0, maxResults * 2); // colchón por filtros

  if (candidates.length === 0) {
    return { cartLocated: true, cartHole, cartLastSeenAgoMin, clients: [] };
  }

  // 5. Resolver player_id → entry_id activo + nombre del jugador + grupo
  // 6. Resolver telegram_user_id → caddie (si player no aplica)
  const playerIds = Array.from(
    new Set(candidates.map((c) => c.playerId).filter(Boolean) as string[])
  );
  const tgIds = Array.from(
    new Set(
      candidates
        .filter((c) => !c.playerId && c.tgId)
        .map((c) => c.tgId) as string[]
    )
  );

  // Players: cargar nombre + entries activos
  const playerInfo = new Map<
    string,
    {
      name: string;
      entriesByTournament: Map<string, string>; // tournament_id → entry_id
    }
  >();
  if (playerIds.length > 0) {
    const { data: players } = await admin
      .from("players")
      .select("id, first_name, last_name")
      .in("id", playerIds);
    for (const pl of (players ?? []) as Array<Record<string, unknown>>) {
      const id = String(pl.id);
      const full = [pl.first_name, pl.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ");
      playerInfo.set(id, {
        name: full || "Jugador",
        entriesByTournament: new Map(),
      });
    }
    // Sus entries (todos los torneos activos)
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("id, player_id, tournament_id")
      .in("player_id", playerIds);
    for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
      const info = playerInfo.get(String(e.player_id));
      if (!info) continue;
      info.entriesByTournament.set(
        String(e.tournament_id),
        String(e.id)
      );
    }
  }

  // Tournament names (para mostrar contexto)
  const tournamentIds = Array.from(
    new Set(candidates.map((c) => c.tournamentId).filter(Boolean) as string[])
  );
  const tournamentNameById = new Map<string, string>();
  if (tournamentIds.length > 0) {
    const { data: tournaments } = await admin
      .from("tournaments")
      .select("id, name")
      .in("id", tournamentIds);
    for (const t of (tournaments ?? []) as Array<Record<string, unknown>>) {
      tournamentNameById.set(String(t.id), String(t.name ?? "Torneo"));
    }
  }

  // Grupos: group_id → group_no
  const groupIds = Array.from(
    new Set(candidates.map((c) => c.groupId).filter(Boolean) as string[])
  );
  const groupNoById = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from("pairing_groups")
      .select("id, group_no")
      .in("id", groupIds);
    for (const g of (groups ?? []) as Array<Record<string, unknown>>) {
      if (g.group_no != null) {
        groupNoById.set(String(g.id), Number(g.group_no));
      }
    }
  }

  // Caddies: telegram_user_id → nombre
  const caddieInfo = new Map<
    string,
    { id: string; name: string }
  >();
  if (tgIds.length > 0) {
    const { data: caddies } = await admin
      .from("caddies")
      .select("id, first_name, last_name, telegram_user_id")
      .in("telegram_user_id", tgIds);
    for (const c of (caddies ?? []) as Array<Record<string, unknown>>) {
      const tg = String(c.telegram_user_id);
      const full = [c.first_name, c.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ");
      caddieInfo.set(tg, { id: String(c.id), name: full || "Caddie" });
    }
  }

  // 7. Construir lista final
  const now = Date.now();
  const seen = new Set<string>();
  const out: NearbyClient[] = [];
  for (const cand of candidates) {
    if (out.length >= maxResults) break;

    if (cand.playerId) {
      const info = playerInfo.get(cand.playerId);
      if (!info) continue;
      // Preferir entry del tournament_id del ping; si no hay, cualquier entry
      const entryId =
        (cand.tournamentId && info.entriesByTournament.get(cand.tournamentId)) ||
        info.entriesByTournament.values().next().value ||
        null;
      if (!entryId) continue;
      const key = `e:${entryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const groupNo = cand.groupId
        ? groupNoById.get(cand.groupId) ?? null
        : null;
      const tournamentName = cand.tournamentId
        ? tournamentNameById.get(cand.tournamentId) ?? ""
        : "";
      out.push({
        key,
        kind: "player",
        entryId,
        caddieId: null,
        name: info.name,
        groupNo,
        tournamentName,
        distanceMeters: Math.round(cand.distance),
        currentHole: cand.hoyo,
        lastSeenAgoMin: Math.round(
          (now - new Date(cand.ts).getTime()) / 60000
        ),
      });
    } else if (cand.tgId) {
      const c = caddieInfo.get(cand.tgId);
      if (!c) continue;
      const key = `c:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        kind: "caddie",
        entryId: null,
        caddieId: c.id,
        name: c.name,
        groupNo: null,
        tournamentName: "Caddie",
        distanceMeters: Math.round(cand.distance),
        currentHole: cand.hoyo,
        lastSeenAgoMin: Math.round(
          (now - new Date(cand.ts).getTime()) / 60000
        ),
      });
    }
  }

  return { cartLocated: true, cartHole, cartLastSeenAgoMin, clients: out };
}
