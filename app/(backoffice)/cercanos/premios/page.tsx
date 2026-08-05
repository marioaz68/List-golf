import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { loadPar3Holes } from "@/lib/cercanos/loadClosestToPin";
import { loadClosestToPinPrizes } from "@/lib/cercanos/loadPrizes";
import CercanosPremiosClient from "./CercanosPremiosClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function param(sp: SP, key: string): string {
  const v = sp[key];
  return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function CercanosPremiosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tournamentId = param(sp, "tournament_id");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const roles = await getUserRoles(supabase, auth.user.id);
  if (!canAccessModule(roles, "cercanos")) {
    redirect("/tournaments");
  }
  if (!tournamentId) redirect("/tournaments");

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) redirect("/tournaments");

  const par3Holes = await loadPar3Holes(admin, tournamentId);
  const prizes = await loadClosestToPinPrizes(admin, tournamentId, {
    activeOnly: false,
  });

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <CercanosPremiosClient
        tournamentId={tournamentId}
        tournamentName={
          (tournament as { name: string | null }).name ?? "Torneo"
        }
        par3Holes={par3Holes}
        prizes={prizes}
      />
    </div>
  );
}
