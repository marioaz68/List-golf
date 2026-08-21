import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import {
  loadMarshalDayTrails,
  mexicoDayBoundsISO,
} from "@/lib/marshal/loadMarshalDayTrails";
import { todayMexicoDate } from "@/lib/ritmo/opsDay";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "ritmo")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const tournamentId = String(url.searchParams.get("tournament_id") ?? "").trim();
  const day = String(url.searchParams.get("day") ?? "").trim() || todayMexicoDate();
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, error: "Falta tournament_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { dayStartISO, dayEndISO } = mexicoDayBoundsISO(day);
  const trails = await loadMarshalDayTrails(admin, {
    tournamentId,
    dayStartISO,
    dayEndISO,
    staticMeters: 100,
    gapThresholdMin: 3,
  });

  return NextResponse.json({
    ok: true,
    day,
    computedAtISO: new Date().toISOString(),
    trails,
  });
}
