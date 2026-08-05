import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import {
  loadCaptureLagGroupsForRound,
  loadTodayRoundsAcrossTournaments,
} from "@/lib/ritmo/loadCaptureLagGroups";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import SeguimientoCapturaLive, {
  type SegGroup,
  type TournamentFilterOption,
} from "./SeguimientoCapturaLive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function getParam(sp: SP, key: string): string {
  const value = sp[key];
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

function todayMexicoDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

type RoundRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
};

export default async function SeguimientoCapturaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const filterTournamentId = getParam(sp, "tournament_id");
  const queryRoundId = getParam(sp, "round_id");
  // scope=one → un torneo; por defecto (sin scope o scope=all) → todos de hoy.
  const scopeAll = getParam(sp, "scope") !== "one" || !filterTournamentId;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const roles = await getUserRoles(supabase, auth.user.id);
  if (!canAccessModule(roles, "ritmo")) {
    redirect("/tournaments");
  }

  const admin = createAdminClient();
  const today = todayMexicoDate();
  const computedAtISO = new Date().toISOString();
  const now = new Date(computedAtISO);

  // Catálogo de torneos con ronda hoy (para el filtro del tablero).
  const todaySlots = await loadTodayRoundsAcrossTournaments(admin, today);
  const tournamentOptions: TournamentFilterOption[] = [];
  {
    const seen = new Set<string>();
    for (const s of todaySlots) {
      if (seen.has(s.tournament.id)) continue;
      seen.add(s.tournament.id);
      tournamentOptions.push({
        id: s.tournament.id,
        name: s.tournament.name,
      });
    }
    tournamentOptions.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  // —— Un torneo (ronda elegida o de hoy / última) ——
  if (!scopeAll && filterTournamentId) {
    const { data: tournamentRow } = await admin
      .from("tournaments")
      .select("id, name, short_name, course_name, course_id")
      .eq("id", filterTournamentId)
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
      .eq("tournament_id", filterTournamentId)
      .order("round_no", { ascending: true });
    const rounds = (roundsRaw ?? []) as RoundRow[];

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

    const roundLabel = round ? `Ronda ${round.round_no ?? "?"}` : "Sin ronda";
    let groups: SegGroup[] = [];
    if (round) {
      groups = await loadCaptureLagGroupsForRound(admin, {
        tournamentId: filterTournamentId,
        tournamentName,
        courseName,
        courseId,
        roundId: round.id,
        roundNo: round.round_no,
        roundDate: round.round_date,
        now,
        perHoleMinutes,
      });
    }

    return (
      <SeguimientoCapturaLive
        mode="one"
        tournamentId={filterTournamentId}
        tournamentName={tournamentName}
        courseName={courseName}
        roundLabel={roundLabel}
        rounds={rounds.map((r) => ({ id: r.id, round_no: r.round_no }))}
        currentRoundId={round?.id ?? null}
        tournamentsToday={tournamentOptions}
        groups={groups}
        computedAtISO={computedAtISO}
        todayLabel={today}
      />
    );
  }

  // —— Todos los torneos con ronda hoy ——
  // Agrupa por round (puede haber varias filas rounds el mismo día por categoría).
  const paceCache = new Map<string, PerHoleMinutes>();
  const allGroups: SegGroup[] = [];

  for (const slot of todaySlots) {
    const cacheKey = slot.tournament.courseId ?? `__${slot.tournament.id}`;
    let per = paceCache.get(cacheKey);
    if (!per) {
      per = await loadPerHoleMinutes(admin, slot.tournament.courseId);
      paceCache.set(cacheKey, per);
    }
    const rows = await loadCaptureLagGroupsForRound(admin, {
      tournamentId: slot.tournament.id,
      tournamentName: slot.tournament.name,
      courseName: slot.tournament.courseName,
      courseId: slot.tournament.courseId,
      roundId: slot.roundId,
      roundNo: slot.roundNo,
      roundDate: slot.roundDate,
      now,
      perHoleMinutes: per,
    });
    allGroups.push(...rows);
  }

  // Dedup por group id (por si un round aparece 2 veces).
  const byId = new Map<string, SegGroup>();
  for (const g of allGroups) byId.set(g.id, g);

  return (
    <SeguimientoCapturaLive
      mode="all"
      tournamentId={null}
      tournamentName="Todos los torneos"
      courseName={null}
      roundLabel={`Rondas de hoy · ${today}`}
      rounds={[]}
      currentRoundId={null}
      tournamentsToday={tournamentOptions}
      groups={Array.from(byId.values())}
      computedAtISO={computedAtISO}
      todayLabel={today}
    />
  );
}
