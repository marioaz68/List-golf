import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import {
  loadGroupCoverageForRound,
} from "@/lib/ritmo/groupCoverage";
import {
  loadGroupScoreProgress,
  type GroupScoreMeta,
} from "@/lib/ritmo/scoreProgress";
import { resolveGroupStartHole } from "@/lib/ritmo/startHole";
import { evaluateCaptureLag } from "@/lib/ritmo/captureLag";
import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";
import SeguimientoCapturaLive, {
  type SegGroup,
} from "./SeguimientoCapturaLive";

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
  players: { first_name: string | null; last_name: string | null } | null;
};

function todayMexicoDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
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

export default async function SeguimientoCapturaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournamentId = getParam(sp, "tournament_id");
  const queryRoundId = getParam(sp, "round_id");

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
        Selecciona un torneo para ver el seguimiento de captura.{" "}
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

  const perHoleMinutes: PerHoleMinutes = await loadPerHoleMinutes(
    admin,
    courseId
  );

  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  const rounds = (roundsRaw ?? []) as RoundRow[];

  const today = todayMexicoDate();
  let round: RoundRow | null =
    rounds.find((r) => r.id === queryRoundId) ?? null;

  if (!round) {
    round = rounds.find((r) => r.round_date === today) ?? null;
  }

  if (!round) {
    round =
      [...rounds]
        .filter((r) => (r.round_date ?? "") <= today)
        .sort((a, b) =>
          (b.round_date ?? "").localeCompare(a.round_date ?? "")
        )[0] ??
      rounds[0] ??
      null;
  }

  const computedAtISO = new Date().toISOString();
  const roundLabel = round ? `Ronda ${round.round_no ?? "?"}` : "Sin ronda";

  if (!round) {
    return (
      <SeguimientoCapturaLive
        tournamentId={tournamentId}
        tournamentName={tournamentName}
        courseName={courseName}
        roundLabel="Sin rondas"
        rounds={[]}
        currentRoundId={null}
        groups={[]}
        computedAtISO={computedAtISO}
      />
    );
  }

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time, actual_start_at, notes")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });
  const groupRows = (groupsRaw ?? []) as GroupRow[];
  const groupIds = groupRows.map((g) => g.id);

  const playersByGroup = new Map<string, string[]>();
  const entryIdsByGroup = new Map<string, string[]>();

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
        .select("id, players ( first_name, last_name )")
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
    }
  }

  const coverageByGroup = await loadGroupCoverageForRound(
    admin,
    tournamentId,
    round.id,
    playersByGroup,
    entryIdsByGroup
  );

  const groupMeta = new Map<string, GroupScoreMeta>(
    groupRows.map((g) => [
      g.id,
      { starting_hole: g.starting_hole, notes: g.notes },
    ])
  );

  const scoreByGroup = await loadGroupScoreProgress(
    admin,
    round.id,
    entryIdsByGroup,
    groupMeta
  );

  const now = new Date(computedAtISO);
  const groups: SegGroup[] = groupRows.map((g) => {
    const players = playersByGroup.get(g.id) ?? [];
    const score = scoreByGroup.get(g.id);
    const startHole =
      score?.startHole ??
      resolveGroupStartHole(g.starting_hole, g.notes);
    const holesPlayed = score?.holesPlayed ?? 0;
    const lag = evaluateCaptureLag({
      holesPlayed,
      lastCaptureTs: score?.lastCaptureTs ?? null,
      teeTimeISO: g.tee_time,
      actualStartISO: g.actual_start_at,
      startHole,
      roundDate: round!.round_date,
      perHoleMinutes,
      now,
    });
    const coverage = coverageByGroup.get(g.id);
    const firstEntry = entryIdsByGroup.get(g.id)?.[0] ?? null;

    return {
      id: g.id,
      number: g.group_no ?? 0,
      label: `Grupo ${g.group_no ?? "?"}`,
      startingHole: startHole,
      teeTime: g.tee_time,
      actualStartAt: g.actual_start_at,
      players,
      caddies: (coverage?.caddies ?? []).map((c) => c.name),
      holesPlayed,
      lastHole: score?.lastHole ?? null,
      lastCaptureTs: score?.lastCaptureTs ?? null,
      kind: lag.kind,
      expectedHoles: lag.expectedHoles,
      holesBehind: lag.holesBehind,
      minutesSinceStart: lag.minutesSinceStart,
      minutesSinceLastCapture: lag.minutesSinceLastCapture,
      captureHole: lag.captureHole,
      reason: lag.reason,
      priority: lag.priority,
      capturaHref: `/captura/grupo?group_id=${encodeURIComponent(g.id)}`,
      scoreEntryHref: buildScoreEntryHref({
        tournamentId,
        entryId: firstEntry,
        roundNo: round!.round_no,
      }),
    };
  });

  return (
    <SeguimientoCapturaLive
      tournamentId={tournamentId}
      tournamentName={tournamentName}
      courseName={courseName}
      roundLabel={roundLabel}
      rounds={rounds.map((r) => ({ id: r.id, round_no: r.round_no }))}
      currentRoundId={round.id}
      groups={groups}
      computedAtISO={computedAtISO}
    />
  );
}
