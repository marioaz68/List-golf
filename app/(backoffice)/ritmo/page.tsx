import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { computePace } from "@/lib/telegram/ritmo/paceCalculator";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import RitmoLiveView, { type LiveGroup, type LiveStatus } from "./RitmoLiveView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function getParam(sp: SP, key: string): string {
  const value = sp[key];
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

type RoundRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
};

type GroupRow = {
  id: string;
  group_no: number | null;
  starting_hole: number | null;
  tee_time: string | null;
};

type MemberRow = { group_id: string; entry_id: string };

type EntryRow = {
  id: string;
  player_number: number | null;
  players: { first_name: string | null; last_name: string | null } | null;
};

type PositionRow = {
  group_id: string | null;
  lat: number | null;
  lon: number | null;
  hoyo_detectado: number | null;
  ts: string;
};

const STALE_MINUTES = 12;
const LOOKBACK_MINUTES = 90;

/** Fecha de hoy en horario de México, formato YYYY-MM-DD. */
function todayMexicoDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function modalHole(holes: (number | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const h of holes) {
    if (h == null) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [h, n] of counts) {
    if (n > bestN) {
      best = h;
      bestN = n;
    }
  }
  return best;
}

function fullName(p: EntryRow["players"]): string {
  const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return full || "Jugador";
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        color: "#475569",
        fontSize: 14,
      }}
    >
      <div>{children}</div>
    </div>
  );
}

export default async function RitmoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournamentId = getParam(sp, "tournament_id");
  const queryRoundId = getParam(sp, "round_id");

  // Acceso: todo el staff del backoffice puede ver ritmo.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const roles = await getUserRoles(supabase, auth.user.id);
  if (!canAccessModule(roles, "ritmo")) {
    redirect("/tournaments");
  }

  if (!tournamentId) {
    return (
      <CenteredMessage>
        Selecciona un torneo para ver el ritmo del campo.{" "}
        <Link href="/tournaments" style={{ color: "#2563eb", fontWeight: 700 }}>
          Ir a torneos
        </Link>
      </CenteredMessage>
    );
  }

  const admin = createAdminClient();

  const { data: tournamentRow } = await admin
    .from("tournaments")
    .select("id, name, short_name, course_name")
    .eq("id", tournamentId)
    .maybeSingle();

  const tournamentName =
    (tournamentRow?.short_name as string | null) ??
    (tournamentRow?.name as string | null) ??
    "Torneo";
  const courseName = (tournamentRow?.course_name as string | null) ?? null;
  const mapUnsupported = !getCourseHoles(courseName);

  // Rondas del torneo.
  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  const rounds = (roundsRaw ?? []) as RoundRow[];

  // Elegir ronda: query > ronda de la última posición > ronda de hoy > última.
  let round: RoundRow | null =
    rounds.find((r) => r.id === queryRoundId) ?? null;

  if (!round) {
    const { data: lastPos } = await admin
      .from("ritmo_positions")
      .select("round_id, ts")
      .eq("tournament_id", tournamentId)
      .not("round_id", "is", null)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastRoundId = (lastPos as { round_id?: string } | null)?.round_id;
    if (lastRoundId) {
      round = rounds.find((r) => r.id === lastRoundId) ?? null;
    }
  }

  if (!round) {
    const today = todayMexicoDate();
    round =
      rounds.find((r) => r.round_date === today) ??
      [...rounds]
        .filter((r) => (r.round_date ?? "") <= today)
        .sort((a, b) => (b.round_date ?? "").localeCompare(a.round_date ?? ""))[0] ??
      rounds[0] ??
      null;
  }

  const computedAtISO = new Date().toISOString();
  const roundLabel = round ? `Ronda ${round.round_no ?? "?"}` : "Sin ronda";

  if (!round) {
    return (
      <div style={{ height: "calc(100dvh - 90px)", minHeight: 360 }}>
        <RitmoLiveView
          tournamentId={tournamentId}
          tournamentName={tournamentName}
          courseName={courseName}
          roundLabel="Sin rondas"
          rounds={[]}
          currentRoundId={null}
          groups={[]}
          computedAtISO={computedAtISO}
          mapUnsupported={mapUnsupported}
        />
      </div>
    );
  }

  // Grupos de la ronda.
  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });
  const groupRows = (groupsRaw ?? []) as GroupRow[];
  const groupIds = groupRows.map((g) => g.id);

  // Miembros de cada grupo + nombres de jugadores.
  const playersByGroup = new Map<string, string[]>();
  if (groupIds.length > 0) {
    const { data: membersRaw } = await admin
      .from("pairing_group_members")
      .select("group_id, entry_id")
      .in("group_id", groupIds);
    const members = (membersRaw ?? []) as MemberRow[];
    const entryIds = Array.from(new Set(members.map((m) => m.entry_id)));

    const nameByEntry = new Map<string, string>();
    if (entryIds.length > 0) {
      const { data: entriesRaw } = await admin
        .from("tournament_entries")
        .select("id, player_number, players ( first_name, last_name )")
        .in("id", entryIds);
      for (const e of (entriesRaw ?? []) as unknown as EntryRow[]) {
        const p = Array.isArray(e.players) ? e.players[0] : e.players;
        nameByEntry.set(e.id, fullName(p ?? null));
      }
    }
    for (const m of members) {
      const arr = playersByGroup.get(m.group_id) ?? [];
      arr.push(nameByEntry.get(m.entry_id) ?? "Jugador");
      playersByGroup.set(m.group_id, arr);
    }
  }

  // Posiciones recientes por grupo.
  const cutoff = new Date(
    Date.now() - LOOKBACK_MINUTES * 60 * 1000
  ).toISOString();
  const positionsByGroup = new Map<string, PositionRow[]>();
  if (groupIds.length > 0) {
    const { data: posRaw } = await admin
      .from("ritmo_positions")
      .select("group_id, lat, lon, hoyo_detectado, ts")
      .eq("tournament_id", tournamentId)
      .eq("round_id", round.id)
      .in("group_id", groupIds)
      .gte("ts", cutoff)
      .order("ts", { ascending: false });
    for (const row of (posRaw ?? []) as PositionRow[]) {
      if (!row.group_id) continue;
      const arr = positionsByGroup.get(row.group_id) ?? [];
      arr.push(row);
      positionsByGroup.set(row.group_id, arr);
    }
  }

  const now = new Date(computedAtISO);
  const groups: LiveGroup[] = groupRows.map((g) => {
    const players = playersByGroup.get(g.id) ?? [];
    const positions = positionsByGroup.get(g.id) ?? []; // ya viene desc por ts
    const latest = positions[0] ?? null;
    const smoothedHole = modalHole(
      positions.slice(0, 10).map((p) => p.hoyo_detectado)
    );

    const lastTs = latest?.ts ?? null;
    const stale = lastTs
      ? now.getTime() - new Date(lastTs).getTime() > STALE_MINUTES * 60 * 1000
      : false;

    const pace = computePace({
      hoyoActual: smoothedHole,
      teeTimeISO: g.tee_time,
      teeStartHole: g.starting_hole ?? 1,
      roundDate: round!.round_date,
      now,
    });

    let status: LiveStatus;
    let deltaMinutes: number | null = null;
    if (!latest || smoothedHole == null) {
      status = "sin_datos";
    } else if (
      pace.kind === "en_ritmo" ||
      pace.kind === "adelantado" ||
      pace.kind === "atrasado"
    ) {
      status = pace.kind;
      deltaMinutes = pace.deltaMinutes;
    } else {
      status = "en_ritmo";
    }

    const detail = latest
      ? smoothedHole == null
        ? "Posición recibida, detectando hoyo…"
        : pace.msg
      : "Sin ubicación compartida todavía.";

    return {
      id: g.id,
      number: g.group_no ?? 0,
      label: `Grupo ${g.group_no ?? "?"}`,
      startingHole: g.starting_hole ?? 1,
      teeTime: g.tee_time,
      players,
      status,
      hoyo: smoothedHole,
      detail,
      deltaMinutes,
      lat: latest?.lat ?? null,
      lon: latest?.lon ?? null,
      lastTs,
      stale,
    };
  });

  return (
    <div style={{ height: "calc(100dvh - 90px)", minHeight: 360 }}>
      <RitmoLiveView
        tournamentId={tournamentId}
        tournamentName={tournamentName}
        courseName={courseName}
        roundLabel={roundLabel}
        rounds={rounds.map((r) => ({ id: r.id, round_no: r.round_no }))}
        currentRoundId={round.id}
        groups={groups}
        computedAtISO={computedAtISO}
        mapUnsupported={mapUnsupported}
      />
    </div>
  );
}
