import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { resolveTournamentEntryHandicap } from "@/lib/handicap/resolveTournamentEntryHandicap";
import { effectiveEntryHi, formatPlayerName } from "@/lib/matchplay/entryHi";
import { assignTeeSet, type Player } from "@/lib/tee-assignment";
import { checkTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { createAdminClient } from "@/utils/supabase/admin";

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

const numFmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "—" : String(Math.round(Number(n)));
const hiFmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toFixed(1);

export default async function HandicapsByCategoryReport({
  tournamentId,
}: {
  tournamentId: string;
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
        "id, player_id, category_id, handicap_index, course_handicap, playing_handicap, playing_handicap_override, status, player:players(first_name, last_name, gender, birth_year, handicap_index, handicap_torneo)"
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

  type Row = {
    entry_id: string;
    name: string;
    gender: string;
    hi: number;
    /** HI realmente usado para WHS (capado al máximo del torneo si aplica). */
    hi_effective: number | null;
    hi_cap_source: "rule_max" | "rule_min" | null;
    ch: number | null;
    ph: number | null;
    is_override: boolean;
    allowance_pct: number | null;
    tee: { code: string | null; name: string | null; color: string | null } | null;
  };

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

  const sortedCategories = [
    ...categories,
    ...(rowsByCategory.has(null)
      ? [{ id: "__sin__", code: null, name: "Sin categoría", sort_order: 999 }]
      : []),
  ];

  const hasAnyRow = sortedCategories.some((cat) => {
    const key = cat.id === "__sin__" ? null : cat.id;
    return (rowsByCategory.get(key) ?? []).length > 0;
  });

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        CH = HI × Slope/113 + (CR − Par) según la salida que la regla
        salida/categoría le asigna en el campo. PH = CH × % de reglas de
        competencia. Ordenado por handicap ascendente (menor arriba). Si el
        HI del jugador rebasa el rango de la regla, se aplica el{" "}
        <span className="font-semibold text-amber-300">
          máximo a jugar del torneo
        </span>{" "}
        (handicap_max) — se indica con flecha amarilla en la columna HI.
      </p>

      <div className="space-y-3">
        {sortedCategories.map((cat) => {
          const key = cat.id === "__sin__" ? null : cat.id;
          const rows = (rowsByCategory.get(key) ?? []).slice().sort(sortRows);
          if (rows.length === 0) return null;
          const label = cat.code
            ? `${cat.code} · ${cat.name ?? ""}`
            : cat.name ?? "—";
          return (
            <section
              key={cat.id ?? "no-cat"}
              className="rounded-lg border border-white/10 bg-[#0f172a]"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
                <h2 className="text-[13px] font-bold text-white">{label}</h2>
                <span className="text-[10px] text-slate-400">
                  {rows.length} inscrit{rows.length === 1 ? "o" : "os"}
                </span>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[12px] text-white">
                  <thead className="bg-[#162032] text-[10px] uppercase tracking-wide text-slate-300">
                    <tr>
                      <th className="px-2 py-1.5 text-right w-[36px]">#</th>
                      <th className="px-2 py-1.5">Nombre</th>
                      <th className="px-2 py-1.5 text-center w-[36px]">Sexo</th>
                      <th className="px-2 py-1.5 text-right w-[56px]">HI</th>
                      <th className="px-2 py-1.5 text-right w-[48px]">CH</th>
                      <th className="px-2 py-1.5 text-right w-[48px]">PH</th>
                      <th className="px-2 py-1.5 text-right w-[44px]">%</th>
                      <th className="px-2 py-1.5">Salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr
                        key={r.entry_id}
                        className="border-t border-white/5 align-middle hover:bg-white/[0.02]"
                      >
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 text-center text-slate-300">
                          {r.gender}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            r.hi_cap_source != null
                              ? "text-amber-200"
                              : "text-slate-100"
                          }`}
                          title={
                            r.hi_cap_source != null && r.hi_effective != null
                              ? `HI real ${hiFmt(r.hi)} — capado a ${hiFmt(
                                  r.hi_effective
                                )} (máximo del torneo en su categoría/salida).`
                              : undefined
                          }
                        >
                          {hiFmt(r.hi)}
                          {r.hi_cap_source != null && r.hi_effective != null ? (
                            <span className="ml-1 text-[8px] uppercase text-amber-300">
                              → {hiFmt(r.hi_effective)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">
                          {r.is_override ? "—" : numFmt(r.ch)}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                            r.is_override ? "text-amber-300" : "text-emerald-300"
                          }`}
                          title={
                            r.is_override
                              ? "Override manual desde panel de match play"
                              : undefined
                          }
                        >
                          {numFmt(r.ph)}
                          {r.is_override ? (
                            <span className="ml-1 text-[8px] uppercase">ovr</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {r.allowance_pct != null
                            ? `${r.allowance_pct}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.tee ? (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold"
                              title={`${r.tee.name ?? ""} (${r.tee.code ?? ""})`}
                            >
                              <span
                                aria-hidden
                                className="inline-block h-3 w-3 rounded-full border border-white/30"
                                style={{
                                  backgroundColor:
                                    r.tee.color && r.tee.color.trim().length > 0
                                      ? r.tee.color
                                      : "#888888",
                                }}
                              />
                              <span className="text-white">
                                {r.tee.code ?? r.tee.name ?? "—"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">
                              sin regla
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {!hasAnyRow ? (
          <p className="text-[12px] text-amber-200">
            No hay inscritos en este torneo.
          </p>
        ) : null}
      </div>
    </div>
  );
}
