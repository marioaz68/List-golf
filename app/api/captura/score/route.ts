import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { saveGroupHoleScore } from "@/lib/captura/saveGroupHoleScore";
import type { HoleNumber } from "@/lib/captura/types";

export const dynamic = "force-dynamic";

function parseHole(raw: unknown): HoleNumber | null {
  const n = Number(raw);
  // 1-18: hoyos normales · 19-27: hoyos de desempate (1-9 físicos).
  if (!Number.isFinite(n) || n < 1 || n > 27) return null;
  return Math.trunc(n) as HoleNumber;
}

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
  // Match play: el jugador no terminó el hoyo (levantó). Se acepta como
  // valor especial — `strokes` puede venir null o "X"/"x".
  const pickedUp =
    o.picked_up === true ||
    o.pickedUp === true ||
    (typeof strokesRaw === "string" &&
      strokesRaw.trim().toLowerCase() === "x");
  const rawMode = String(o.mode ?? "").trim().toLowerCase();
  const mode: "modify" | "approve" =
    rawMode === "approve" ? "approve" : "modify";
  const rawRole = String(o.role ?? "").trim().toLowerCase();
  const actorRole: "player" | "caddie" | "witness" | "admin" | null =
    rawRole === "player" ||
    rawRole === "caddie" ||
    rawRole === "witness" ||
    rawRole === "admin"
      ? (rawRole as "player" | "caddie" | "witness" | "admin")
      : null;

  if (!groupId || !entryId || hole == null) {
    return NextResponse.json(
      { ok: false, error: "Faltan group_id, entry_id o hole." },
      { status: 400 }
    );
  }

  let strokes: number | null;
  if (
    pickedUp ||
    strokesRaw === null ||
    strokesRaw === "" ||
    strokesRaw === undefined
  ) {
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
    const result = await saveGroupHoleScore(admin, {
      groupId,
      entryId,
      hole,
      strokes,
      pickedUp,
      mode,
      actorRole,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error guardando score.",
      },
      { status: 500 }
    );
  }
}
