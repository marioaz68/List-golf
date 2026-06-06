import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadConsolationMatchPlayPublic } from "@/lib/matchplay/loadConsolationMatchPlayPublic";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tournamentId = url.searchParams.get("tournament_id")?.trim() ?? "";
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, error: "tournament_id requerido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const data = await loadConsolationMatchPlayPublic(admin, tournamentId);
  return NextResponse.json(data);
}
