import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  lockScorecardIfSignedAndComplete,
  saveCardSignature,
} from "@/lib/captura/cardSignatures";
import { loadGroupMatchPlayStatus } from "@/lib/captura/matchPlayGroupDecision";
import { loadGroupPairSides } from "@/lib/captura/loadGroupPairSides";
import { isOpposingWitness, samePair } from "@/lib/captura/pairWitness";

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
 * - role="player": el propio jugador (o, en parejas, su compañero cubierto
 *   por esa firma).
 * - role="witness": el testigo asignado; en parejas, cualquiera de la
 *   pareja rival (nunca el compañero).
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
    const pairSides = await loadGroupPairSides(admin, groupId);

    if (role === "player") {
      const allowed = pairSides
        ? samePair(meEntryId, entryId, pairSides)
        : meEntryId === entryId;
      if (!allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: pairSides
              ? "Sólo un jugador de la pareja puede firmar esta tarjeta."
              : "Sólo el propio jugador puede firmar su tarjeta.",
          },
          { status: 403 }
        );
      }
    } else if (pairSides) {
      if (!isOpposingWitness(meEntryId, entryId, pairSides)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "El testigo tiene que ser de la pareja rival, no tu compañero.",
          },
          { status: 403 }
        );
      }
    } else {
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
      actorEntryId: meEntryId,
      witnessEntryId: role === "witness" ? meEntryId : null,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    const matchPlay = await loadGroupMatchPlayStatus(admin, groupId);
    const holesRequired = matchPlay?.holesRequired ?? 18;
    const lockIds = new Set<string>([entryId]);
    for (const row of result.updated) lockIds.add(row.entryId);

    let scorecardLocked = false;
    for (const id of lockIds) {
      const lockRes = await lockScorecardIfSignedAndComplete(admin, {
        groupId,
        entryId: id,
        holesRequired,
      });
      if (lockRes.ok && lockRes.locked) scorecardLocked = true;
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
