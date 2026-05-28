import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  lockScorecardIfSignedAndComplete,
  saveCardSignature,
} from "@/lib/captura/cardSignatures";

export const dynamic = "force-dynamic";

/**
 * Firma de tarjeta de un jugador dentro de un grupo.
 *
 * Body:
 *   {
 *     group_id: string,
 *     entry_id: string,    // jugador cuya tarjeta se firma
 *     role: "player" | "witness",
 *     me?: string          // entry_id del visitante (?me=...) — usado para
 *                          // verificar identidad
 *   }
 *
 * - role="player": only quien capture con ?me=entry_id que coincida con
 *   entry_id puede firmar.
 * - role="witness": only quien capture con ?me=entry_id donde
 *   entry_id sea el witness asignado al jugador objetivo.
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
  const meEntryId = String(o.me ?? "").trim();
  const rawRole = String(o.role ?? "").trim().toLowerCase();
  const role: "player" | "witness" | null =
    rawRole === "player" || rawRole === "witness"
      ? (rawRole as "player" | "witness")
      : null;

  if (!groupId || !entryId || !role) {
    return NextResponse.json(
      { ok: false, error: "Faltan group_id, entry_id o role." },
      { status: 400 }
    );
  }

  if (!meEntryId) {
    return NextResponse.json(
      { ok: false, error: "Falta identidad (me)." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();

    if (role === "player") {
      if (meEntryId !== entryId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Sólo el propio jugador puede firmar su tarjeta.",
          },
          { status: 403 }
        );
      }
    } else {
      // role === "witness": verificar que me sea el testigo asignado.
      const { data: witnessRow } = await admin
        .from("score_witnesses")
        .select("witness_entry_id")
        .eq("group_id", groupId)
        .eq("entry_id", entryId)
        .maybeSingle();
      if (!witnessRow || witnessRow.witness_entry_id !== meEntryId) {
        return NextResponse.json(
          {
            ok: false,
            error: "No estás autorizado como testigo de este jugador.",
          },
          { status: 403 }
        );
      }
    }

    const result = await saveCardSignature(admin, {
      groupId,
      entryId,
      role,
      witnessEntryId: role === "witness" ? meEntryId : null,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    // Si ya quedaron ambas firmas + 18 hoyos, cerrar la tarjeta
    // automáticamente para que aparezca en clasificación oficial.
    let scorecardLocked = false;
    if (result.signedByPlayerAt && result.signedByWitnessAt) {
      const lockRes = await lockScorecardIfSignedAndComplete(admin, {
        groupId,
        entryId,
      });
      if (lockRes.ok) scorecardLocked = lockRes.locked;
    }

    return NextResponse.json({ ...result, scorecardLocked });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Error guardando firma.",
      },
      { status: 500 }
    );
  }
}
