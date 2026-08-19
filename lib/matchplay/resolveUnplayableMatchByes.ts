import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceWinnerInBracket } from "@/lib/matchplay/advanceWinner";
import { isPlayablePairTeam } from "@/lib/matchplay/playablePairTeam";

export type ResolveUnplayableMatchByesResult = {
  ok: true;
  resolvedByes: number;
  groupsRemoved: number;
};

type MatchRow = {
  id: string;
  round_no: number;
  position_no: number;
  status: string;
  result_text: string | null;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
};

function feederFinished(m: MatchRow | undefined, playable: Set<string>): boolean {
  if (!m) return true;
  const top = m.top_pair_id && playable.has(m.top_pair_id) ? m.top_pair_id : null;
  const bot =
    m.bottom_pair_id && playable.has(m.bottom_pair_id) ? m.bottom_pair_id : null;
  if (m.status === "scheduled" && (top || bot)) return false;
  return true;
}

/**
 * Quita parejas fantasma (inactivas / sin jugadores) del cuadro, marca BYE
 * y avanza al oponente real. Borra foursomes MATCH PLAY con menos de 4.
 */
export async function resolveUnplayableMatchByes(
  admin: SupabaseClient,
  tournamentId: string
): Promise<ResolveUnplayableMatchByesResult> {
  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bracket?.id) {
    return { ok: true, resolvedByes: 0, groupsRemoved: 0 };
  }

  const { data: teams } = await admin
    .from("matchplay_pair_teams")
    .select("id, is_active, player_a_entry_id, player_b_entry_id")
    .eq("tournament_id", tournamentId);
  const playable = new Set(
    (teams ?? []).filter((t) => isPlayablePairTeam(t)).map((t) => String(t.id))
  );

  const { data: allMatches } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, status, result_text, top_pair_id, bottom_pair_id, winner_pair_id"
    )
    .eq("bracket_id", bracket.id)
    .order("round_no", { ascending: true })
    .order("position_no", { ascending: true });

  const maxRound = Math.max(
    1,
    ...(allMatches ?? []).map((m) => Number(m.round_no) || 1)
  );

  let resolvedByes = 0;

  for (let roundNo = 1; roundNo <= maxRound; roundNo++) {
    const { data: roundMatches } = await admin
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, status, result_text, top_pair_id, bottom_pair_id, winner_pair_id"
      )
      .eq("bracket_id", bracket.id)
      .eq("round_no", roundNo)
      .order("position_no", { ascending: true });

    const prevByPos = new Map<number, MatchRow>();
    if (roundNo > 1) {
      const { data: prev } = await admin
        .from("matchplay_matches")
        .select(
          "id, round_no, position_no, status, result_text, top_pair_id, bottom_pair_id, winner_pair_id"
        )
        .eq("bracket_id", bracket.id)
        .eq("round_no", roundNo - 1);
      for (const row of (prev ?? []) as MatchRow[]) {
        prevByPos.set(Number(row.position_no), row);
      }
    }

    for (const raw of (roundMatches ?? []) as MatchRow[]) {
      const top =
        raw.top_pair_id && playable.has(raw.top_pair_id) ? raw.top_pair_id : null;
      const bot =
        raw.bottom_pair_id && playable.has(raw.bottom_pair_id)
          ? raw.bottom_pair_id
          : null;
      const winner =
        raw.winner_pair_id && playable.has(raw.winner_pair_id)
          ? raw.winner_pair_id
          : null;

      if (roundNo > 1 && !(top && bot)) {
        const pos = Number(raw.position_no);
        const srcTop = prevByPos.get(pos * 2 - 1);
        const srcBot = prevByPos.get(pos * 2);
        const waiting =
          !feederFinished(srcTop, playable) || !feederFinished(srcBot, playable);
        if (waiting) {
          if (top !== raw.top_pair_id || bot !== raw.bottom_pair_id) {
            await admin
              .from("matchplay_matches")
              .update({
                top_pair_id: top,
                bottom_pair_id: bot,
                updated_at: new Date().toISOString(),
              })
              .eq("id", raw.id);
          }
          continue;
        }
      }

      if (top && bot) {
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        let changed = false;
        if (top !== raw.top_pair_id) {
          patch.top_pair_id = top;
          changed = true;
        }
        if (bot !== raw.bottom_pair_id) {
          patch.bottom_pair_id = bot;
          changed = true;
        }
        if (raw.status === "bye" && !winner) {
          patch.status = "scheduled";
          patch.result_text = null;
          changed = true;
        }
        if (changed) {
          await admin.from("matchplay_matches").update(patch).eq("id", raw.id);
        }
        continue;
      }

      if (top || bot) {
        const w = (top ?? bot) as string;
        if (
          raw.status === "bye" &&
          raw.winner_pair_id === w &&
          (raw.top_pair_id ?? null) === top &&
          (raw.bottom_pair_id ?? null) === bot
        ) {
          continue;
        }
        await admin
          .from("matchplay_matches")
          .update({
            top_pair_id: top,
            bottom_pair_id: bot,
            winner_pair_id: w,
            status: "bye",
            result_text: "BYE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", raw.id);
        await advanceWinnerInBracket(admin, {
          match_id: raw.id,
          winner_pair_id: w,
          autoCreateNextGroup: false,
        });
        resolvedByes += 1;
        continue;
      }

      if (
        raw.top_pair_id ||
        raw.bottom_pair_id ||
        raw.winner_pair_id ||
        raw.status !== "bye" ||
        raw.result_text !== "Vacío"
      ) {
        await admin
          .from("matchplay_matches")
          .update({
            top_pair_id: null,
            bottom_pair_id: null,
            winner_pair_id: null,
            status: "bye",
            result_text: "Vacío",
            updated_at: new Date().toISOString(),
          })
          .eq("id", raw.id);
      }
    }
  }

  const { data: rounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId);
  const roundIds = (rounds ?? []).map((r) => r.id);
  let groupsRemoved = 0;
  if (roundIds.length > 0) {
    const { data: groups } = await admin
      .from("pairing_groups")
      .select("id, notes")
      .in("round_id", roundIds)
      .like("notes", "MATCH PLAY%");
    for (const g of groups ?? []) {
      const { count } = await admin
        .from("pairing_group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", g.id);
      if ((count ?? 0) >= 4) continue;
      await admin.from("pairing_group_members").delete().eq("group_id", g.id);
      await admin.from("pairing_groups").delete().eq("id", g.id);
      groupsRemoved += 1;
    }
  }

  return { ok: true, resolvedByes, groupsRemoved };
}
