import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  clearGroups,
  confirmStartingOrder,
  generateGroupsByCategory,
  recalculateTeeTimes,
  reopenStartingOrder,
  saveCategoryPlanOrder,
} from "./actions";
import TeeSheetDnD from "./TeeSheetDnD";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_GROUP_SIZE = 8;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type Round = {
  id: string;
  tournament_id: string;
  category_id: string | null;
  round_no: number;
  round_date: string | null;
  start_type: "tee_times" | "shotgun";
  start_time: string | null;
  interval_minutes: number | null;
  notes: string | null;
  categories?: {
    code: string | null;
    name: string | null;
  } | null;
};

type GroupRow = {
  id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  notes: string | null;
};

type MemberUI = {
  entry_id: string;
  group_id: string;
  position: number;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name: string | null;
  club_logo_url: string | null;
  club_generated_logo_url: string | null;
  club_primary_color: string | null;
};

type GroupUI = GroupRow & { members: MemberUI[]; starting_label: string | null };

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function catSort(a: string, b: string) {
  if (a === "SIN CATEGORÍA" && b !== "SIN CATEGORÍA") return 1;
  if (b === "SIN CATEGORÍA" && a !== "SIN CATEGORÍA") return -1;
  return a.localeCompare(b);
}


type ShotgunSlot = {
  hole: number;
  side: "A" | "B";
};

const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

function getShotgunExtraHoleOrder() {
  const primary = [1, 10];
  const par5 = [5, 9, 14, 18];
  const par4 = [2, 4, 6, 11, 13, 15, 17];
  const par3 = [8, 3, 7, 12, 16];

  return [...primary, ...par5, ...par4, ...par3];
}

function buildShotgunSlots(totalGroups: number): ShotgunSlot[] {
  const extraNeeded = Math.max(0, totalGroups - 18);
  const doubleHoles = new Set(getShotgunExtraHoleOrder().slice(0, extraNeeded));
  const slots: ShotgunSlot[] = [];

  for (let hole = 1; hole <= 18; hole++) {
    if (doubleHoles.has(hole)) {
      slots.push({ hole, side: "B" });
      slots.push({ hole, side: "A" });
    } else {
      slots.push({ hole, side: "A" });
    }
  }

  return slots.slice(0, totalGroups);
}

function isStartingOrderConfirmed(notes: string | null | undefined) {
  return String(notes ?? "").includes(STARTING_ORDER_CONFIRMED_MARKER);
}

export default async function TeeSheetPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";
  const roundId = typeof sp.round_id === "string" ? sp.round_id.trim() : "";

  const groupSizeRaw =
    typeof sp.group_size === "string" ? sp.group_size.trim() : "";
  const groupSizeNum = Number(groupSizeRaw);
  const effectiveGroupSize =
    Number.isFinite(groupSizeNum) && groupSizeNum >= 2 && groupSizeNum <= MAX_GROUP_SIZE
      ? groupSizeNum
      : 4;

  const catParam = typeof sp.cat === "string" ? sp.cat.trim() : "";

  const { data: tData, error: tErr } = await supabase
    .from("tournaments")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    throw new Error("Error leyendo torneos: " + tErr.message);
  }

  const tournaments: Tournament[] = (tData ?? []) as any[];
  const effectiveTournamentId = tournamentId || tournaments[0]?.id || "";

  const { data: rData, error: rErr } = effectiveTournamentId
    ? await supabase
        .from("rounds")
        .select(`
          id,
          tournament_id,
          category_id,
          round_no,
          round_date,
          start_type,
          start_time,
          interval_minutes,
          notes,
          categories:categories (
            code,
            name
          )
        `)
        .eq("tournament_id", effectiveTournamentId)
        .order("round_no", { ascending: true })
    : { data: [], error: null };

  if (rErr) {
    throw new Error("Error leyendo rounds: " + rErr.message);
  }

  const rounds: Round[] = (rData ?? []) as any[];
  const effectiveRoundId = roundId || rounds[0]?.id || "";

  if ((!tournamentId && effectiveTournamentId) || (!roundId && effectiveRoundId)) {
    const qs = new URLSearchParams({
      tournament_id: effectiveTournamentId,
      round_id: effectiveRoundId,
      group_size: String(effectiveGroupSize),
    });

    if (catParam && catParam !== "ALL") {
      qs.set("cat", catParam);
    }

    redirect(`/tee-sheet?${qs.toString()}`);
  }

  const { data: gData, error: gErr } = effectiveRoundId
    ? await supabase
        .from("pairing_groups")
        .select("id,group_no,tee_time,starting_hole,notes")
        .eq("round_id", effectiveRoundId)
        .order("group_no", { ascending: true })
    : { data: [], error: null };

  if (gErr) {
    throw new Error("Error leyendo grupos: " + gErr.message);
  }

  const groups: GroupRow[] = (gData ?? []) as any[];

  const { data: mData, error: mErr } =
    effectiveRoundId && groups.length > 0
      ? await supabase
          .from("pairing_group_members")
          .select(`
            id,
            group_id,
            position,
            entry_id,
            tournament_entries (
              handicap_index,
              players (
                first_name,
                last_name,
                club_id,
                clubs:clubs (
                  name,
                  short_name,
                  logo_url,
                  generated_logo_url,
                  primary_color
                )
              )
            )
          `)
          .in(
            "group_id",
            groups.map((g) => g.id)
          )
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (mErr) {
    throw new Error("Error leyendo miembros de grupos: " + mErr.message);
  }

  const membersRaw = (mData ?? []) as any[];

  const membersByGroup = new Map<string, MemberUI[]>();
for (const row of membersRaw) {
  const gid = row.group_id as string;

  const te = Array.isArray(row.tournament_entries)
    ? row.tournament_entries[0] ?? null
    : row.tournament_entries ?? null;

  const player = Array.isArray(te?.players)
    ? te.players[0] ?? null
    : te?.players ?? null;

  const club = Array.isArray(player?.clubs)
    ? player.clubs[0] ?? null
    : player?.clubs ?? null;

  const playerClubId =
    typeof player?.club_id === "string" && player.club_id.trim()
      ? player.club_id.trim()
      : null;

  const item: MemberUI = {
    entry_id: row.entry_id,
    group_id: gid,
    position: Number(row.position ?? 0),
    first_name: player?.first_name ?? null,
    last_name: player?.last_name ?? null,
    handicap_index: te?.handicap_index ?? null,
    club_id: playerClubId,
    club_name: club?.name ?? null,
    club_short_name: club?.short_name ?? null,
    club_logo_url: playerClubId
      ? `/api/club-logo?club_id=${encodeURIComponent(playerClubId)}`
      : null,
    club_generated_logo_url: null,
    club_primary_color: club?.primary_color ?? null,
  };

  if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
  membersByGroup.get(gid)!.push(item);
}

  const sortedGroups = [...groups].sort((a, b) => a.group_no - b.group_no);
  const shotgunSlots = buildShotgunSlots(sortedGroups.length);

  const groupsForUI: GroupUI[] = sortedGroups.map((g, index) => {
    const slot = shotgunSlots[index];
    const starting_label = slot
      ? `H${slot.hole}${slot.side}`
      : typeof g.starting_hole === "number"
        ? `H${g.starting_hole}`
        : null;

    return {
      ...g,
      starting_label,
      members: membersByGroup.get(g.id) ?? [],
    };
  });

  const categoriesSet = new Set<string>();
  for (const g of groupsForUI) {
    categoriesSet.add(catKey(g.notes));
  }
  const categories = Array.from(categoriesSet).sort(catSort);

  const effectiveCat =
    catParam && (catParam === "ALL" || categories.includes(catParam))
      ? catParam
      : "ALL";

  const visibleGroups =
    effectiveCat === "ALL"
      ? groupsForUI
      : groupsForUI.filter((g) => catKey(g.notes) === effectiveCat);

  const visiblePlayers = visibleGroups.reduce(
    (acc, g) => acc + (g.members?.length ?? 0),
    0
  );

  const tournamentLabel = (t: Tournament) =>
    (t.name ?? "").trim() || `Torneo ${t.id.slice(0, 8)}`;

  const roundCategoryLabel = (r: Round) => {
    const rawCategory = Array.isArray(r.categories)
      ? r.categories[0] ?? null
      : r.categories ?? null;

    const code = rawCategory?.code?.trim() || "";
    const name = rawCategory?.name?.trim() || "";

    if (code && name) return `${code} — ${name}`;
    if (code) return code;
    if (name) return name;
    return "Todas las categorías";
  };

  const roundLabel = (r: Round) =>
    `R${r.round_no}` +
    (r.round_date ? ` (${r.round_date})` : "") +
    ` — ${roundCategoryLabel(r)}` +
    ` — ${r.start_type}` +
    (r.start_time ? ` ${r.start_time}` : "") +
    (r.interval_minutes ? ` / ${r.interval_minutes}min` : "");


  const selectedRound = rounds.find((r) => r.id === effectiveRoundId) ?? null;
  const startingOrderConfirmed = isStartingOrderConfirmed(selectedRound?.notes);

  const blockRounds = selectedRound
    ? rounds.filter((r) => {
        return (
          r.tournament_id === selectedRound.tournament_id &&
          r.round_no === selectedRound.round_no &&
          String(r.round_date ?? "") === String(selectedRound.round_date ?? "") &&
          String(r.start_type ?? "") === String(selectedRound.start_type ?? "") &&
          String(r.start_time ?? "") === String(selectedRound.start_time ?? "")
        );
      })
    : [];

  const blockCategoryIds = Array.from(
    new Set(
      blockRounds
        .map((r) => (typeof r.category_id === "string" ? r.category_id.trim() : ""))
        .filter(Boolean)
    )
  );

  const { data: planCategoriesData, error: planCategoriesErr } =
    effectiveTournamentId
      ? await supabase
          .from("categories")
          .select("id, code, name, sort_order, handicap_min, category_group")
          .eq("tournament_id", effectiveTournamentId)
          .order("sort_order", { ascending: true })
          .order("handicap_min", { ascending: true })
      : { data: [], error: null };

  if (planCategoriesErr) {
    throw new Error("Error leyendo categorías para planeación: " + planCategoriesErr.message);
  }

  const allPlanCategories = (planCategoriesData ?? []) as Array<{
    id: string;
    code: string | null;
    name: string | null;
    sort_order: number | null;
    handicap_min: number | null;
    category_group: string | null;
  }>;

  const planCategories =
    blockCategoryIds.length > 0
      ? allPlanCategories.filter((c) => blockCategoryIds.includes(c.id))
      : allPlanCategories;

  let planEntriesQuery = effectiveTournamentId
    ? supabase
        .from("tournament_entries")
        .select("id, category_id, status")
        .eq("tournament_id", effectiveTournamentId)
        .in("status", ["active", "confirmed"])
    : null;

  if (planEntriesQuery && blockCategoryIds.length > 0) {
    planEntriesQuery = planEntriesQuery.in("category_id", blockCategoryIds);
  }

  const { data: planEntriesData, error: planEntriesErr } = planEntriesQuery
    ? await planEntriesQuery
    : { data: [], error: null };

  if (planEntriesErr) {
    throw new Error("Error leyendo inscritos para planeación: " + planEntriesErr.message);
  }

  const planEntryRows = (planEntriesData ?? []) as Array<{
    id: string;
    category_id: string | null;
    status: string | null;
  }>;

  const entryCountByCategory = new Map<string, number>();
  let noCategoryCount = 0;

  for (const row of planEntryRows) {
    const catId = typeof row.category_id === "string" ? row.category_id : "";
    if (!catId) {
      noCategoryCount += 1;
      continue;
    }

    entryCountByCategory.set(catId, (entryCountByCategory.get(catId) ?? 0) + 1);
  }

  const startHoleSequence = [1, 10, 2, 11, 3, 12, 4, 13, 5, 14, 6, 15, 7, 16, 8, 17, 9, 18];

  const planRows = planCategories
    .map((c, idx) => {
      const players = entryCountByCategory.get(c.id) ?? 0;
      const groups4 = Math.ceil(players / 4);
      const groups5 = Math.ceil(players / 5);
      const label = [c.code, c.name].filter(Boolean).join(" — ") || "SIN CATEGORÍA";

      return {
        id: c.id,
        label,
        sortOrder: c.sort_order,
        players,
        groups4,
        groups5,
        suggestedStartHole: startHoleSequence[idx % startHoleSequence.length],
      };
    })
    .filter((row) => row.players > 0 || blockCategoryIds.includes(row.id));

  if (noCategoryCount > 0) {
    planRows.push({
      id: "NO_CAT",
      label: "SIN CATEGORÍA",
      sortOrder: null,
      players: noCategoryCount,
      groups4: Math.ceil(noCategoryCount / 4),
      groups5: Math.ceil(noCategoryCount / 5),
      suggestedStartHole: startHoleSequence[planRows.length % startHoleSequence.length],
    });
  }

  const planTotalPlayers = planRows.reduce((acc, row) => acc + row.players, 0);
  const planTotalGroups4 = planRows.reduce((acc, row) => acc + row.groups4, 0);
  const planTotalGroups5 = planRows.reduce((acc, row) => acc + row.groups5, 0);
  const shotgunSimpleCapacity = 18;
  const shotgunDoubleCapacity = 36;
  const shotgunExtendedCapacity = 44;

  const planRecommendation = (() => {
    if (!selectedRound) return "Selecciona una ronda/bloque para analizar.";
    if (planTotalPlayers === 0) return "No hay jugadores activos/confirmados para este bloque.";
    if (selectedRound.start_type !== "shotgun") {
      return planTotalGroups4 <= shotgunSimpleCapacity
        ? "Tee times: grupos de 4 funcionan bien para esta cantidad."
        : "Tee times: revisa el intervalo y la ventana disponible de salidas.";
    }
    if (planTotalGroups4 <= shotgunSimpleCapacity) return "Cabe con grupos de 4 y salida sencilla.";
    if (planTotalGroups5 <= shotgunSimpleCapacity) return "Conviene usar grupos de 5; cabe con salida sencilla.";
    if (planTotalGroups4 <= shotgunDoubleCapacity) return "Cabe con grupos de 4 usando doble salida por hoyo.";
    if (planTotalGroups5 <= shotgunDoubleCapacity) return "Recomendado: grupos de 5 usando doble salida por hoyo.";
    if (planTotalGroups5 <= shotgunExtendedCapacity) return "Recomendado: grupos de 5 + doble salida principal 1/10 + pares 5 secundarios.";
    return "No cabe en este bloque. Divide categorías en otra sesión o reduce jugadores del bloque.";
  })();

  if (!effectiveTournamentId) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex items-center justify-between text-white">
          <h1 className="text-3xl font-bold tracking-tight">Tee Sheet</h1>
        </div>

        <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm">
          <div className="text-red-600">No hay torneos. Crea uno primero.</div>
        </section>
      </div>
    );
  }

  if (!effectiveRoundId) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex items-center justify-between text-white">
          <h1 className="text-3xl font-bold tracking-tight">Tee Sheet</h1>
        </div>

        <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm space-y-3">
          <form method="GET" action="/tee-sheet" className="flex flex-wrap gap-3 items-center">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {tournamentLabel(t)}
                </option>
              ))}
            </select>

            <button className="rounded bg-black text-white px-4 py-2 font-medium hover:bg-slate-900">
              Cambiar
            </button>
          </form>

          <div className="text-red-600">
            No hay rounds para este torneo. Crea una ronda primero.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-white">
        <h1 className="text-3xl font-bold tracking-tight">Tee Sheet</h1>
        <div className="rounded-md bg-black/20 px-3 py-1 text-sm font-medium">
          Grupos: {visibleGroups.length} · Jugadores: {visiblePlayers}
        </div>
      </div>

      <section className="border border-slate-300 rounded-lg bg-white p-4 text-slate-950 shadow-sm space-y-3">
        <form method="GET" action="/tee-sheet" className="flex flex-wrap gap-3 items-end">
          <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:max-w-md">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Torneo
            </span>
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className="w-full border border-slate-600 rounded bg-white px-3 py-2 text-slate-950"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {tournamentLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-1 sm:max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Ronda
            </span>
            <select
              name="round_id"
              defaultValue={effectiveRoundId}
              className="min-w-[12rem] max-w-[min(100vw-2rem,22rem)] border border-slate-600 rounded bg-white px-3 py-2 text-slate-950 sm:min-w-[14rem]"
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {roundLabel(r)}
                </option>
              ))}
            </select>
          </div>

          <select
            name="group_size"
            defaultValue={String(effectiveGroupSize)}
            className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            name="cat"
            defaultValue={effectiveCat}
            className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
          >
            <option value="ALL">Todas categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button className="rounded bg-black text-white px-4 py-2 font-medium hover:bg-slate-900">
            Cambiar
          </button>
        </form>

        <div className="text-sm text-slate-800">
          Mostrando:{" "}
          <span className="font-semibold">
            {effectiveCat === "ALL" ? "Todas" : effectiveCat}
          </span>{" "}
          · Grupos: <span className="font-semibold">{visibleGroups.length}</span> ·
          Jugadores: <span className="font-semibold">{visiblePlayers}</span>
        </div>
      </section>

      <form action={generateGroupsByCategory} className="border border-slate-300 rounded-lg bg-white p-4 shadow-sm">
        <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
        <input type="hidden" name="round_id" value={effectiveRoundId} />
        <input type="hidden" name="group_size" value={effectiveGroupSize} />
        <input type="hidden" name="cat" value={effectiveCat} />

        {startingOrderConfirmed ? (
          <div className="mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            Orden definitivo confirmado. Para cambiar categorías, grupos o salidas, primero reabre el orden.
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Planeación editable del bloque</h2>
            <div className="mt-1 text-sm text-slate-700">
              Revisa la sugerencia, cambia el orden de categorías y el tamaño de grupo antes de generar. El orden se puede guardar. En shotgun, las dobles priorizan H1/H10, después pares 5, después pares 4, y los pares 3 solo se usan cuando el bloque llega cerca del máximo de 36 grupos.
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Jugadores: <span className="font-semibold">{planTotalPlayers}</span> · G4: {" "}
            <span className="font-semibold">{planTotalGroups4}</span> · G5: {" "}
            <span className="font-semibold">{planTotalGroups5}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Orden</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2 text-right">Jugadores</th>
                  <th className="px-3 py-2 text-right">G4</th>
                  <th className="px-3 py-2 text-right">G5</th>
                  <th className="px-3 py-2">Salida automática</th>
                  <th className="px-3 py-2">Grupo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {planRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={7}>
                      No hay jugadores activos/confirmados para analizar en este bloque.
                    </td>
                  </tr>
                ) : (
                  planRows.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <input type="hidden" name="plan_category_id" value={row.id} />
                        <input
                          name="plan_order"
                          type="number"
                          min={1}
                          defaultValue={row.sortOrder ?? idx + 1}
                          className="h-8 w-16 rounded border border-slate-300 bg-white px-2 text-right text-slate-950"
                          disabled={startingOrderConfirmed}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-950">{row.label}</td>
                      <td className="px-3 py-2 text-right">{row.players}</td>
                      <td className="px-3 py-2 text-right">{row.groups4}</td>
                      <td className="px-3 py-2 text-right">{row.groups5}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                          Orden impar: carril H1 · orden par: carril H10
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          name="plan_group_size"
                          defaultValue={row.groups5 <= shotgunDoubleCapacity ? "5" : String(effectiveGroupSize)}
                          className="h-8 rounded border border-slate-300 bg-white px-2 text-slate-950"
                          disabled={startingOrderConfirmed}
                        >
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
                {planRows.length > 0 ? (
                  <tr className="bg-slate-50 font-semibold text-slate-950">
                    <td className="px-3 py-2" colSpan={2}>Total bloque</td>
                    <td className="px-3 py-2 text-right">{planTotalPlayers}</td>
                    <td className="px-3 py-2 text-right">{planTotalGroups4}</td>
                    <td className="px-3 py-2 text-right">{planTotalGroups5}</td>
                    <td className="px-3 py-2" colSpan={2}>—</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <div className="font-semibold text-slate-950">Capacidad</div>
            <div className="flex justify-between gap-2">
              <span>Shotgun simple</span>
              <span className="font-semibold">{shotgunSimpleCapacity} grupos</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Shotgun doble</span>
              <span className="font-semibold">{shotgunDoubleCapacity} grupos</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Extendido pares 5</span>
              <span className="font-semibold">{shotgunExtendedCapacity} grupos</span>
            </div>
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
              {planRecommendation}
            </div>
            <div className="text-xs text-slate-600">
              Regla de salidas: se define primero el total de grupos del bloque. Las dobles empiezan por H1/H10, luego pares 5, luego pares 4. Los pares 3 quedan al final y solo entran si se necesitan para llegar hasta 36 grupos.
            </div>
            <div className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              Regla aplicada: categorías juntas, sin reiniciar hoyos por categoría, distribución automática 4/5, nunca grupos de 1 o 2. Después puedes ajustar manualmente con Drag & Drop.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={planRows.length === 0 || startingOrderConfirmed}
          >
            Generar grupos con este orden
          </button>

          <button
            type="submit"
            formAction={saveCategoryPlanOrder}
            className="rounded border border-slate-400 bg-white px-4 py-2 font-medium text-slate-950 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={planRows.length === 0 || startingOrderConfirmed}
          >
            Guardar orden de categorías
          </button>
        </div>
      </form>

      <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm flex flex-wrap gap-3">
        <form action={clearGroups}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button
            className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={startingOrderConfirmed}
          >
            Borrar grupos
          </button>
        </form>

        <form action={recalculateTeeTimes}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button
            className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={startingOrderConfirmed}
          >
            Recalcular Tee Times
          </button>
        </form>
      </section>

      <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-950">Orden definitivo del día</div>
            <div className="mt-1 text-sm text-slate-700">
              Confirma cuando ya revisaste grupos, categorías y hoyos de salida. Al confirmar se bloquean cambios accidentales.
            </div>
          </div>

          {startingOrderConfirmed ? (
            <form action={reopenStartingOrder}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="round_id" value={effectiveRoundId} />
              <input type="hidden" name="group_size" value={effectiveGroupSize} />
              <input type="hidden" name="cat" value={effectiveCat} />
              <button className="rounded border border-amber-500 bg-amber-50 px-4 py-2 font-medium text-amber-900 hover:bg-amber-100">
                Reabrir orden para editar
              </button>
            </form>
          ) : (
            <form action={confirmStartingOrder}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="round_id" value={effectiveRoundId} />
              <input type="hidden" name="group_size" value={effectiveGroupSize} />
              <input type="hidden" name="cat" value={effectiveCat} />
              <button
                className="rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={groupsForUI.length === 0}
              >
                Confirmar orden definitivo de salidas
              </button>
            </form>
          )}
        </div>
      </section>

      <TeeSheetDnD
        tournamentId={effectiveTournamentId}
        roundId={effectiveRoundId}
        targetGroupSize={effectiveGroupSize}
        maxGroupSize={MAX_GROUP_SIZE}
        groups={groupsForUI}
        initialCategory={effectiveCat}
        startingOrderConfirmed={startingOrderConfirmed}
      />
    </div>
  );
}