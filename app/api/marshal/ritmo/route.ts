import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveMarshal, marshalAccessibleTournamentIds } from "@/lib/marshal/resolveMarshal";
import { loadMarshalRitmoSnapshot } from "@/lib/marshal/loadMarshalRitmoSnapshot";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tg = url.searchParams.get("tg")?.trim() ?? "";
  const tournamentId = url.searchParams.get("tournament_id")?.trim() ?? "";

  if (!tg || !tournamentId) {
    return NextResponse.json(
      { ok: false, error: "missing tg or tournament_id" },
      { status: 400 }
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "server config" },
      { status: 500 }
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const marshal = await resolveMarshal(admin, tg);
  if (!marshal) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const accessible = await marshalAccessibleTournamentIds(admin, marshal);
  if (!accessible.has(tournamentId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const snapshot = await loadMarshalRitmoSnapshot(admin, tournamentId);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "no round data" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, ...snapshot });
}
