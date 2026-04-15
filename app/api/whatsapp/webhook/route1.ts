import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp_phone_e164: string | null;
  initials: string | null;
};

type EntryRow = {
  id: string;
  player_id: string;
  tournament_id: string;
  status: string | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  start_date: string | null;
};

type RoundRow = {
  id: string;
  tournament_id: string;
  round_no: number | null;
  round_date: string | null;
};

type PairingGroupRow = {
  id: string;
  round_id: string;
  starting_hole: number | null;
};

type PairingGroupMemberRow = {
  group_id: string;
  entry_id: string;
  position: number | null;
};

type GroupMemberView = {
  position: number;
  entry_id: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
};

type ContextResult =
  | {
      ok: true;
      context: {
        tournament: {
          id: string;
          name: string | null;
        };
        round: {
          id: string;
          tournament_id: string;
          round_no: number | null;
        };
        player: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          whatsapp_phone_e164: string | null;
          initials: string | null;
        };
        entry: {
          id: string;
          player_id: string;
          tournament_id: string;
          status: string | null;
        };
        group: {
          id: string;
          starting_hole: number;
          position: number;
        };
      };
    }
  | {
      ok: false;
      message: string;
    };

type ParsedSingleScore = {
  kind: "single";
  hole: number;
  strokes: number;
};

type ParsedInitialsScore = {
  kind: "initials";
  initials: string;
  hole: number;
  strokes: number;
};

type ParsedGroupOrderScore = {
  kind: "group_order";
  hole: number;
  strokesByPosition: number[];
};

type ParsedGroupInitialsScore = {
  kind: "group_initials";
  hole: number;
  items: Array<{
    initials: string;
    strokes: number;
  }>;
};

type ParsedMessage =
  | ParsedSingleScore
  | ParsedInitialsScore
  | ParsedGroupOrderScore
  | ParsedGroupInitialsScore
  | null;

type ParsedEnvelope = {
  isCorrection: boolean;
  message: ParsedMessage;
};

type SaveHoleScoreResult = {
  roundScoreId: string;
  savedHoles: number[];
  grossScore: number;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twimlMessage(body: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${xmlEscape(body)}</Message>
</Response>`;

  console.log("TWIML BODY:", body);
  console.log("TWIML RESPONSE:", xml);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function normalizePhone(raw: string | null) {
  const base = (raw ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "")
    .trim();

  if (!base) return "";

  const digits = base.replace(/\D/g, "");
  return digits || "";
}

function normalizeBody(raw: string | null) {
  return (raw ?? "").trim().toUpperCase();
}

function stripCorrectionPrefix(body: string) {
  return body.replace(/^CORREGIR\s+/i, "").trim();
}

function initialsFromName(firstName: string | null, lastName: string | null) {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const parts = `${first} ${last}`
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return "JUG";

  return parts
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function normalizeInitials(value: string | null) {
  return (value ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase().trim();
}

function hasAtLeastOneLetter(value: string) {
  return /[A-Z]/i.test(value);
}

function parseSingleScoreMessage(body: string): ParsedSingleScore | null {
  const normalized = normalizeBody(body);

  let match = normalized.match(/^H\s*(\d{1,2})\s*[:=\- ]\s*(\d{1,2})$/i);
  if (match) {
    const hole = Number(match[1]);
    const strokes = Number(match[2]);
    if (hole >= 1 && hole <= 18 && strokes >= 1 && strokes <= 20) {
      return { kind: "single", hole, strokes };
    }
  }

  match = normalized.match(/^(\d{1,2})\s+(\d{1,2})$/);
  if (match) {
    const hole = Number(match[1]);
    const strokes = Number(match[2]);
    if (hole >= 1 && hole <= 18 && strokes >= 1 && strokes <= 20) {
      return { kind: "single", hole, strokes };
    }
  }

  return null;
}

function parseInitialsScoreMessage(body: string): ParsedInitialsScore | null {
  const normalized = normalizeBody(body);

  let match = normalized.match(
    /^([A-Z0-9]{2,10})\s+H\s*(\d{1,2})\s*[:=\- ]\s*(\d{1,2})$/i
  );
  if (match) {
    const initials = normalizeInitials(match[1]);
    const hole = Number(match[2]);
    const strokes = Number(match[3]);
    if (
      initials &&
      hasAtLeastOneLetter(initials) &&
      hole >= 1 &&
      hole <= 18 &&
      strokes >= 1 &&
      strokes <= 20
    ) {
      return { kind: "initials", initials, hole, strokes };
    }
  }

  match = normalized.match(/^([A-Z0-9]{2,10})\s+(\d{1,2})\s+(\d{1,2})$/i);
  if (match) {
    const initials = normalizeInitials(match[1]);
    const hole = Number(match[2]);
    const strokes = Number(match[3]);
    if (
      initials &&
      hasAtLeastOneLetter(initials) &&
      hole >= 1 &&
      hole <= 18 &&
      strokes >= 1 &&
      strokes <= 20
    ) {
      return { kind: "initials", initials, hole, strokes };
    }
  }

  return null;
}

function parseGroupOrderScoreMessage(body: string): ParsedGroupOrderScore | null {
  const normalized = normalizeBody(body);

  const match = normalized.match(
    /^H\s*(\d{1,2})\s+(\d{1,2})(?:\s+(\d{1,2}))?(?:\s+(\d{1,2}))?(?:\s+(\d{1,2}))?$/i
  );

  if (!match) return null;

  const hole = Number(match[1]);
  if (!(hole >= 1 && hole <= 18)) return null;

  const numbers = [match[2], match[3], match[4], match[5]]
    .filter(Boolean)
    .map((v) => Number(v));

  if (numbers.length < 2 || numbers.length > 4) return null;
  if (numbers.some((n) => !(n >= 1 && n <= 20))) return null;

  return {
    kind: "group_order",
    hole,
    strokesByPosition: numbers,
  };
}

function parseGroupInitialsScoreMessage(
  body: string
): ParsedGroupInitialsScore | null {
  const normalized = normalizeBody(body);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  if (tokens.length < 5) return null;
  if (!tokens[0]?.startsWith("H")) return null;

  const hole = Number(tokens[0].replace(/^H/i, ""));
  if (!(hole >= 1 && hole <= 18)) return null;

  const rest = tokens.slice(1);
  if (rest.length < 4 || rest.length % 2 !== 0) return null;

  const items: Array<{ initials: string; strokes: number }> = [];

  for (let i = 0; i < rest.length; i += 2) {
    const initials = normalizeInitials(rest[i] ?? "");
    const strokes = Number(rest[i + 1]);

    if (
      !initials ||
      !hasAtLeastOneLetter(initials) ||
      !(strokes >= 1 && strokes <= 20)
    ) {
      return null;
    }

    items.push({ initials, strokes });
  }

  if (items.length < 2 || items.length > 4) return null;

  return {
    kind: "group_initials",
    hole,
    items,
  };
}

function parseIncomingMessage(body: string): ParsedMessage {
  return (
    parseGroupOrderScoreMessage(body) ??
    parseGroupInitialsScoreMessage(body) ??
    parseInitialsScoreMessage(body) ??
    parseSingleScoreMessage(body)
  );
}

function parseEnvelope(body: string): ParsedEnvelope {
  const normalized = normalizeBody(body);
  const isCorrection = /^CORREGIR\s+/i.test(normalized);
  const cleanBody = isCorrection ? stripCorrectionPrefix(normalized) : normalized;

  return {
    isCorrection,
    message: parseIncomingMessage(cleanBody),
  };
}

function holeSequenceFromStartingHole(startingHole: number) {
  const safeStart =
    Number.isFinite(startingHole) && startingHole >= 1 && startingHole <= 18
      ? startingHole
      : 1;

  return Array.from({ length: 18 }, (_, i) => ((safeStart - 1 + i) % 18) + 1);
}

function getNextHoleFromSavedHoles(
  startingHole: number,
  savedHoles: number[]
): number | null {
  const sequence = holeSequenceFromStartingHole(startingHole);
  const savedSet = new Set(savedHoles);

  for (const hole of sequence) {
    if (!savedSet.has(hole)) return hole;
  }

  return null;
}

function getPlayedCount(savedHoles: number[]) {
  return new Set(savedHoles).size;
}

async function findPlayerByPhone(
  supabase: ReturnType<typeof getAdminClient>,
  normalizedPhone: string
): Promise<PlayerRow | null> {
  const plusPhone = normalizedPhone ? `+${normalizedPhone}` : "";
  const last10 =
    normalizedPhone.length >= 10
      ? normalizedPhone.slice(normalizedPhone.length - 10)
      : normalizedPhone;

  const { data, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, phone, whatsapp_phone_e164, initials")
    .or(
      [
        `phone.eq.${normalizedPhone}`,
        `phone.eq.${plusPhone}`,
        `whatsapp_phone_e164.eq.${normalizedPhone}`,
        `whatsapp_phone_e164.eq.${plusPhone}`,
      ].join(",")
    )
    .limit(10);

  if (error) {
    console.error("PLAYER SEARCH EXACT ERROR:", error);
    return null;
  }

  const rows = (data ?? []) as PlayerRow[];
  if (rows.length > 0) return rows[0];

  const { data: looseData, error: looseError } = await supabase
    .from("players")
    .select("id, first_name, last_name, phone, whatsapp_phone_e164, initials")
    .or([`phone.ilike.%${last10}%`, `whatsapp_phone_e164.ilike.%${last10}%`].join(","))
    .limit(10);

  if (looseError) {
    console.error("PLAYER SEARCH LOOSE ERROR:", looseError);
    return null;
  }

  const looseRows = (looseData ?? []) as PlayerRow[];
  return looseRows[0] ?? null;
}

async function resolveContext(
  supabase: ReturnType<typeof getAdminClient>,
  normalizedPhone: string
): Promise<ContextResult> {
  const player = await findPlayerByPhone(supabase, normalizedPhone);

  if (!player) {
    return {
      ok: false,
      message: `ERROR JUGADOR: Número no registrado en players: ${normalizedPhone}`,
    };
  }

  const { data: entriesData, error: entriesError } = await supabase
    .from("tournament_entries")
    .select("id, player_id, tournament_id, status")
    .eq("player_id", player.id)
    .in("status", ["confirmed", "active", "paid", "registered"]);

  if (entriesError) {
    console.error("ENTRIES ERROR:", entriesError);
    return {
      ok: false,
      message: "ERROR ENTRIES: no se pudo consultar tournament_entries",
    };
  }

  const entries = (entriesData ?? []) as EntryRow[];
  if (entries.length === 0) {
    return {
      ok: false,
      message: `ERROR ENTRY: No hay inscripción activa para ${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
    };
  }

  const tournamentIds = Array.from(new Set(entries.map((e) => e.tournament_id)));

  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name, status, start_date")
    .in("id", tournamentIds);

  if (tournamentsError) {
    console.error("TOURNAMENTS ERROR:", tournamentsError);
    return {
      ok: false,
      message: "ERROR TOURNAMENTS: no se pudo consultar tournaments",
    };
  }

  const tournaments = (tournamentsData ?? []) as TournamentRow[];

  const rankedTournaments = tournaments
    .slice()
    .sort((a, b) => {
      const score = (row: TournamentRow) => {
        let s = 0;
        const status = (row.status ?? "").toLowerCase();
        if (status === "active" || status === "activo") s += 1000;
        if (status === "draft" || status === "borrador") s += 100;
        if (row.start_date) s += new Date(row.start_date).getTime() / 1e11;
        return s;
      };
      return score(b) - score(a);
    });

  let chosenTournament: TournamentRow | null = null;
  let chosenEntry: EntryRow | null = null;
  let chosenRound: RoundRow | null = null;
  let chosenGroup: PairingGroupRow | null = null;
  let chosenPosition = 1;

  for (const tournament of rankedTournaments) {
    const entry =
      entries.find((e) => e.tournament_id === tournament.id) ?? null;
    if (!entry) continue;

    const { data: roundsData, error: roundsError } = await supabase
      .from("rounds")
      .select("id, tournament_id, round_no, round_date")
      .eq("tournament_id", tournament.id)
      .order("round_no", { ascending: false });

    if (roundsError) {
      console.error("ROUNDS ERROR:", roundsError);
      continue;
    }

    const rounds = (roundsData ?? []) as RoundRow[];
    if (rounds.length === 0) continue;

    for (const round of rounds) {
      const { data: memberData, error: memberError } = await supabase
        .from("pairing_group_members")
        .select("group_id, entry_id, position")
        .eq("entry_id", entry.id);

      if (memberError) {
        console.error("PAIRING_GROUP_MEMBERS ERROR:", memberError);
        continue;
      }

      const memberRows = (memberData ?? []) as PairingGroupMemberRow[];
      if (memberRows.length === 0) continue;

      const groupIds = Array.from(new Set(memberRows.map((m) => m.group_id)));

      const { data: groupsData, error: groupsError } = await supabase
        .from("pairing_groups")
        .select("id, round_id, starting_hole")
        .in("id", groupIds)
        .eq("round_id", round.id);

      if (groupsError) {
        console.error("PAIRING_GROUPS ERROR:", groupsError);
        continue;
      }

      const groups = (groupsData ?? []) as PairingGroupRow[];
      if (groups.length === 0) continue;

      const group = groups[0];
      const member = memberRows.find((m) => m.group_id === group.id) ?? null;

      if (!member) continue;

      chosenTournament = tournament;
      chosenEntry = entry;
      chosenRound = round;
      chosenGroup = group;
      chosenPosition = member.position ?? 1;
      break;
    }

    if (chosenTournament && chosenEntry && chosenRound && chosenGroup) {
      break;
    }
  }

  if (!chosenTournament || !chosenEntry || !chosenRound || !chosenGroup) {
    return {
      ok: false,
      message:
        "ERROR CONTEXTO: No se encontró torneo/ronda/grupo activo para ese jugador",
    };
  }

  return {
    ok: true,
    context: {
      tournament: {
        id: chosenTournament.id,
        name: chosenTournament.name,
      },
      round: {
        id: chosenRound.id,
        tournament_id: chosenRound.tournament_id,
        round_no: chosenRound.round_no,
      },
      player: {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        phone: player.phone,
        whatsapp_phone_e164: player.whatsapp_phone_e164,
        initials: player.initials,
      },
      entry: {
        id: chosenEntry.id,
        player_id: chosenEntry.player_id,
        tournament_id: chosenEntry.tournament_id,
        status: chosenEntry.status,
      },
      group: {
        id: chosenGroup.id,
        starting_hole: chosenGroup.starting_hole ?? 1,
        position: chosenPosition,
      },
    },
  };
}

async function getGroupMembers(
  supabase: ReturnType<typeof getAdminClient>,
  groupId: string
): Promise<{ ok: true; members: GroupMemberView[] } | { ok: false; message: string }> {
  const { data: membersData, error: membersError } = await supabase
    .from("pairing_group_members")
    .select("group_id, entry_id, position")
    .eq("group_id", groupId)
    .order("position", { ascending: true });

  if (membersError) {
    console.error("GROUP MEMBERS SELECT ERROR:", membersError);
    return {
      ok: false,
      message: "ERROR GROUP MEMBERS: no se pudo consultar pairing_group_members",
    };
  }

  const memberRows = (membersData ?? []) as PairingGroupMemberRow[];
  if (memberRows.length === 0) {
    return {
      ok: false,
      message: "ERROR GROUP MEMBERS: grupo sin integrantes",
    };
  }

  const entryIds = memberRows.map((m) => m.entry_id);

  const { data: entriesData, error: entriesError } = await supabase
    .from("tournament_entries")
    .select("id, player_id")
    .in("id", entryIds);

  if (entriesError) {
    console.error("GROUP ENTRIES ERROR:", entriesError);
    return {
      ok: false,
      message: "ERROR GROUP ENTRIES: no se pudo consultar tournament_entries",
    };
  }

  const entryMap = new Map<string, { id: string; player_id: string }>();
  for (const row of entriesData ?? []) {
    entryMap.set(row.id as string, {
      id: row.id as string,
      player_id: row.player_id as string,
    });
  }

  const playerIds = Array.from(
    new Set(
      Array.from(entryMap.values())
        .map((e) => e.player_id)
        .filter(Boolean)
    )
  );

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, last_name, initials")
    .in("id", playerIds);

  if (playersError) {
    console.error("GROUP PLAYERS ERROR:", playersError);
    return {
      ok: false,
      message: "ERROR GROUP PLAYERS: no se pudo consultar players",
    };
  }

  const playerMap = new Map<
    string,
    {
      id: string;
      first_name: string | null;
      last_name: string | null;
      initials: string | null;
    }
  >();

  for (const row of playersData ?? []) {
    playerMap.set(row.id as string, {
      id: row.id as string,
      first_name: (row.first_name as string | null) ?? null,
      last_name: (row.last_name as string | null) ?? null,
      initials: (row.initials as string | null) ?? null,
    });
  }

  const members: GroupMemberView[] = memberRows.map((m) => {
    const entry = entryMap.get(m.entry_id);
    const player = entry ? playerMap.get(entry.player_id) : undefined;
    return {
      position: m.position ?? 0,
      entry_id: m.entry_id,
      player_id: entry?.player_id ?? "",
      first_name: player?.first_name ?? null,
      last_name: player?.last_name ?? null,
      initials:
        normalizeInitials(player?.initials) ||
        initialsFromName(player?.first_name ?? null, player?.last_name ?? null),
    };
  });

  return { ok: true, members };
}

async function getExistingHoleScore(
  supabase: ReturnType<typeof getAdminClient>,
  entryId: string,
  roundId: string,
  holeNo: number
): Promise<number | null> {
  const { data, error } = await supabase
    .from("hole_scores")
    .select("strokes, hole_no, hole_number")
    .eq("entry_id", entryId)
    .eq("round_id", roundId)
    .or(`hole_no.eq.${holeNo},hole_number.eq.${holeNo}`)
    .limit(1);

  if (error) {
    console.error("GET EXISTING HOLE SCORE ERROR:", error);
    throw new Error("No se pudo consultar hole_scores");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const strokes =
    typeof row.strokes === "number" ? row.strokes : Number(row.strokes);

  return Number.isFinite(strokes) ? strokes : null;
}

async function getOrCreateRoundScore(
  supabase: ReturnType<typeof getAdminClient>,
  playerId: string,
  roundId: string
) {
  const { data: existingData, error: existingError } = await supabase
    .from("round_scores")
    .select("id, player_id, round_id, gross_score")
    .eq("player_id", playerId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (existingError) {
    console.error("ROUND SCORE EXISTING ERROR:", existingError);
    throw new Error("No se pudo consultar round_scores");
  }

  if (existingData?.id) {
    return {
      id: existingData.id as string,
    };
  }

  const { data: insertedData, error: insertedError } = await supabase
    .from("round_scores")
    .insert({
      player_id: playerId,
      round_id: roundId,
      gross_score: 0,
    })
    .select("id")
    .single();

  if (insertedError || !insertedData?.id) {
    console.error("ROUND SCORE INSERT ERROR:", insertedError);
    throw new Error("No se pudo crear round_scores");
  }

  return {
    id: insertedData.id as string,
  };
}

async function saveHoleScore(
  supabase: ReturnType<typeof getAdminClient>,
  playerId: string,
  entryId: string,
  roundId: string,
  holeNo: number,
  strokes: number
): Promise<SaveHoleScoreResult> {
  const roundScore = await getOrCreateRoundScore(supabase, playerId, roundId);

  const { error: upsertError } = await supabase.from("hole_scores").upsert(
    {
      entry_id: entryId,
      round_id: roundId,
      round_score_id: roundScore.id,
      hole_no: holeNo,
      hole_number: holeNo,
      strokes,
    },
    {
      onConflict: "entry_id,round_id,hole_no",
    }
  );

  if (upsertError) {
    console.error("HOLE SCORE UPSERT ERROR:", upsertError);
    throw new Error(
      upsertError.message || "No se pudo guardar el score del hoyo"
    );
  }

  const { data: allHoleData, error: allHoleError } = await supabase
    .from("hole_scores")
    .select("hole_no, hole_number, strokes")
    .eq("entry_id", entryId)
    .eq("round_id", roundId);

  if (allHoleError) {
    console.error("HOLE SCORES READBACK ERROR:", allHoleError);
    throw new Error("No se pudo recalcular el total");
  }

  const allHoles = (allHoleData ?? []) as Array<{
    hole_no: number | null;
    hole_number: number | null;
    strokes: number | null;
  }>;

  const savedHoles = Array.from(
    new Set(
      allHoles
        .map((r) =>
          typeof r.hole_no === "number" ? r.hole_no : r.hole_number
        )
        .filter((n): n is number => typeof n === "number")
    )
  ).sort((a, b) => a - b);

  const grossScore = allHoles.reduce((sum, row) => sum + (row.strokes ?? 0), 0);

  const { error: updateRoundError } = await supabase
    .from("round_scores")
    .update({ gross_score: grossScore })
    .eq("id", roundScore.id);

  if (updateRoundError) {
    console.error("ROUND SCORE UPDATE ERROR:", updateRoundError);
    throw new Error("No se pudo actualizar gross_score");
  }

  return {
    roundScoreId: roundScore.id,
    savedHoles,
    grossScore,
  };
}

function buildInicioMessage(args: {
  tournamentName: string | null;
  roundNo: number | null;
  members: GroupMemberView[];
  startingHole: number;
  nextHole: number | null;
  savedHoles: number[];
}) {
  const playedCount = getPlayedCount(args.savedHoles);
  const memberCodes = args.members
    .map((m) => m.initials || initialsFromName(m.first_name, m.last_name))
    .join(" ");

  const lines = [
    "INICIO OK",
    memberCodes || "-",
    `CAPT: ${playedCount}/18`,
    args.nextHole ? `SIG: H${args.nextHole}` : "FIN RONDA",
  ];

  return lines.join("\n");
}

function buildSavedMessage(args: {
  tournamentName: string | null;
  roundNo: number | null;
  hole: number;
  strokes: number;
  nextHole: number | null;
  playerInitials: string;
  savedHoles: number[];
  grossScore: number;
  corrected?: boolean;
}) {
  const playedCount = getPlayedCount(args.savedHoles);

  const lines = [
    args.corrected
      ? `OK CORREGIDO ${args.playerInitials}`
      : `OK ${args.playerInitials}`,
    `H${args.hole} ${args.strokes}`,
    `ACUM: ${args.grossScore}`,
    `CAPT: ${playedCount}/18`,
    args.nextHole ? `SIG: H${args.nextHole}` : "FIN RONDA",
  ];

  return lines.join("\n");
}

function buildUnknownInitialsMessage(
  requestedInitials: string,
  members: GroupMemberView[]
) {
  const available = members.map((m) => m.initials || "-").join(", ");

  return [
    `INICIALES NO ENCONTRADAS: ${requestedInitials}`,
    "",
    "DISPONIBLES EN EL GRUPO:",
    available || "-",
  ].join("\n");
}

function buildGroupSavedMessage(args: {
  tournamentName: string | null;
  roundNo: number | null;
  hole: number;
  lines: string[];
  nextHole: number | null;
  corrected?: boolean;
}) {
  const base = [
    args.corrected ? "OK GRUPO CORREGIDO" : "OK GRUPO",
    `H${args.hole}`,
    ...args.lines,
    args.nextHole ? `SIG: H${args.nextHole}` : "FIN RONDA",
  ];

  return base.join("\n");
}

function buildAlreadyExistsMessage(args: {
  initials: string;
  hole: number;
  existingStrokes: number;
}) {
  return [
    "YA EXISTE SCORE",
    `${args.initials}: H${args.hole} ${args.existingStrokes}`,
    "",
    "USA:",
    `CORREGIR ${args.initials} H${args.hole} NUEVO_SCORE`,
    "",
    "EJEMPLO:",
    `CORREGIR ${args.initials} H${args.hole} 5`,
  ].join("\n");
}

function buildGroupAlreadyExistsMessage(lines: string[]) {
  return [
    "YA EXISTEN SCORES",
    "",
    ...lines,
    "",
    "USA CORREGIR PARA SOBRESCRIBIR",
  ].join("\n");
}

async function processIncomingWebhook(rawFrom: string, rawBody: string) {
  const normalizedPhone = normalizePhone(rawFrom);
  const normalizedBody = normalizeBody(rawBody);
  const parsedEnvelope = parseEnvelope(normalizedBody);

  console.log("WEBHOOK NORMALIZED PHONE:", normalizedPhone);
  console.log("WEBHOOK NORMALIZED BODY:", normalizedBody);
  console.log("WEBHOOK PARSED ENVELOPE:", parsedEnvelope);

  if (!normalizedPhone) {
    return "ERROR TELÉFONO: no llegó From válido";
  }

  if (!normalizedBody) {
    return "MENSAJE VACÍO";
  }

  const supabase = getAdminClient();
  console.log("SUPABASE ADMIN CLIENT OK");

  if (normalizedBody === "INICIO") {
    console.log("ENTRO A FLUJO INICIO");

    const contextResult = await resolveContext(supabase, normalizedPhone);
    console.log("CONTEXT RESULT:", contextResult);

    if (!contextResult.ok) {
      return contextResult.message;
    }

    const membersResult = await getGroupMembers(
      supabase,
      contextResult.context.group.id
    );
    console.log("GROUP MEMBERS RESULT:", membersResult);

    if (!membersResult.ok) {
      return membersResult.message;
    }

    const { data: holeData, error: holeError } = await supabase
      .from("hole_scores")
      .select("hole_no, hole_number")
      .eq("entry_id", contextResult.context.entry.id)
      .eq("round_id", contextResult.context.round.id);

    if (holeError) {
      console.error("READ PLAYER HOLES ON INICIO ERROR:", holeError);
    }

    const savedHoles = Array.from(
      new Set(
        ((holeData ?? []) as Array<{
          hole_no: number | null;
          hole_number: number | null;
        }>)
          .map((r) =>
            typeof r.hole_no === "number" ? r.hole_no : r.hole_number
          )
          .filter((n): n is number => typeof n === "number")
      )
    ).sort((a, b) => a - b);

    const nextHole = getNextHoleFromSavedHoles(
      contextResult.context.group.starting_hole,
      savedHoles
    );

    return buildInicioMessage({
      tournamentName: contextResult.context.tournament.name,
      roundNo: contextResult.context.round.round_no,
      members: membersResult.members,
      startingHole: contextResult.context.group.starting_hole,
      nextHole,
      savedHoles,
    });
  }

  if (parsedEnvelope.message) {
    console.log("ENTRO A FLUJO SCORE");

    const contextResult = await resolveContext(supabase, normalizedPhone);
    console.log("CONTEXT RESULT:", contextResult);

    if (!contextResult.ok) {
      return "ENVIA INICIO";
    }

    const membersResult = await getGroupMembers(
      supabase,
      contextResult.context.group.id
    );
    console.log("GROUP MEMBERS RESULT:", membersResult);

    if (!membersResult.ok) {
      return membersResult.message;
    }

    const parsedMessage = parsedEnvelope.message;
    const isCorrection = parsedEnvelope.isCorrection;

    if (parsedMessage.kind === "group_order") {
      const orderedMembers = membersResult.members
        .slice()
        .sort((a, b) => a.position - b.position);

      if (parsedMessage.strokesByPosition.length > orderedMembers.length) {
        return `EL GRUPO TIENE ${orderedMembers.length} JUGADORES Y ENVIASTE ${parsedMessage.strokesByPosition.length} SCORES`;
      }

      if (!isCorrection) {
        const duplicates: string[] = [];
        for (let i = 0; i < parsedMessage.strokesByPosition.length; i += 1) {
          const member = orderedMembers[i];
          if (!member) continue;
          const existing = await getExistingHoleScore(
            supabase,
            member.entry_id,
            contextResult.context.round.id,
            parsedMessage.hole
          );
          if (existing !== null) {
            duplicates.push(
              `${member.initials || `J${i + 1}`}: H${parsedMessage.hole} ${existing}`
            );
          }
        }
        if (duplicates.length > 0) {
          return buildGroupAlreadyExistsMessage(duplicates);
        }
      }

      const results: Array<{
        initials: string;
        strokes: number;
        grossScore: number;
        savedHoles: number[];
      }> = [];

      for (let i = 0; i < parsedMessage.strokesByPosition.length; i += 1) {
        const member = orderedMembers[i];
        const strokes = parsedMessage.strokesByPosition[i];

        if (!member) continue;

        const saveResult = await saveHoleScore(
          supabase,
          member.player_id,
          member.entry_id,
          contextResult.context.round.id,
          parsedMessage.hole,
          strokes
        );

        results.push({
          initials: member.initials || `J${i + 1}`,
          strokes,
          grossScore: saveResult.grossScore,
          savedHoles: saveResult.savedHoles,
        });
      }

      const nextHole = parsedMessage.hole >= 18 ? null : parsedMessage.hole + 1;

      return buildGroupSavedMessage({
        tournamentName: contextResult.context.tournament.name,
        roundNo: contextResult.context.round.round_no,
        hole: parsedMessage.hole,
        lines: results.map(
          (r) =>
            `${r.initials}: ${r.strokes} | ACUM: ${r.grossScore} | CAPT: ${getPlayedCount(r.savedHoles)}/18`
        ),
        nextHole,
        corrected: isCorrection,
      });
    }

    if (parsedMessage.kind === "group_initials") {
      if (!isCorrection) {
        const duplicates: string[] = [];

        for (const item of parsedMessage.items) {
          const requestedInitials = normalizeInitials(item.initials);
          const targetMember =
            membersResult.members.find(
              (m) => normalizeInitials(m.initials) === requestedInitials
            ) ?? null;

          if (!targetMember) {
            return buildUnknownInitialsMessage(
              requestedInitials,
              membersResult.members
            );
          }

          const existing = await getExistingHoleScore(
            supabase,
            targetMember.entry_id,
            contextResult.context.round.id,
            parsedMessage.hole
          );

          if (existing !== null) {
            duplicates.push(
              `${targetMember.initials || requestedInitials}: H${parsedMessage.hole} ${existing}`
            );
          }
        }

        if (duplicates.length > 0) {
          return buildGroupAlreadyExistsMessage(duplicates);
        }
      }

      const results: Array<{
        initials: string;
        strokes: number;
        grossScore: number;
        savedHoles: number[];
      }> = [];

      for (const item of parsedMessage.items) {
        const requestedInitials = normalizeInitials(item.initials);

        const targetMember =
          membersResult.members.find(
            (m) => normalizeInitials(m.initials) === requestedInitials
          ) ?? null;

        if (!targetMember) {
          return buildUnknownInitialsMessage(
            requestedInitials,
            membersResult.members
          );
        }

        const saveResult = await saveHoleScore(
          supabase,
          targetMember.player_id,
          targetMember.entry_id,
          contextResult.context.round.id,
          parsedMessage.hole,
          item.strokes
        );

        results.push({
          initials: targetMember.initials || requestedInitials,
          strokes: item.strokes,
          grossScore: saveResult.grossScore,
          savedHoles: saveResult.savedHoles,
        });
      }

      const nextHole = parsedMessage.hole >= 18 ? null : parsedMessage.hole + 1;

      return buildGroupSavedMessage({
        tournamentName: contextResult.context.tournament.name,
        roundNo: contextResult.context.round.round_no,
        hole: parsedMessage.hole,
        lines: results.map(
          (r) =>
            `${r.initials}: ${r.strokes} | ACUM: ${r.grossScore} | CAPT: ${getPlayedCount(r.savedHoles)}/18`
        ),
        nextHole,
        corrected: isCorrection,
      });
    }

    let targetEntryId = contextResult.context.entry.id;
    let targetPlayerId = contextResult.context.player.id;
    let targetInitials =
      normalizeInitials(contextResult.context.player.initials) ||
      initialsFromName(
        contextResult.context.player.first_name,
        contextResult.context.player.last_name
      );

    const hole = parsedMessage.hole;
    const strokes = parsedMessage.strokes;

    if (parsedMessage.kind === "initials") {
      const requestedInitials = normalizeInitials(parsedMessage.initials);

      const targetMember =
        membersResult.members.find(
          (m) => normalizeInitials(m.initials) === requestedInitials
        ) ?? null;

      if (!targetMember) {
        return buildUnknownInitialsMessage(
          requestedInitials,
          membersResult.members
        );
      }

      targetEntryId = targetMember.entry_id;
      targetPlayerId = targetMember.player_id;
      targetInitials = targetMember.initials || requestedInitials;
    }

    if (!isCorrection) {
      const existing = await getExistingHoleScore(
        supabase,
        targetEntryId,
        contextResult.context.round.id,
        hole
      );

      if (existing !== null) {
        return buildAlreadyExistsMessage({
          initials: targetInitials || "JUG",
          hole,
          existingStrokes: existing,
        });
      }
    }

    const saveResult = await saveHoleScore(
      supabase,
      targetPlayerId,
      targetEntryId,
      contextResult.context.round.id,
      hole,
      strokes
    );

    console.log("SAVE RESULT:", saveResult);

    const nextHole = getNextHoleFromSavedHoles(
      contextResult.context.group.starting_hole,
      saveResult.savedHoles
    );

    return buildSavedMessage({
      tournamentName: contextResult.context.tournament.name,
      roundNo: contextResult.context.round.round_no,
      hole,
      strokes,
      nextHole,
      playerInitials: targetInitials || "JUG",
      savedHoles: saveResult.savedHoles,
      grossScore: saveResult.grossScore,
      corrected: isCorrection,
    });
  }

  return [
    "FORMATO INVÁLIDO",
    "",
    "Usa alguno de estos:",
    "INICIO",
    "H1 5",
    "H2 4",
    "3 5",
    "MAZ H5 4",
    "APG H5 5",
    "H6 4 5 6 5",
    "H6 MAZ 4 APG 5 ALG 6 LSR 5",
    "CORREGIR H7 6",
    "CORREGIR MAZ H7 6",
    "CORREGIR H7 5 4 6 5",
    "CORREGIR H7 MAZ 5 APG 4 ALG 6 LSR 5",
  ].join("\n");
}

export async function POST(request: Request) {
  console.log("=== WHATSAPP WEBHOOK POST START ===");

  try {
    const formData = await request.formData();

    const rawFrom = String(formData.get("From") ?? "");
    const rawBody = String(formData.get("Body") ?? "");

    console.log("WEBHOOK RAW From:", rawFrom);
    console.log("WEBHOOK RAW Body:", rawBody);

    const finalMessage = await processIncomingWebhook(rawFrom, rawBody);

    console.log("FINAL MESSAGE DIRECT TO TWIML:", finalMessage);

    return twimlMessage(finalMessage);
  } catch (error) {
    console.error("WHATSAPP WEBHOOK POST ERROR:", error);
    return twimlMessage("ERROR INTERNO EN WEBHOOK");
  }
}