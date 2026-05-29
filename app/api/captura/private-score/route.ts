import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { savePrivateHoleScore } from "@/lib/captura/privateScores";
import type { HoleNumber } from "@/lib/captura/types";

export const dynamic = "force-dynamic";

function parseHole(raw: unknown): HoleNumber | null {
  const n = Number(raw);
  // 1-18: normales · 19-27: desempate.
  if (!Number.isFinite(n) || n < 1 || n > 27) return null;
  return Math.trunc(n) as HoleNumber;
}

/**
 * Tarjeta privada de un jugador ("Mi Tarjeta"). El servidor verifica que
 * el escritor sea o bien el propio jugador (me=entry_id que coincide) o
 * el caddie asignado a ese jugador (caddie=caddie_id con asignación
 * activa al entry_id).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 }
    );
  }

  const o = body as Record<string, unknown>;
  const groupId = String(o.group_id ?? "").trim();
  const entryId = String(o.entry_id ?? "").trim();
  const hole = parseHole(o.hole);
  const strokesRaw = o.strokes;
  const meEntryId = String(o.me ?? "").trim();
  const caddieId = String(o.caddie ?? "").trim();

  if (!groupId || !entryId || hole == null) {
    return NextResponse.json(
      { ok: false, error: "Faltan group_id, entry_id o hole." },
      { status: 400 }
    );
  }

  if (!meEntryId && !caddieId) {
    return NextResponse.json(
      { ok: false, error: "Falta identidad (me o caddie)." },
      { status: 400 }
    );
  }

  let strokes: number | null;
  if (strokesRaw === null || strokesRaw === "" || strokesRaw === undefined) {
    strokes = null;
  } else {
    const n = Number(strokesRaw);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { ok: false, error: "Score inválido." },
        { status: 400 }
      );
    }
    strokes = Math.trunc(n);
  }

  try {
    const admin = createAdminClient();

    let role: "player" | "caddie" | null = null;
    if (meEntryId && meEntryId === entryId) {
      role = "player";
    } else if (caddieId) {
      const { data: assigns } = await admin
        .from("caddie_assignments")
        .select("entry_id, pairing_group_id, is_active")
        .eq("caddie_id", caddieId)
        .eq("entry_id", entryId);

      const isAuthorized = ((assigns ?? []) as Array<{
        entry_id: string | null;
        pairing_group_id: string | null;
        is_active: boolean | null;
      }>).some(
        (a) =>
          a.is_active !== false &&
          (!a.pairing_group_id || a.pairing_group_id === groupId)
      );

      if (isAuthorized) role = "caddie";
    }

    if (!role) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta tarjeta privada." },
        { status: 403 }
      );
    }

    const result = await savePrivateHoleScore(admin, {
      groupId,
      entryId,
      hole,
      strokes,
      role,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Error guardando tarjeta privada.",
      },
      { status: 500 }
    );
  }
}
