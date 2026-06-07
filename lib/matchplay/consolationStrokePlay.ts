import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchPlayConvocatoriaConfig } from "@/lib/matchplay/types";
import {
  CONSOLATION_BRACKET_NAME,
  getConsolationBracketId,
} from "@/lib/matchplay/consolationMatchPlay";

export const STROKE_AGG_NOTES_PREFIX = "STROKE AGREGADO · ";

/** Parejas perdedoras de R1, R2 y consolación MP (participan stroke agregado). */
export async function collectLoserPairIdsForStrokeAggregate(
  admin: SupabaseClient,
  tournamentId: string
): Promise<Set<string>> {
  const loserPairIds = new Set<string>();

  const { data: mainBracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mainBracket?.id) {
    const { data: mainDone } = await admin
      .from("matchplay_matches")
      .select("top_pair_id, bottom_pair_id, winner_pair_id, status")
      .eq("bracket_id", mainBracket.id)
      .in("round_no", [1, 2])
      .eq("status", "completed");
    for (const m of mainDone ?? []) {
      if (!m.winner_pair_id || !m.top_pair_id || !m.bottom_pair_id) continue;
      const loser =
        m.winner_pair_id === m.top_pair_id ? m.bottom_pair_id : m.top_pair_id;
      if (loser) loserPairIds.add(String(loser));
    }
  }

  const consolId = await getConsolationBracketId(admin, tournamentId);
  if (consolId) {
    const { data: consolDone } = await admin
      .from("matchplay_matches")
      .select("top_pair_id, bottom_pair_id, winner_pair_id, status")
      .eq("bracket_id", consolId)
      .eq("status", "completed");
    for (const m of consolDone ?? []) {
      if (!m.winner_pair_id || !m.top_pair_id || !m.bottom_pair_id) continue;
      const loser =
        m.winner_pair_id === m.top_pair_id ? m.bottom_pair_id : m.top_pair_id;
      if (loser) loserPairIds.add(String(loser));
    }
  }

  return loserPairIds;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseHHMM(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function formatHHMM(total: number): string {
  const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type StrokeGroupResult = {
  ok: boolean;
  created: number;
  roundNo: number | null;
  groups: Array<{
    groupNo: number;
    label: string;
    teeTime: string | null;
    entryIds: string[];
  }>;
  message: string;
};

/**
 * Crea las salidas de Stroke Play Agregado (consolación) en la última ronda
 * del torneo. Participan los JUGADORES de las parejas que perdieron en R1, R2
 * y en la consolación Match Play. Se agrupan por género en foursomes random
 * de 4 (los integrantes de una misma pareja quedan en grupos distintos porque
 * son de géneros distintos en parejas mixtas).
 *
 * Las salidas se colocan después de los grupos ya existentes en esa ronda
 * (finales principal y de consolación), con `notes` = "STROKE AGREGADO · …".
 */
export async function createStrokeAggregateGroups(
  admin: SupabaseClient,
  tournamentId: string,
  opts?: { groupSize?: number; replace?: boolean }
): Promise<StrokeGroupResult> {
  const groupSize = opts?.groupSize && opts.groupSize > 0 ? opts.groupSize : 4;

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json, bracket_main_pairs, max_pairs_per_category")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const cfg = (rulesRow?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const strokeRule = (Array.isArray(cfg.consolations) ? cfg.consolations : []).find(
    (r) => r.enabled && r.consolation_format === "stroke_play_aggregate"
  );
  if (!strokeRule) {
    return {
      ok: false,
      created: 0,
      roundNo: null,
      groups: [],
      message: "Este torneo no tiene consolación Stroke Play Agregado configurada.",
    };
  }

  // Cuadro principal y tamaño → última ronda.
  const { data: mainBracket } = await admin
    .from("matchplay_brackets")
    .select("id, config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mainBracket?.id) {
    return {
      ok: false,
      created: 0,
      roundNo: null,
      groups: [],
      message: "No hay cuadro principal publicado.",
    };
  }
  let bracketSize =
    (mainBracket.config_json as { bracket_size?: number } | null)?.bracket_size ?? 0;
  if (bracketSize < 2) {
    const pairs =
      rulesRow?.bracket_main_pairs ?? rulesRow?.max_pairs_per_category ?? 0;
    let p = 2;
    while (p < pairs) p *= 2;
    bracketSize = p >= 2 ? p : 0;
  }
  const lastRoundNo = Math.max(
    1,
    Math.round(Math.log2(Math.max(2, bracketSize)))
  );

  const loserPairIds = await collectLoserPairIdsForStrokeAggregate(
    admin,
    tournamentId
  );

  if (loserPairIds.size === 0) {
    return {
      ok: true,
      created: 0,
      roundNo: lastRoundNo,
      groups: [],
      message:
        "Aún no hay parejas perdedoras de R1, R2 o consolación MP cerradas.",
    };
  }

  // entry_ids de los jugadores de esas parejas.
  const { data: pairTeams } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id")
    .in("id", Array.from(loserPairIds));
  const entryIds = new Set<string>();
  for (const t of pairTeams ?? []) {
    if (t.player_a_entry_id) entryIds.add(String(t.player_a_entry_id));
    if (t.player_b_entry_id) entryIds.add(String(t.player_b_entry_id));
  }
  if (entryIds.size === 0) {
    return {
      ok: true,
      created: 0,
      roundNo: lastRoundNo,
      groups: [],
      message: "No se encontraron jugadores en las parejas perdedoras.",
    };
  }

  // Género de cada jugador (entry → player → gender).
  const { data: entries } = await admin
    .from("tournament_entries")
    .select("id, player_id")
    .in("id", Array.from(entryIds));
  const playerByEntry = new Map<string, string>();
  const playerIds = new Set<string>();
  for (const e of entries ?? []) {
    if (e.player_id) {
      playerByEntry.set(String(e.id), String(e.player_id));
      playerIds.add(String(e.player_id));
    }
  }
  const { data: players } = await admin
    .from("players")
    .select("id, gender")
    .in("id", Array.from(playerIds));
  const genderByPlayer = new Map<string, string>();
  for (const p of players ?? []) {
    genderByPlayer.set(String(p.id), String(p.gender ?? "X").toUpperCase());
  }

  const males: string[] = [];
  const females: string[] = [];
  const others: string[] = [];
  for (const entryId of entryIds) {
    const pid = playerByEntry.get(entryId);
    const g = pid ? genderByPlayer.get(pid) ?? "X" : "X";
    if (g === "M") males.push(entryId);
    else if (g === "F") females.push(entryId);
    else others.push(entryId);
  }

  // Ronda destino (última ronda).
  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", tournamentId)
    .eq("round_no", lastRoundNo)
    .maybeSingle();
  if (!roundRow?.id) {
    return {
      ok: false,
      created: 0,
      roundNo: lastRoundNo,
      groups: [],
      message: `No existe la ronda ${lastRoundNo} en el calendario.`,
    };
  }
  const roundId = String(roundRow.id);
  const baseMinutes = roundRow.start_time
    ? parseHHMM(String(roundRow.start_time))
    : null;
  const interval =
    typeof roundRow.interval_minutes === "number" && roundRow.interval_minutes > 0
      ? Math.trunc(roundRow.interval_minutes)
      : 10;

  // Si replace: borrar salidas stroke previas en esta ronda.
  if (opts?.replace) {
    const { data: prev } = await admin
      .from("pairing_groups")
      .select("id, notes")
      .eq("round_id", roundId)
      .ilike("notes", `${STROKE_AGG_NOTES_PREFIX}%`);
    const ids = (prev ?? []).map((g) => String(g.id));
    if (ids.length > 0) {
      await admin.from("pairing_group_members").delete().in("group_id", ids);
      await admin.from("pairing_groups").delete().in("id", ids);
    }
  }

  // group_no de arranque: después del máximo existente en la ronda.
  const { data: existingGroups } = await admin
    .from("pairing_groups")
    .select("group_no")
    .eq("round_id", roundId);
  let nextGroupNo =
    Math.max(0, ...(existingGroups ?? []).map((g) => Number(g.group_no) || 0)) + 1;

  // Construir foursomes por género (random) + restos.
  const chunks: Array<{ label: string; members: string[] }> = [];
  const pushChunks = (label: string, list: string[]) => {
    const shuffled = shuffle(list);
    for (let i = 0; i < shuffled.length; i += groupSize) {
      chunks.push({ label, members: shuffled.slice(i, i + groupSize) });
    }
  };
  pushChunks("Hombres", males);
  pushChunks("Mujeres", females);
  if (others.length > 0) pushChunks("Mixto", others);

  const created: StrokeGroupResult["groups"] = [];
  for (const chunk of chunks) {
    const groupNo = nextGroupNo++;
    const teeTime =
      baseMinutes != null
        ? formatHHMM(baseMinutes + (groupNo - 1) * interval)
        : null;
    const notes = `${STROKE_AGG_NOTES_PREFIX}${chunk.label}`;

    const { data: inserted, error: insErr } = await admin
      .from("pairing_groups")
      .insert({
        round_id: roundId,
        group_no: groupNo,
        tee_time: teeTime,
        starting_hole: 10,
        notes,
      })
      .select("id")
      .single();
    if (insErr || !inserted?.id) {
      console.error("[strokeAggregate] insert group:", insErr?.message);
      continue;
    }
    const groupRecordId = String(inserted.id);
    await admin.from("pairing_group_members").insert(
      chunk.members.map((entry_id, idx) => ({
        group_id: groupRecordId,
        entry_id,
        position: idx + 1,
      }))
    );
    created.push({
      groupNo,
      label: chunk.label,
      teeTime,
      entryIds: chunk.members,
    });
  }

  return {
    ok: true,
    created: created.length,
    roundNo: lastRoundNo,
    groups: created,
    message: `${created.length} salida(s) de Stroke Play Agregado creada(s) en R${lastRoundNo} (${males.length} hombres, ${females.length} mujeres${others.length > 0 ? `, ${others.length} sin género` : ""}).`,
  };
}
