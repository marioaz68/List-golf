import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import {
  computePace,
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import {
  gpsStateFromTimestamp,
  loadCaddieByEntry,
  loadGroupCoverageForRound,
  type GroupGpsState,
} from "@/lib/ritmo/groupCoverage";
import {
  loadGroupScoreProgress,
  currentHoleFromHolesPlayed,
  type GroupScoreMeta,
} from "@/lib/ritmo/scoreProgress";
import { resolveGroupStartHole } from "@/lib/ritmo/startHole";
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
  actual_start_at: string | null;
  notes: string | null;
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
  telegram_user_id: string | null;
  player_id: string | null;
};

const STALE_MINUTES = 12;
const LOOKBACK_MINUTES = 90;
/** Ventana para contar "fuentes activas" (dispositivos que están mandando GPS
 *  ahora). Se usa para indicar en el dashboard si un grupo tiene 1, 2 o 3+
 *  dispositivos respaldándose mutuamente. */
const ACTIVE_SOURCE_MINUTES = 5;

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
    .select("id, name, short_name, course_name, course_id")
    .eq("id", tournamentId)
    .maybeSingle();

  const tournamentName =
    (tournamentRow?.short_name as string | null) ??
    (tournamentRow?.name as string | null) ??
    "Torneo";
  const courseName = (tournamentRow?.course_name as string | null) ?? null;
  const courseId = (tournamentRow?.course_id as string | null) ?? null;
  const mapUnsupported = !getCourseHoles(courseName);

  // Minutos objetivo por hoyo del campo (ritmo del torneo, editable).
  const perHoleMinutes: PerHoleMinutes = await loadPerHoleMinutes(
    admin,
    courseId
  );

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
          roundDate={null}
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
    .select("id, group_no, starting_hole, tee_time, actual_start_at, notes")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });
  const groupRows = (groupsRaw ?? []) as GroupRow[];
  const groupIds = groupRows.map((g) => g.id);

  // Miembros de cada grupo + nombres de jugadores.
  const playersByGroup = new Map<string, string[]>();
  const entryIdsByGroup = new Map<string, string[]>();
  // Pares ordenados {entryId, name} por grupo, para emparejar jugador↔caddie.
  const memberRowsByGroup = new Map<
    string,
    { entryId: string; name: string }[]
  >();
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
      const name = nameByEntry.get(m.entry_id) ?? "Jugador";
      const arr = playersByGroup.get(m.group_id) ?? [];
      arr.push(name);
      playersByGroup.set(m.group_id, arr);
      const eids = entryIdsByGroup.get(m.group_id) ?? [];
      eids.push(m.entry_id);
      entryIdsByGroup.set(m.group_id, eids);
      const rows = memberRowsByGroup.get(m.group_id) ?? [];
      rows.push({ entryId: m.entry_id, name });
      memberRowsByGroup.set(m.group_id, rows);
    }
  }

  const coverageByGroup = await loadGroupCoverageForRound(
    admin,
    tournamentId,
    round.id,
    playersByGroup,
    entryIdsByGroup
  );

  // Caddie por inscrito (para mostrar jugador → su caddie + estado Telegram).
  const allEntryIds = Array.from(
    new Set(Array.from(entryIdsByGroup.values()).flat())
  );
  const caddieByEntry = await loadCaddieByEntry(
    admin,
    tournamentId,
    round.id,
    allEntryIds
  );

  // Posiciones recientes por grupo.
  const cutoff = new Date(
    Date.now() - LOOKBACK_MINUTES * 60 * 1000
  ).toISOString();
  const positionsByGroup = new Map<string, PositionRow[]>();
  if (groupIds.length > 0) {
    const { data: posRaw } = await admin
      .from("ritmo_positions")
      .select(
        "group_id, lat, lon, hoyo_detectado, ts, telegram_user_id, player_id"
      )
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

  const groupMeta = new Map<string, GroupScoreMeta>(
    groupRows.map((g) => [
      g.id,
      { starting_hole: g.starting_hole, notes: g.notes },
    ])
  );

  // Progreso de captura de escores por grupo (para derivar ritmo sin GPS).
  const scoreByGroup = await loadGroupScoreProgress(
    admin,
    round.id,
    entryIdsByGroup,
    groupMeta
  );

  const now = new Date(computedAtISO);
  const groups: LiveGroup[] = groupRows.map((g) => {
    const players = playersByGroup.get(g.id) ?? [];
    const positions = positionsByGroup.get(g.id) ?? []; // ya viene desc por ts
    const latest = positions[0] ?? null;
    const gpsHole = modalHole(
      positions.slice(0, 10).map((p) => p.hoyo_detectado)
    );

    const lastTs = latest?.ts ?? null;
    const stale = lastTs
      ? now.getTime() - new Date(lastTs).getTime() > STALE_MINUTES * 60 * 1000
      : false;

    const score = scoreByGroup.get(g.id);
    const startHole =
      score?.startHole ??
      resolveGroupStartHole(g.starting_hole, g.notes);
    const scoreHolesPlayed = score?.holesPlayed ?? 0;
    const scoreFinished = scoreHolesPlayed >= 18;
    const scoreHole = score
      ? currentHoleFromHolesPlayed(scoreHolesPlayed, startHole)
      : null;

    // Fuente del hoyo: los escores capturados son la verdad del avance; el GPS
    // es respaldo (y da la posición en el mapa). Si hay captura, manda el score.
    let hoyoActual: number | null;
    let holeSource: "scores" | "gps" | null;
    if (scoreHole != null) {
      hoyoActual = scoreHole;
      holeSource = "scores";
    } else if (!stale && gpsHole != null) {
      hoyoActual = gpsHole;
      holeSource = "gps";
    } else {
      hoyoActual = null;
      holeSource = null;
    }

    const pace = computePace({
      hoyoActual,
      teeTimeISO: g.tee_time,
      actualStartISO: g.actual_start_at,
      teeStartHole: startHole,
      roundDate: round!.round_date,
      now,
      perHoleMinutes,
    });

    let status: LiveStatus;
    let deltaMinutes: number | null = null;
    if (hoyoActual == null) {
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

    const coverage = coverageByGroup.get(g.id);
    const gpsState: GroupGpsState = gpsStateFromTimestamp(
      lastTs,
      STALE_MINUTES,
      now
    );

    // Fuentes distintas que mandaron GPS en los últimos N min (telegram_user_id
    // o player_id distintos = dispositivos físicos distintos). Sirve para que
    // el comité vea redundancia: 1 fuente = riesgo, 2-3 = robusto.
    const activeSinceMs =
      now.getTime() - ACTIVE_SOURCE_MINUTES * 60 * 1000;
    const recentDevices = new Set<string>();
    for (const p of positions) {
      const ts = new Date(p.ts).getTime();
      if (!Number.isFinite(ts) || ts < activeSinceMs) continue;
      const key =
        (p.telegram_user_id && `tg:${p.telegram_user_id}`) ||
        (p.player_id && `pl:${p.player_id}`) ||
        null;
      if (key) recentDevices.add(key);
    }
    const activeSources = recentDevices.size;

    const detail = scoreFinished
      ? "🏁 Terminó (18 hoyos capturados)"
      : holeSource === "scores"
        ? pace.msg
        : holeSource === "gps"
          ? pace.msg
          : score && score.lastCaptureTs
            ? "Captura iniciada, detectando avance…"
            : gpsState === "none"
              ? "Sin GPS ni escores aún — el caddie aún no captura y nadie comparte ubicación."
              : "Sin ubicación ni captura todavía.";

    const playerRows = (memberRowsByGroup.get(g.id) ?? []).map((row) => {
      const caddie = caddieByEntry.get(row.entryId) ?? null;
      return {
        name: row.name,
        caddieName: caddie?.name ?? null,
        caddieHasTelegram: caddie?.hasTelegram ?? false,
      };
    });

    return {
      id: g.id,
      number: g.group_no ?? 0,
      label: `Grupo ${g.group_no ?? "?"}`,
      startingHole: startHole,
      teeTime: g.tee_time,
      actualStartAt: g.actual_start_at,
      players,
      playerRows,
      status,
      hoyo: hoyoActual,
      holeSource,
      detail,
      deltaMinutes,
      lat: latest?.lat ?? null,
      lon: latest?.lon ?? null,
      lastTs,
      stale,
      gpsState,
      activeSources,
      scoreHolesPlayed,
      scoreFinished,
      lastScoreTs: score?.lastCaptureTs ?? null,
      caddies: coverage?.caddies ?? [],
      playersWithTelegram: coverage?.playersWithTelegram ?? 0,
      playerCount: coverage?.playerCount ?? players.length,
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
        roundDate={round.round_date}
        groups={groups}
        computedAtISO={computedAtISO}
        mapUnsupported={mapUnsupported}
      />
    </div>
  );
}
