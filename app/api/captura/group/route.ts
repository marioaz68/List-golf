import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadGroupCapture } from "@/lib/captura/loadGroupCapture";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("group_id")?.trim() ?? "";
  const meEntryId = url.searchParams.get("me")?.trim() ?? "";
  const caddieId = url.searchParams.get("caddie")?.trim() ?? "";

  if (!groupId) {
    return NextResponse.json(
      { ok: false, error: "Falta group_id." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const data = await loadGroupCapture(admin, groupId, {
      meEntryId: meEntryId || null,
      caddieId: caddieId || null,
    });
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Grupo no encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error cargando grupo.",
      },
      { status: 500 }
    );
  }
}
