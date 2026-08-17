import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { resolveTournamentEntryHandicap } from "@/lib/handicap/resolveTournamentEntryHandicap";
import { effectiveEntryHi, formatPlayerName } from "@/lib/matchplay/entryHi";
import { assignTeeSet, type Player } from "@/lib/tee-assignment";
import { checkTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { createAdminClient } from "@/utils/supabase/admin";
import HandicapsByCategoryClient, {
  type HandicapReportCategory,
  type HandicapReportRow,
} from "./HandicapsByCategoryClient";

type RawEntry = {
  id: string;
  player_id: string;
  category_id: string | null;
  handicap_index: number | null;
  course_handicap: number | null;
  playing_handicap: number | null;
  playing_handicap_override: number | null;
  tee_set_id_override: string | null;
  status: string | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
    birth_year: number | null;
    handicap_index: number | null;
    handicap_torneo: number | null;
    ghin_number: string | null;
  } | null;
};

type RawCategory = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type RawTeeSet = {
  id: string;
  code: string | null;
  name: string | null;
  color: string | null;
};

export default async function HandicapsByCategoryReport({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName?: string;
}) {
  // Defensa en profundidad: el page ya filtra por accesibles, pero
  // re-validamos aquí en caso de que se inserte el componente en otro lado.
  const access = await checkTournamentAccess({ tournamentId });
  if (!access.ok) {
    return (
      <p className="text-[12px] text-amber-200">
        No tienes acceso a los reportes de este torneo.
      </p>
    );
  }

  const supabase = createAdminClient();

  const [
    entriesRes,
    categoriesRes,
    teeSetsRes,
    ctx,
    mpRulesRes,
  ] = await Promise.all([
    supabase
      .from("tournament_entries")
      .select(
        "id, player_id, category_id, handicap_index, course_handicap, playing_handicap, playing_handicap_override, tee_set_id_override, status, player:players(first_name, last_name, gender, birth_year, handicap_index, handicap_torneo, ghin_number)"
      )
      .eq("tournament_id", tournamentId)
      .neq("status", "cancelled"),
    supabase
      .from("categories")
      .select("id, code, name, sort_order")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tee_sets")
      .select("id, code, name, color")
      .eq("tournament_id", tournamentId),
    loadTournamentHandicapContext(supabase, tournamentId),
    supabase
      .from("tournament_matchplay_rules")
      .select("match_type")
      .eq("tournament_id", tournamentId)
      .maybeSingle(),
  ]);

  const pairsMode =
    Boolean(mpRulesRes.data) &&
    (mpRulesRes.data as { match_type?: string | null }).match_type !==
      "individual";

  type PairMeta = {
    pairId: string;
    slot: 1 | 2;
    label: string;
    combinedHi: number | null;
  };
  const pairByEntryId = new Map<string, PairMeta>();

  if (pairsMode) {
    const { data: teamsRaw, error: teamsErr } = await supabase
      .from("matchplay_pair_teams")
      .select(
        "id, team_name, combined_hi, player_a_entry_id, player_b_entry_id"
      )
      .eq("tournament_id", tournamentId)
      .eq("is_active", true);
    if (teamsErr) {
      console.error("[reports/handicaps] pair teams", teamsErr.message);
    }

    for (const raw of teamsRaw ?? []) {
      const row = raw as {
        id: string;
        team_name?: string | null;
        combined_hi?: number | null;
        player_a_entry_id?: string | null;
        player_b_entry_id?: string | null;
      };
      const idA = row.player_a_entry_id ? String(row.player_a_entry_id) : "";
      const idB = row.player_b_entry_id ? String(row.player_b_entry_id) : "";
      if (!idA || !idB) continue;
      const combined =
        row.combined_hi != null && Number.isFinite(Number(row.combined_hi))
          ? Number(row.combined_hi)
          : null;
      const labelBase = (row.team_name ?? "").trim() || null;
      pairByEntryId.set(idA, {
        pairId: String(row.id),
        slot: 1,
        label: labelBase ?? "",
        combinedHi: combined,
      });
      pairByEntryId.set(idB, {
        pairId: String(row.id),
        slot: 2,
        label: labelBase ?? "",
        combinedHi: combined,
      });
    }
  }

  const categories: RawCategory[] = (categoriesRes.data ?? []) as RawCategory[];
  const entries: RawEntry[] = ((entriesRes.data ?? []) as unknown[]).map((e) => {
    const r = e as RawEntry & {
      player: RawEntry["player"] | Array<NonNullable<RawEntry["player"]>>;
    };
    const p = Array.isArray(r.player) ? r.player[0] ?? null : r.player;
    return { ...r, player: p };
  });
  const teeSets: RawTeeSet[] = (teeSetsRes.data ?? []) as RawTeeSet[];
  const teeSetById = new Map(teeSets.map((t) => [t.id, t]));

  type Row = HandicapReportRow;

  const rowsByCategory = new Map<string | null, Row[]>();

  for (const e of entries) {
    if (!e.player) continue;
    const hi = effectiveEntryHi({
      handicap_index: e.handicap_index,
      player: {
        handicap_index: e.player.handicap_index,
        handicap_torneo: e.player.handicap_torneo,
      },
    });

    const calc = resolveTournamentEntryHandicap(
      {
        id: e.id,
        player_id: e.player_id,
        category_id: e.category_id,
        handicap_index: e.handicap_index,
        playing_handicap_override: e.playing_handicap_override,
        tee_set_id_override: e.tee_set_id_override ?? null,
        player: {
          gender: e.player.gender,
          birth_year: e.player.birth_year,
          handicap_index: e.player.handicap_index,
          handicap_torneo: e.player.handicap_torneo,
        },
      },
      ctx
    );

    const isOverride = e.playing_handicap_override != null;

    let tee: Row["tee"] = null;

    // Override de salida: misma prioridad que en inscritos / H torneo.
    if (e.tee_set_id_override) {
      const ts = teeSetById.get(e.tee_set_id_override);
      if (ts) {
        tee = {
          code: ts.code,
          name: ts.name,
          color: ts.color,
        };
      }
    }
    if (!tee && e.category_id) {
      const player: Player = {
        id: e.player_id,
        gender: (e.player.gender ?? "X").toString().toUpperCase() as
          | "M"
          | "F"
          | "X",
        handicap_index: hi,
        birth_year: e.player.birth_year ?? null,
        category_id: e.category_id,
      };
      const teeSetsForAssign = ctx.tournamentTeeSets.map((t) => ({
        id: t.id,
        code: t.code ?? "",
        name: t.code ?? "",
      }));
      const assigned = assignTeeSet(player, ctx.categoryTeeRules, teeSetsForAssign);
      if (assigned) {
        const ts = teeSetById.get(assigned.id);
        if (ts) {
          tee = {
            code: ts.code,
            name: ts.name,
            color: ts.color,
          };
        }
      }
    }

    const ch = isOverride
      ? null
      : calc
        ? calc.course_handicap
        : e.course_handicap != null
          ? Number(e.course_handicap)
          : null;
    const ph = isOverride
      ? Number(e.playing_handicap_override)
      : calc
        ? calc.playing_handicap
        : e.playing_handicap != null
          ? Number(e.playing_handicap)
          : null;

    const capApplied =
      calc?.meta?.hi_cap_applied != null
        ? Number(calc.meta.hi_cap_applied)
        : null;
    const capSource = calc?.meta?.hi_cap_source ?? null;

    const pair = pairByEntryId.get(e.id);
    const row: Row = {
      entry_id: e.id,
      name: formatPlayerName(e.player),
      ghin: (e.player.ghin_number ?? "").trim() || null,
      gender: (e.player.gender ?? "—").toString().toUpperCase(),
      hi,
      hi_effective: capApplied,
      hi_cap_source: capSource,
      ch,
      ph,
      is_override: isOverride,
      allowance_pct:
        e.category_id != null
          ? ctx.allowancePctByCategory.get(e.category_id) ??
            ctx.matchplayFallback?.allowance_pct ??
            null
          : ctx.matchplayFallback?.allowance_pct ?? null,
      tee,
      pair_id: pair?.pairId ?? null,
      pair_slot: pair?.slot ?? null,
      pair_label: pair?.label ?? null,
      pair_combined_hi: pair?.combinedHi ?? null,
    };

    const key = e.category_id ?? null;
    const bucket = rowsByCategory.get(key) ?? [];
    bucket.push(row);
    rowsByCategory.set(key, bucket);
  }

  // Completar etiqueta de pareja y suma de PH (orden).
  {
    const namesByEntry = new Map<string, string>();
    const phByEntry = new Map<string, number | null>();
    for (const rows of rowsByCategory.values()) {
      for (const r of rows) {
        namesByEntry.set(r.entry_id, r.name);
        phByEntry.set(
          r.entry_id,
          r.ph != null && Number.isFinite(Number(r.ph)) ? Number(r.ph) : null
        );
      }
    }
    const pairMembers = new Map<string, { j1?: string; j2?: string }>();
    for (const [entryId, meta] of pairByEntryId) {
      const bag = pairMembers.get(meta.pairId) ?? {};
      if (meta.slot === 1) bag.j1 = entryId;
      else bag.j2 = entryId;
      pairMembers.set(meta.pairId, bag);
    }
    const phSumByPair = new Map<string, number | null>();
    for (const [pairId, members] of pairMembers) {
      const ph1 = members.j1 ? phByEntry.get(members.j1) : null;
      const ph2 = members.j2 ? phByEntry.get(members.j2) : null;
      if (ph1 != null && ph2 != null) phSumByPair.set(pairId, ph1 + ph2);
      else if (ph1 != null) phSumByPair.set(pairId, ph1);
      else if (ph2 != null) phSumByPair.set(pairId, ph2);
      else phSumByPair.set(pairId, null);
    }
    for (const rows of rowsByCategory.values()) {
      for (const r of rows) {
        if (!r.pair_id) continue;
        r.pair_ph_sum = phSumByPair.get(r.pair_id) ?? null;
        if (r.pair_label) continue;
        const members = pairMembers.get(r.pair_id);
        const n1 = members?.j1 ? namesByEntry.get(members.j1) ?? "—" : "—";
        const n2 = members?.j2 ? namesByEntry.get(members.j2) ?? "—" : "—";
        r.pair_label = `${n1} / ${n2}`;
      }
    }
  }

  function sortRows(a: Row, b: Row): number {
    // Torneo de parejas: J1+J2 juntos, de menor a mayor suma de PH.
    if (pairsMode && pairByEntryId.size > 0) {
      const aPaired = Boolean(a.pair_id);
      const bPaired = Boolean(b.pair_id);
      if (aPaired !== bPaired) return aPaired ? -1 : 1;
      if (a.pair_id && b.pair_id && a.pair_id !== b.pair_id) {
        const aSum = a.pair_ph_sum;
        const bSum = b.pair_ph_sum;
        if (aSum != null && bSum != null && aSum !== bSum) {
          return aSum - bSum;
        }
        if (aSum != null && bSum == null) return -1;
        if (aSum == null && bSum != null) return 1;
        // Empate de PH: fallback HI combinado, luego etiqueta.
        const aComb = a.pair_combined_hi;
        const bComb = b.pair_combined_hi;
        if (aComb != null && bComb != null && aComb !== bComb) {
          return aComb - bComb;
        }
        const labelCmp = (a.pair_label ?? "").localeCompare(
          b.pair_label ?? "",
          "es"
        );
        if (labelCmp !== 0) return labelCmp;
        return a.pair_id.localeCompare(b.pair_id);
      }
      if (a.pair_id && a.pair_id === b.pair_id) {
        return (a.pair_slot ?? 9) - (b.pair_slot ?? 9);
      }
    }
    const aHi = Number.isFinite(a.hi) ? a.hi : 999;
    const bHi = Number.isFinite(b.hi) ? b.hi : 999;
    if (aHi !== bHi) return aHi - bHi;
    return a.name.localeCompare(b.name, "es");
  }

  const sortedCategoryDefs = [
    ...categories,
    ...(rowsByCategory.has(null)
      ? [{ id: "__sin__", code: null, name: "Sin categoría", sort_order: 999 }]
      : []),
  ];

  const clientCategories: HandicapReportCategory[] = sortedCategoryDefs
    .map((cat) => {
      const key = cat.id === "__sin__" ? null : cat.id;
      const rows = (rowsByCategory.get(key) ?? []).slice().sort(sortRows);
      return {
        id: cat.id ?? "no-cat",
        code: cat.code,
        name: cat.name,
        rows,
      };
    })
    .filter((c) => c.rows.length > 0);

  return (
    <HandicapsByCategoryClient
      categories={clientCategories}
      tournamentName={tournamentName ?? "Torneo"}
    />
  );
}
