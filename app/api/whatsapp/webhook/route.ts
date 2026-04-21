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

function generateAccessLink(args: {
  tournamentId: string;
  roundId: string;
  entryId: string;
  phone: string;
}) {
  // Paso 1 temporal:
  // luego este token se reemplaza por uno seguro guardado en DB
  const token = Buffer.from(
    `${args.entryId}|${args.roundId}|${args.phone}|${Date.now()}`
  ).toString("base64");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return `${baseUrl}/score-entry/mobile?token=${encodeURIComponent(token)}`;
}

async function findPlayerByPhone(
  supabase: ReturnType<typeof getAdminClient>,
  normalizedPhone: string
): Promise<PlayerRow | null> {
  const plusPhone = normalizedPhone ? `+${normalizedPhone}` : "";

  const { data, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, phone, whatsapp_phone_e164, initials")
    .or(
      [
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
  return rows[0] ?? null;
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

async function processIncomingWebhook(rawFrom: string, rawBody: string) {
  const normalizedPhone = normalizePhone(rawFrom);
  const normalizedBody = normalizeBody(rawBody);

  console.log("WEBHOOK NORMALIZED PHONE:", normalizedPhone);
  console.log("WEBHOOK NORMALIZED BODY:", normalizedBody);

  if (!normalizedPhone) {
    return "ERROR TELÉFONO: no llegó From válido";
  }

  if (!normalizedBody) {
    return "MENSAJE VACÍO";
  }

  const supabase = getAdminClient();
  console.log("SUPABASE ADMIN CLIENT OK");

  if (normalizedBody === "INICIO") {
    console.log("ENTRO A FLUJO INICIO (LINK MODE)");

    const contextResult = await resolveContext(supabase, normalizedPhone);
    console.log("CONTEXT RESULT:", contextResult);

    if (!contextResult.ok) {
      return contextResult.message;
    }

    const link = generateAccessLink({
      tournamentId: contextResult.context.tournament.id,
      roundId: contextResult.context.round.id,
      entryId: contextResult.context.entry.id,
      phone: normalizedPhone,
    });

    const playerName = `${contextResult.context.player.first_name ?? ""} ${
      contextResult.context.player.last_name ?? ""
    }`.trim();

    return [
      `Hola ${playerName || "Jugador"}`,
      "",
      "Entra aquí para capturar tus scores:",
      link,
      "",
      "Guarda esta liga durante la ronda.",
    ].join("\n");
  }

  return [
    "Usa INICIO para recibir tu liga de captura.",
    "",
    "Ejemplo:",
    "INICIO",
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