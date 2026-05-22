import { createAdminClient } from "@/utils/supabase/admin";
import { ENTRY_SELECT_WITHOUT_KIT } from "@/lib/entries/telegramKitColumns";
import { effectiveEntryHi, formatPlayerName } from "./entryHi";
import type {
  MatchPlayEntryRow,
  MatchPlayRulesSnapshot,
  MatchPlayTeamRow,
  MatchPlayTeamsPageData,
} from "./teamTypes";

type RawEntry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
    handicap_index: number | null;
    handicap_torneo: number | null;
  } | null;
  categories:
    | { id: string; code: string | null; name: string | null }
    | { id: string; code: string | null; name: string | null }[]
    | null;
};

type RawTeam = {
  id: string;
  tournament_id: string;
  category_id: string | null;
  player_a_entry_id: string | null;
  player_b_entry_id: string | null;
  team_name: string | null;
  combined_hi: number | null;
  seed: number | null;
  auction_bid: number | null;
  auction_order: number | null;
  is_active: boolean;
};

function oneCategory(
  raw: RawEntry["categories"]
): { id: string; code: string | null; name: string | null } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function mapEntry(raw: RawEntry): MatchPlayEntryRow {
  const cat = oneCategory(raw.categories);
  const player = raw.players;
  const row: MatchPlayEntryRow = {
    id: raw.id,
    player_id: raw.player_id,
    player_number: raw.player_number,
    handicap_index: raw.handicap_index,
    status: raw.status,
    effective_hi: 0,
    player: {
      id: player?.id ?? raw.player_id,
      first_name: player?.first_name ?? null,
      last_name: player?.last_name ?? null,
      gender: (player?.gender?.toUpperCase() ?? "X") as "M" | "F" | "X",
      handicap_index: player?.handicap_index ?? null,
    },
    category_id: cat?.id ?? null,
    category_code: cat?.code ?? null,
    category_name: cat?.name ?? null,
  };
  row.effective_hi = effectiveEntryHi(row);
  return row;
}

export async function loadMatchPlayTeamsData(
  tournamentId: string
): Promise<MatchPlayTeamsPageData> {
  const supabase = createAdminClient();

  const { data: rulesRaw, error: rulesError } = await supabase
    .from("tournament_matchplay_rules")
    .select(
      "match_type, pair_composition, combined_hi_min, combined_hi_max, male_individual_hi_max, female_individual_hi_max, bracket_main_pairs, max_pairs_per_category"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const migrationMissing =
    !!rulesError &&
    /matchplay_pair_teams|tournament_matchplay_rules|does not exist/i.test(
      rulesError.message
    );

  if (migrationMissing) {
    return {
      rules: null,
      categories: [],
      entries: [],
      teams: [],
      assignedEntryIds: new Set(),
      migrationMissing: true,
    };
  }

  const rules: MatchPlayRulesSnapshot | null = rulesRaw
    ? {
        match_type:
          rulesRaw.match_type === "individual" ? "individual" : "pairs",
        pair_composition: rulesRaw.pair_composition ?? null,
        combined_hi_min:
          rulesRaw.combined_hi_min !== null
            ? Number(rulesRaw.combined_hi_min)
            : null,
        combined_hi_max:
          rulesRaw.combined_hi_max !== null
            ? Number(rulesRaw.combined_hi_max)
            : null,
        male_individual_hi_max:
          rulesRaw.male_individual_hi_max != null
            ? Number(rulesRaw.male_individual_hi_max)
            : null,
        female_individual_hi_max:
          rulesRaw.female_individual_hi_max != null
            ? Number(rulesRaw.female_individual_hi_max)
            : null,
        max_teams:
          rulesRaw.bracket_main_pairs ?? rulesRaw.max_pairs_per_category ?? null,
      }
    : null;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, code, name")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const { data: entriesRaw } = await supabase
    .from("tournament_entries")
    .select(ENTRY_SELECT_WITHOUT_KIT)
    .eq("tournament_id", tournamentId)
    .order("player_number", { ascending: true, nullsFirst: false });

  const entries = ((entriesRaw ?? []) as unknown as RawEntry[]).map(mapEntry);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const { data: teamsRaw, error: teamsError } = await supabase
    .from("matchplay_pair_teams")
    .select(
      "id, tournament_id, category_id, player_a_entry_id, player_b_entry_id, team_name, combined_hi, seed, auction_bid, auction_order, is_active"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("seed", { ascending: true, nullsFirst: false });

  if (teamsError && !migrationMissing) {
    throw new Error(teamsError.message);
  }

  const assignedEntryIds = new Set<string>();
  const teams: MatchPlayTeamRow[] = ((teamsRaw ?? []) as RawTeam[]).map((t) => {
    if (t.player_a_entry_id) assignedEntryIds.add(t.player_a_entry_id);
    if (t.player_b_entry_id) assignedEntryIds.add(t.player_b_entry_id);

    const player_a = t.player_a_entry_id
      ? entryById.get(t.player_a_entry_id) ?? null
      : null;
    const player_b = t.player_b_entry_id
      ? entryById.get(t.player_b_entry_id) ?? null
      : null;

    let team_name = t.team_name;
    if (!team_name && player_a) {
      if (player_b) {
        team_name = `${formatPlayerName(player_a.player)} / ${formatPlayerName(player_b.player)}`;
      } else {
        team_name = formatPlayerName(player_a.player);
      }
    }

    return {
      ...t,
      team_name,
      player_a,
      player_b,
    };
  });

  return {
    rules,
    categories: categories ?? [],
    entries,
    teams,
    assignedEntryIds,
    migrationMissing: false,
  };
}
