import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { loadPerHoleMinutes } from "@/lib/telegram/ritmo/paceCalculator";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import {
  resolveLiveRoundsForTournament,
  todayMexicoDate,
} from "@/lib/ritmo/opsDay";
import { loadRoundIdsWithCaptureActivityToday } from "@/lib/ritmo/loadCaptureLagGroups";
import { isGroupOnCourse } from "@/lib/ritmo/groupOnCourse";
import { loadMarshalPositions } from "@/lib/marshal/loadMarshalPositions";
import { buildRitmoLiveGroupsForRound } from "@/lib/ritmo/buildRitmoLiveGroups";
import RitmoLiveView, { type LiveGroup } from "./RitmoLiveView";

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
  start_time?: string | null;
};

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
    .select("id, name, short_name, course_name, course_id, start_date, end_date")
    .eq("id", tournamentId)
    .maybeSingle();

  const tournamentName =
    (tournamentRow?.short_name as string | null) ??
    (tournamentRow?.name as string | null) ??
    "Torneo";
  const courseName = (tournamentRow?.course_name as string | null) ?? null;
  const courseId = (tournamentRow?.course_id as string | null) ?? null;
  const tournamentEndDate =
    (tournamentRow?.end_date as string | null) ?? null;
  const tournamentStartDate =
    (tournamentRow?.start_date as string | null) ?? null;
  const mapUnsupported = !getCourseHoles(courseName);

  const perHoleMinutes = await loadPerHoleMinutes(
    admin,
    courseId,
    tournamentId
  );

  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, start_time")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  const rounds = (roundsRaw ?? []) as RoundRow[];

  const today = todayMexicoDate();
  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(
    admin,
    today
  );

  const liveRounds = resolveLiveRoundsForTournament({
    rounds,
    queryRoundId,
    today,
    tournamentEndDate,
    tournamentStartDate,
    activityRoundIds,
  });

  const groupCountByRound = new Map<string, number>();
  if (rounds.length > 0) {
    const { data: countRows } = await admin
      .from("pairing_groups")
      .select("round_id")
      .in(
        "round_id",
        rounds.map((r) => r.id)
      );
    for (const row of countRows ?? []) {
      const rid = String((row as { round_id: string }).round_id);
      groupCountByRound.set(rid, (groupCountByRound.get(rid) ?? 0) + 1);
    }
  }

  const computedAtISO = new Date().toISOString();
  const now = new Date(computedAtISO);
  const multiRound = !queryRoundId && liveRounds.length > 1;
  const roundNos = liveRounds
    .map((r) => r.round_no)
    .filter((n): n is number => n != null);
  const roundLabel =
    liveRounds.length === 0
      ? "Sin ronda"
      : multiRound
        ? `En cancha · R${roundNos.join("+R")}`
        : `Ronda ${liveRounds[0]?.round_no ?? "?"}`;

  if (liveRounds.length === 0) {
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
          onCourseCount={0}
          marshals={[]}
          computedAtISO={computedAtISO}
          mapUnsupported={mapUnsupported}
        />
      </div>
    );
  }

  const allGroups: LiveGroup[] = [];
  for (const round of liveRounds) {
    const groups = await buildRitmoLiveGroupsForRound(admin, {
      tournamentId,
      round,
      tournamentEndDate,
      tournamentStartDate,
      today,
      now,
      perHoleMinutes,
      labelWithRound: multiRound,
    });
    allGroups.push(...groups);
  }

  allGroups.sort((a, b) => {
    const rn = (a.roundNo ?? 0) - (b.roundNo ?? 0);
    if (rn !== 0) return rn;
    const ta = a.teeTime ?? "";
    const tb = b.teeTime ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    return a.number - b.number;
  });

  const onCourseCount = allGroups.filter((g) =>
    isGroupOnCourse({
      teeTime: g.teeTime,
      actualStartAt: g.actualStartAt,
      roundDate: g.roundDate ?? liveRounds[0]?.round_date ?? null,
      scoreHolesPlayed: g.scoreHolesPlayed,
      lastScoreTs: g.lastScoreTs,
      gpsState: g.gpsState,
      now,
    })
  ).length;

  const marshals = await loadMarshalPositions(admin, tournamentId);

  // Selector: rondas de hoy (o todas con grupos) + opción "Todas".
  const todayRounds = rounds.filter((r) => r.round_date === today);
  const selectorRounds =
    todayRounds.length > 0
      ? todayRounds
      : rounds.filter((r) => (groupCountByRound.get(r.id) ?? 0) > 0);

  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <RitmoLiveView
        tournamentId={tournamentId}
        tournamentName={tournamentName}
        courseName={courseName}
        roundLabel={roundLabel}
        rounds={selectorRounds.map((r) => ({
          id: r.id,
          round_no: r.round_no,
          groupCount: groupCountByRound.get(r.id) ?? 0,
        }))}
        currentRoundId={queryRoundId || null}
        roundDate={liveRounds[0]?.round_date ?? null}
        groups={allGroups}
        onCourseCount={onCourseCount}
        marshals={marshals}
        computedAtISO={computedAtISO}
        mapUnsupported={mapUnsupported}
        showAllRoundsOption={selectorRounds.length > 1}
      />
    </div>
  );
}
