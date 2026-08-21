import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { todayMexicoDate } from "@/lib/ritmo/opsDay";
import {
  loadMarshalDayTrails,
  mexicoDayBoundsISO,
} from "@/lib/marshal/loadMarshalDayTrails";
import MarshalTrailReport from "./MarshalTrailReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function getParam(sp: SP, key: string): string {
  const value = sp[key];
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default async function MarshalTrailsPage({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = searchParams ? await Promise.resolve(searchParams) : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "ritmo")) redirect("/");

  const tournamentId = getParam(sp, "tournament_id");
  const day = getParam(sp, "day") || todayMexicoDate();

  if (!tournamentId) {
    return (
      <main style={{ padding: 24, color: "#e5e7eb" }}>
        <h1>Recorrido marshals</h1>
        <p>Falta tournament_id.</p>
        <Link href="/ritmo">Ir a Ritmo</Link>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) {
    return (
      <main style={{ padding: 24 }}>
        <p>Torneo no encontrado.</p>
      </main>
    );
  }

  const { dayStartISO, dayEndISO } = mexicoDayBoundsISO(day);
  const trails = await loadMarshalDayTrails(admin, {
    tournamentId,
    dayStartISO,
    dayEndISO,
    staticMeters: 100,
    gapThresholdMin: 3,
  });

  return (
    <MarshalTrailReport
      tournamentId={tournamentId}
      tournamentName={String(tournament.name ?? "Torneo")}
      day={day}
      initialTrails={trails}
      computedAtISO={new Date().toISOString()}
    />
  );
}
