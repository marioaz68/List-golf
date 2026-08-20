import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadMarshalOpsData } from "@/lib/marshal/loadMarshalOpsData";
import { resolveMarshal } from "@/lib/marshal/resolveMarshal";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tg = url.searchParams.get("tg")?.trim() ?? "";
  const tournamentId = url.searchParams.get("tournament_id")?.trim() ?? "";
  const roundId = url.searchParams.get("round_id")?.trim() ?? "";

  if (!tg) {
    return NextResponse.json({ ok: false, error: "missing tg" }, { status: 400 });
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

  const payload = await loadMarshalOpsData(
    admin,
    marshal,
    tournamentId || null,
    roundId || null
  );
  return NextResponse.json({ ok: true, ...payload });
}
