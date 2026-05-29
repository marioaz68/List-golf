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
  ] = await Promise.all([
    supabase
      .from("tournament_entries")
      .select(
        "id, player_id, category_id, handicap_index, course_handicap, playing_handicap, playing_handicap_override, status, player:players(first_name, last_name, gender, birth_year, handicap_index, handicap_torneo, ghin_number)"
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
  ]);

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
    if (e.category_id) {
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
    };

    const key = e.category_id ?? null;
    const bucket = rowsByCategory.get(key) ?? [];
    bucket.push(row);
    rowsByCategory.set(key, bucket);
  }

  function sortRows(a: Row, b: Row): number {
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
