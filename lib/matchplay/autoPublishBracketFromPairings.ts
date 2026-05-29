import type { SupabaseClient } from "@supabase/supabase-js";
import { bracketCapacity, roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";

export type AutoPublishFromPairingsResult =
  | {
      ok: true;
      bracketId: string;
      teamCount: number;
      bracketSize: number;
      byeCount: number;
      pairedMatchesR1: number;
      message: string;
    }
  | { ok: false; error: string };

/**
 * Genera y publica el cuadro de match play usando los grupos de
 * pairing R1 como pares iniciales del bracket.
 *
 * Diferencia con `autoPublishBracket`:
 *  - No usa seeding por subasta/HI: lee los grupos del calendario
 *    `pairing_groups` con round_no=1 y los emparejamientos que ya hay
 *    son los matches R1 del cuadro.
 *  - Las parejas activas que no están en ningún grupo R1 quedan como
 *    BYE en R1 (avanzan automáticamente a R2 contra el ganador del
 *    grupo correspondiente, o reciben otro BYE si la pareja también
 *    es BYE).
 *
 * Útil cuando el comité ya armó los grupos manualmente para R1 y
 * espera que el bracket refleje esos enfrentamientos.
 */
export async function autoPublishBracketFromPairings(
  admin: SupabaseClient,
  tournamentId: string
): Promise<AutoPublishFromPairingsResult> {
  // 1. Grupos R1 del calendario
  const { data: r1Round } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("round_no", 1)
    .maybeSingle();
  if (!r1Round?.id) {
    return { ok: false, error: "El torneo no tiene ronda 1 configurada." };
  }
  const r1RoundId = String(r1Round.id);

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", r1RoundId)
    .order("group_no", { ascending: true });
  const groups = (groupsRaw ?? []) as Array<{ id: string; group_no: number | null }>;
  if (groups.length === 0) {
    return {
      ok: false,
      error:
        "No hay grupos en R1 del calendario. Asigna grupos primero o usa el seeding clásico.",
    };
  }

  // 2. Por cada grupo, obtener las 2 parejas (matchplay_pair_teams) que
  //    contienen a los 4 jugadores del grupo.
  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select("group_id, entry_id")
    .in(
      "group_id",
      groups.map((g) => g.id)
    );
  type Member = { group_id: string; entry_id: string };
  const members = (membersRaw ?? []) as Member[];
  const entriesByGroup = new Map<string, string[]>();
  for (const m of members) {
    const list = entriesByGroup.get(m.group_id) ?? [];
    list.push(m.entry_id);
    entriesByGroup.set(m.group_id, list);
  }

  // 3. Todas las parejas activas
  const { data: pairsRaw } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);
  type Pair = {
    id: string;
    player_a_entry_id: string | null;
    player_b_entry_id: string | null;
    seed: number | null;
  };
  const allPairs = (pairsRaw ?? []) as Pair[];
  if (allPairs.length < 2) {
    return { ok: false, error: "Se necesitan al menos 2 parejas activas." };
  }

  // 4. Mapear: grupo → [pair_id_top, pair_id_bottom]
  type GroupPair = { groupNo: number | null; topPairId: string; bottomPairId: string };
  const groupedMatches: GroupPair[] = [];
  const pairsUsedInGroups = new Set<string>();
  for (const g of groups) {
    const entryIds = entriesByGroup.get(g.id) ?? [];
    if (entryIds.length < 4) continue;
    // Buscar 2 parejas distintas que cubran los 4 entry_ids del grupo
    const candidatePairs = allPairs.filter(
      (p) =>
        (p.player_a_entry_id && entryIds.includes(p.player_a_entry_id)) ||
        (p.player_b_entry_id && entryIds.includes(p.player_b_entry_id))
    );
    if (candidatePairs.length < 2) continue;
    // Encontrar par de parejas cuyos 4 entry_ids sean los del grupo.
    let top: Pair | null = null;
    let bottom: Pair | null = null;
    outer: for (let i = 0; i < candidatePairs.length; i++) {
      for (let j = i + 1; j < candidatePairs.length; j++) {
        const a = candidatePairs[i];
        const b = candidatePairs[j];
        const combined = new Set(
          [
            a.player_a_entry_id,
            a.player_b_entry_id,
            b.player_a_entry_id,
            b.player_b_entry_id,
          ].filter((v): v is string => !!v)
        );
        if (combined.size === 4 && entryIds.every((eid) => combined.has(eid))) {
          top = a;
          bottom = b;
          break outer;
        }
      }
    }
    if (top && bottom) {
      groupedMatches.push({
        groupNo: g.group_no,
        topPairId: top.id,
        bottomPairId: bottom.id,
      });
      pairsUsedInGroups.add(top.id);
      pairsUsedInGroups.add(bottom.id);
    }
  }

  if (groupedMatches.length === 0) {
    return {
      ok: false,
      error: "No pude identificar parejas válidas para los grupos R1.",
    };
  }

  // 5. Parejas sin grupo R1 → BYE en R1.
  const byePairs = allPairs.filter((p) => !pairsUsedInGroups.has(p.id));

  // 6. Calcular tamaño del cuadro: necesitamos
  //    `groupedMatches.length` matches scheduled + byePairs BYEs.
  //    R1 size = potencia de 2 >= groupedMatches + byePairs.
  const requiredR1 = groupedMatches.length + byePairs.length;
  // bracket size es 2 * R1 matches; pero R1 matches = potencia de 2.
  let r1Matches = 1;
  while (r1Matches < requiredR1) r1Matches *= 2;
  const bracketSize = r1Matches * 2;

  if (bracketSize > 64) {
    return {
      ok: false,
      error: `Cuadro demasiado grande (${bracketSize}). Reduce el número de parejas.`,
    };
  }

  const roundCount = roundCountForBracketSize(bracketSize);

  // 7. Construir matches por ronda.
  type M = {
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: "scheduled" | "bye" | "completed";
    result_text: string | null;
    _key: string;
    _next_key: string | null;
  };
  const roundMatches: M[][] = [];
  for (let r = 1; r <= roundCount; r++) {
    const count = bracketSize / Math.pow(2, r);
    roundMatches[r] = [];
    for (let p = 0; p < count; p++) {
      roundMatches[r].push({
        round_no: r,
        position_no: p + 1,
        top_pair_id: null,
        bottom_pair_id: null,
        winner_pair_id: null,
        status: "scheduled",
        result_text: null,
        _key: `r${r}-p${p}`,
        _next_key: r < roundCount ? `r${r + 1}-p${Math.floor(p / 2)}` : null,
      });
    }
  }

  // 8. Asignar R1: primero los matches grupales (en su group_no si cabe),
  //    luego BYEs en las posiciones restantes.
  const r1 = roundMatches[1];
  const positionsUsed = new Set<number>();
  // Asignar matches grupales en la posición que coincida con group_no
  // (si es <= r1Matches y aún no ocupada); si no, en la siguiente libre.
  const ordered = [...groupedMatches].sort(
    (a, b) => (a.groupNo ?? 999) - (b.groupNo ?? 999)
  );
  for (const gm of ordered) {
    let pos = (gm.groupNo ?? 0) - 1;
    if (pos < 0 || pos >= r1Matches || positionsUsed.has(pos)) {
      // Buscar primera posición libre
      pos = -1;
      for (let i = 0; i < r1Matches; i++) {
        if (!positionsUsed.has(i)) {
          pos = i;
          break;
        }
      }
      if (pos < 0) continue;
    }
    positionsUsed.add(pos);
    r1[pos].top_pair_id = gm.topPairId;
    r1[pos].bottom_pair_id = gm.bottomPairId;
    r1[pos].status = "scheduled";
  }
  // Asignar BYEs en posiciones restantes
  let byeIdx = 0;
  for (let i = 0; i < r1Matches; i++) {
    if (positionsUsed.has(i)) continue;
    if (byeIdx < byePairs.length) {
      r1[i].top_pair_id = byePairs[byeIdx].id;
      r1[i].status = "bye";
      r1[i].winner_pair_id = byePairs[byeIdx].id;
      r1[i].result_text = "BYE";
      byeIdx += 1;
    } else {
      r1[i].status = "bye";
      r1[i].result_text = "Vacío";
    }
  }

  // 9. Resolver BYEs propagando ganadores
  function resolveBye(m: M) {
    const top = m.top_pair_id;
    const bottom = m.bottom_pair_id;
    if (top && !bottom) {
      m.winner_pair_id = top;
      m.status = "bye";
      m.result_text = "BYE";
    } else if (!top && bottom) {
      m.winner_pair_id = bottom;
      m.status = "bye";
      m.result_text = "BYE";
    } else if (!top && !bottom) {
      m.status = "bye";
      m.result_text = "Vacío";
    }
  }
  for (let r = 1; r < roundCount; r++) {
    const current = roundMatches[r];
    const next = roundMatches[r + 1];
    if (!next) continue;
    for (let p = 0; p < current.length; p++) {
      const m = current[p];
      if (!m.winner_pair_id) continue;
      const nextMatch = next[Math.floor(p / 2)];
      if (!nextMatch) continue;
      if (p % 2 === 0) {
        nextMatch.top_pair_id = m.winner_pair_id;
      } else {
        nextMatch.bottom_pair_id = m.winner_pair_id;
      }
    }
    for (const nm of next) resolveBye(nm);
  }

  // 10. Limpiar bracket anterior si existe
  const { data: existing } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (existing?.length) {
    await admin
      .from("matchplay_brackets")
      .delete()
      .in(
        "id",
        existing.map((b) => b.id)
      );
  }

  // 11. Insertar bracket + matches
  const teamCount = pairsUsedInGroups.size + byePairs.length;
  const byeCount = byePairs.length + (r1Matches - requiredR1);

  const { data: bracket, error: bErr } = await admin
    .from("matchplay_brackets")
    .insert({
      tournament_id: tournamentId,
      category_id: null,
      name: "Principal",
      bracket_type: "single_elim",
      status: "published",
      config_json: {
        bracket_size: bracketSize,
        round_count: roundCount,
        seeding_method: "pairing_r1",
        team_count: teamCount,
        bye_count: byeCount,
        draw: "pairing_groups_r1",
      },
    })
    .select("id")
    .single();

  if (bErr || !bracket?.id) {
    return {
      ok: false,
      error: bErr?.message ?? "No se pudo crear el bracket.",
    };
  }
  const bracketId = String(bracket.id);

  const insertRows: Array<{
    tournament_id: string;
    bracket_id: string;
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string;
    result_text: string | null;
  }> = [];
  for (let r = 1; r <= roundCount; r++) {
    for (const m of roundMatches[r]) {
      insertRows.push({
        tournament_id: tournamentId,
        bracket_id: bracketId,
        round_no: m.round_no,
        position_no: m.position_no,
        top_pair_id: m.top_pair_id,
        bottom_pair_id: m.bottom_pair_id,
        winner_pair_id: m.winner_pair_id,
        status: m.status,
        result_text: m.result_text,
      });
    }
  }

  const { data: inserted, error: mErr } = await admin
    .from("matchplay_matches")
    .insert(insertRows)
    .select("id, round_no, position_no");
  if (mErr) {
    return { ok: false, error: mErr.message };
  }

  // 12. Resolver next_match_id
  const idByKey = new Map<string, string>();
  for (const row of inserted ?? []) {
    idByKey.set(`r${row.round_no}-p${row.position_no - 1}`, String(row.id));
  }
  for (let r = 1; r <= roundCount; r++) {
    for (const m of roundMatches[r]) {
      if (!m._next_key) continue;
      const id = idByKey.get(m._key);
      const nextId = idByKey.get(m._next_key);
      if (id && nextId) {
        await admin
          .from("matchplay_matches")
          .update({ next_match_id: nextId })
          .eq("id", id);
      }
    }
  }

  return {
    ok: true,
    bracketId,
    teamCount,
    bracketSize,
    byeCount,
    pairedMatchesR1: groupedMatches.length,
    message: `Bracket regenerado: ${groupedMatches.length} matches en R1 desde grupos del calendario, ${byePairs.length} parejas con BYE en R1. Tamaño ${bracketSize}.`,
  };
}
