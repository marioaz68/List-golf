import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import {
  loadClosestToPinPublicBoard,
  loadGroupsForRound,
  loadGroupPlayersForCapture,
  loadPar3Holes,
  loadTournamentRounds,
} from "@/lib/cercanos/loadClosestToPin";
import CercanosCaptureClient from "./CercanosCaptureClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function param(sp: SP, key: string): string {
  const v = sp[key];
  return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function roundLabel(r: {
  round_no: number | null;
  round_date: string | null;
  wave: string | null;
  category_id: string | null;
}) {
  const parts = [
    r.round_no != null ? `R${r.round_no}` : "Ronda",
    r.round_date ? String(r.round_date).slice(0, 10) : null,
    r.wave ? String(r.wave) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default async function CercanosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournamentId = param(sp, "tournament_id");
  const queryRoundId = param(sp, "round_id");
  const queryGroupId = param(sp, "group_id");
  const queryHole = Number(param(sp, "hole"));

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const roles = await getUserRoles(supabase, auth.user.id);
  if (!canAccessModule(roles, "cercanos")) {
    redirect("/tournaments");
  }

  if (!tournamentId) {
    redirect("/tournaments");
  }

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) redirect("/tournaments");

  const par3Holes = await loadPar3Holes(admin, tournamentId);
  const roundsRaw = await loadTournamentRounds(admin, tournamentId);
  const rounds = roundsRaw.map((r) => ({
    ...r,
    label: roundLabel(r),
  }));

  const roundId =
    (queryRoundId && rounds.some((r) => r.id === queryRoundId)
      ? queryRoundId
      : rounds[0]?.id) ?? "";

  const hole =
    Number.isFinite(queryHole) && par3Holes.includes(queryHole)
      ? queryHole
      : par3Holes[0] ?? 3;

  const groups = roundId ? await loadGroupsForRound(admin, roundId) : [];
  const groupId =
    queryGroupId && groups.some((g) => g.id === queryGroupId)
      ? queryGroupId
      : "";

  const players =
    roundId && groupId
      ? await loadGroupPlayersForCapture(admin, {
          tournamentId,
          roundId,
          holeNumber: hole,
          groupId,
        })
      : [];

  const board = roundId
    ? await loadClosestToPinPublicBoard(admin, {
        tournamentId,
        roundId,
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <CercanosCaptureClient
        tournamentId={tournamentId}
        tournamentName={
          (tournament as { name: string | null }).name ?? "Torneo"
        }
        par3Holes={par3Holes}
        rounds={rounds}
        initialRoundId={roundId}
        initialHole={hole}
        initialGroupId={groupId}
        groups={groups}
        players={players}
        board={board}
      />
    </div>
  );
}
