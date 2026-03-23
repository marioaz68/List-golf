import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  clearGroups,
  generateGroupsByCategory,
  recalculateTeeTimes,
  recalculateStartingHoles,
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
  round_no: number;
  round_date: string | null;
  start_type: "tee_times" | "shotgun";
  start_time: string | null;
  interval_minutes: number | null;
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
};

type GroupUI = GroupRow & { members: MemberUI[] };

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function catSort(a: string, b: string) {
  if (a === "SIN CATEGORÍA" && b !== "SIN CATEGORÍA") return 1;
  if (b === "SIN CATEGORÍA" && a !== "SIN CATEGORÍA") return -1;
  return a.localeCompare(b);
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
        .select("id,tournament_id,round_no,round_date,start_type,start_time,interval_minutes")
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
                last_name
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
    const player = row.tournament_entries?.players;

    const item: MemberUI = {
      entry_id: row.entry_id,
      group_id: gid,
      position: Number(row.position ?? 0),
      first_name: player?.first_name ?? null,
      last_name: player?.last_name ?? null,
      handicap_index: row.tournament_entries?.handicap_index ?? null,
    };

    if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
    membersByGroup.get(gid)!.push(item);
  }

  const groupsForUI: GroupUI[] = groups.map((g) => ({
    ...g,
    members: membersByGroup.get(g.id) ?? [],
  }));

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

  const roundLabel = (r: Round) =>
    `R${r.round_no}` +
    (r.round_date ? ` (${r.round_date})` : "") +
    ` — ${r.start_type}` +
    (r.start_time ? ` ${r.start_time}` : "") +
    (r.interval_minutes ? ` / ${r.interval_minutes}min` : "");

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
      <div className="flex items-center justify-between text-white">
        <h1 className="text-3xl font-bold tracking-tight">Tee Sheet</h1>
        <div className="rounded-md bg-black/20 px-3 py-1 text-sm font-medium">
          Grupos: {visibleGroups.length} · Jugadores: {visiblePlayers}
        </div>
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

          <select
            name="round_id"
            defaultValue={effectiveRoundId}
            className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {roundLabel(r)}
              </option>
            ))}
          </select>

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

      <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm flex flex-wrap gap-3">
        <form action={generateGroupsByCategory}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button className="rounded bg-black text-white px-4 py-2 font-medium hover:bg-slate-900">
            Generar grupos
          </button>
        </form>

        <form action={clearGroups}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black">
            Borrar grupos
          </button>
        </form>

        <form action={recalculateTeeTimes}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black">
            Recalcular Tee Times
          </button>
        </form>

        <form action={recalculateStartingHoles}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black">
            Recalcular Starting Holes
          </button>
        </form>
      </section>

      <TeeSheetDnD
        tournamentId={effectiveTournamentId}
        roundId={effectiveRoundId}
        targetGroupSize={effectiveGroupSize}
        maxGroupSize={MAX_GROUP_SIZE}
        groups={groupsForUI}
        initialCategory={effectiveCat}
      />
    </div>
  );
}