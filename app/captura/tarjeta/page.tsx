import { createClient } from "@/utils/supabase/server";

type HoleNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

type HoleScores = Record<HoleNumber, number | null>;

type PlayerRow = {
  id: string;
  name: string;
  initials: string;
  scores: HoleScores;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HOLES_FRONT: HoleNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HOLES_BACK: HoleNumber[] = [10, 11, 12, 13, 14, 15, 16, 17, 18];

const PAR_BY_HOLE: Record<HoleNumber, number> = {
  1: 4,
  2: 4,
  3: 3,
  4: 5,
  5: 4,
  6: 4,
  7: 4,
  8: 3,
  9: 5,
  10: 4,
  11: 5,
  12: 3,
  13: 4,
  14: 5,
  15: 4,
  16: 4,
  17: 3,
  18: 4,
};

function createEmptyScores(): HoleScores {
  return {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
    7: null,
    8: null,
    9: null,
    10: null,
    11: null,
    12: null,
    13: null,
    14: null,
    15: null,
    16: null,
    17: null,
    18: null,
  };
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildName(firstName: unknown, lastName: unknown) {
  return `${safeString(firstName)} ${safeString(lastName)}`.trim();
}

function buildInitials(fullName: string, initialsFromDb?: string | null) {
  if (initialsFromDb && initialsFromDb.trim()) {
    return initialsFromDb.trim().toUpperCase();
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 3) {
    return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
  }

  if (parts.length === 2) {
    const first = parts[0][0] ?? "";
    const last = parts[1].slice(0, 2) ?? "";
    return (first + last).toUpperCase();
  }

  return parts[0]?.slice(0, 3).toUpperCase() ?? "---";
}

function getScoreClass(score: number | null, par: number) {
  if (score === null) return "";

  const diff = score - par;

  if (diff <= -1) {
    return "rounded-full border-2 border-red-600";
  }

  if (diff === 1) {
    return "border-2 border-black";
  }

  if (diff >= 2) {
    return "border-2 border-black shadow-[inset_0_0_0_2px_white,inset_0_0_0_4px_black]";
  }

  return "";
}

function normalizeHoleNumber(row: {
  hole_no: number | null;
  hole_number: number | null;
}): HoleNumber | null {
  const raw = row.hole_no ?? row.hole_number;
  if (!raw || raw < 1 || raw > 18) return null;
  return raw as HoleNumber;
}

function Section({
  title,
  holes,
  players,
}: {
  title: string;
  holes: HoleNumber[];
  players: PlayerRow[];
}) {
  return (
    <div className="rounded-lg bg-white p-2 shadow-sm">
      <div className="mb-1 text-[11px] font-bold tracking-[0.04em] text-slate-500">
        {title}
      </div>

      <div className="overflow-hidden rounded">
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className="bg-[#0d2747] text-white">
              <th className="w-10 px-1 py-1 text-left font-bold">H</th>

              {holes.map((hole) => (
                <th key={hole} className="px-0 py-1 text-center font-bold">
                  {hole}
                </th>
              ))}

              <th className="w-8 px-0 py-1 text-center font-bold">TOT</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-slate-300 bg-slate-100">
              <td className="px-1 py-1 font-bold text-slate-800">PAR</td>

              {holes.map((hole) => (
                <td
                  key={`par-${title}-${hole}`}
                  className="px-0 py-1 text-center text-slate-800"
                >
                  {PAR_BY_HOLE[hole]}
                </td>
              ))}

              <td className="px-0 py-1 text-center font-bold text-slate-800">
                {holes.reduce((acc, hole) => acc + PAR_BY_HOLE[hole], 0)}
              </td>
            </tr>

            {players.map((player) => {
              const total = holes.reduce(
                (acc, hole) => acc + (player.scores[hole] ?? 0),
                0
              );

              return (
                <tr
                  key={player.id}
                  className="border-b border-slate-300 last:border-b-0"
                >
                  <td className="px-1 py-2 font-bold text-slate-900">
                    {player.initials}
                  </td>

                  {holes.map((hole) => (
                    <td
                      key={`${player.id}-${hole}`}
                      className="px-0 py-1 text-center"
                    >
                      <span
                        className={[
                          "inline-flex h-5 w-5 items-center justify-center text-[10px] font-bold text-slate-900",
                          getScoreClass(player.scores[hole], PAR_BY_HOLE[hole]),
                        ].join(" ")}
                      >
                        {player.scores[hole] ?? ""}
                      </span>
                    </td>
                  ))}

                  <td className="px-0 py-1 text-center font-bold text-slate-900">
                    {total > 0 ? total : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function loadPlayers(groupId: string): Promise<PlayerRow[]> {
  const supabase = await createClient();

  const { data: groupRow } = await supabase
    .from("pairing_groups")
    .select("id, round_id")
    .eq("id", groupId)
    .maybeSingle();

  const roundId = safeString(groupRow?.round_id);
  if (!roundId) return [];

  const { data: memberRows } = await supabase
    .from("pairing_group_members")
    .select("entry_id, position")
    .eq("group_id", groupId)
    .order("position", { ascending: true });

  const entryIds = (memberRows ?? [])
    .map((row) => safeString(row.entry_id))
    .filter(Boolean);

  if (entryIds.length === 0) return [];

  const { data: entryRows } = await supabase
    .from("tournament_entries")
    .select("id, player_id")
    .in("id", entryIds);

  const playerIds = (entryRows ?? [])
    .map((row) => safeString(row.player_id))
    .filter(Boolean);

  if (playerIds.length === 0) return [];

  const { data: playerRows } = await supabase
    .from("players")
    .select("id, first_name, last_name, initials")
    .in("id", playerIds);

  const { data: scoreRows } = await supabase
    .from("hole_scores")
    .select("entry_id, hole_no, hole_number, strokes")
    .eq("round_id", roundId)
    .in("entry_id", entryIds);

  const entriesById = new Map(
    (entryRows ?? []).map((row) => [safeString(row.id), safeString(row.player_id)])
  );

  const playersById = new Map(
    (playerRows ?? []).map((row) => [
      safeString(row.id),
      {
        id: safeString(row.id),
        first_name: safeString(row.first_name),
        last_name: safeString(row.last_name),
        initials: typeof row.initials === "string" ? row.initials : null,
      },
    ])
  );

  const scoresByEntryId = new Map<string, HoleScores>();

  for (const entryId of entryIds) {
    scoresByEntryId.set(entryId, createEmptyScores());
  }

  for (const row of scoreRows ?? []) {
    const entryId = safeString(row.entry_id);
    const hole = normalizeHoleNumber({
      hole_no: typeof row.hole_no === "number" ? row.hole_no : null,
      hole_number: typeof row.hole_number === "number" ? row.hole_number : null,
    });

    if (!entryId || !hole) continue;

    const scores = scoresByEntryId.get(entryId);
    if (!scores) continue;

    scores[hole] = typeof row.strokes === "number" ? row.strokes : null;
  }

  const orderedMembers = [...(memberRows ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );

  const players: PlayerRow[] = [];

  for (const member of orderedMembers) {
    const entryId = safeString(member.entry_id);
    if (!entryId) continue;

    const playerId = entriesById.get(entryId);
    if (!playerId) continue;

    const player = playersById.get(playerId);
    if (!player) continue;

    const fullName = buildName(player.first_name, player.last_name) || "Jugador";
    const initials = buildInitials(fullName, player.initials);
    const scores = scoresByEntryId.get(entryId) ?? createEmptyScores();

    players.push({
      id: entryId,
      name: fullName,
      initials,
      scores,
    });
  }

  return players;
}

export default async function TarjetaPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const rawGroupId = params.group_id;
  const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId ?? "";

  const players = groupId ? await loadPlayers(groupId) : [];

  return (
    <div className="w-full bg-slate-100">
      <div className="flex w-full justify-center bg-slate-100">
        <div className="w-full max-w-[390px] bg-slate-100">
          <div className="bg-black px-2 py-2 text-white">
            <div className="text-sm font-semibold">List.golf</div>
            <div className="text-[10px] opacity-70">Tarjeta completa</div>
          </div>

          <div className="space-y-2 p-2">
            <div className="rounded-lg bg-white p-2 text-center text-[11px] shadow-sm">
              Grupo: {groupId || "Sin group_id"}
            </div>

            {groupId && players.length === 0 ? (
              <div className="rounded-lg bg-white p-3 text-center text-[11px] text-slate-500 shadow-sm">
                No encontré jugadores para este grupo.
              </div>
            ) : null}

            <Section title="FRONT 9" holes={HOLES_FRONT} players={players} />

            <Section title="BACK 9" holes={HOLES_BACK} players={players} />
          </div>
        </div>
      </div>
    </div>
  );
}