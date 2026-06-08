/**
 * GET /api/mesero/state — devuelve venues + mesas + estado actual.
 * Usado por /fb-mesero para auto-refresh cada 15 s.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import { loadVenueTables } from "@/lib/fb/loadTables";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, venues: [] }, { status: 401 });
  }

  const admin = createAdminClient();
  const userRoles = await getUserRoles(admin, user.id);
  const scope = await resolveFbScope(admin, user.id, userRoles);

  let q = admin
    .from("fb_venues")
    .select("id, code, name")
    .eq("is_active", true)
    .eq("type", "restaurant")
    .order("display_order", { ascending: true });
  if (scope.allowedVenueIds && scope.allowedVenueIds.length > 0) {
    q = q.in("id", scope.allowedVenueIds);
  } else if (scope.allowedVenueIds && scope.allowedVenueIds.length === 0) {
    return NextResponse.json({ ok: true, venues: [] });
  }
  const { data: venuesRaw } = await q;
  const venues = (venuesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  const out = [];
  for (const v of venues) {
    const tables = await loadVenueTables(admin, v.id);
    out.push({ id: v.id, code: v.code, name: v.name, tables });
  }

  return NextResponse.json({ ok: true, venues: out });
}
