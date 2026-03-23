export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = body?.rows ?? [];

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "rows vacío" }, { status: 400 });
    }

    const { error } = await supabase
      .from("players")
      .upsert(rows, {
        onConflict: "email_norm"
      });

    if (error) throw error;

    return NextResponse.json({ ok: true, processed: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}

