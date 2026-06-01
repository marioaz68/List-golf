import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGroupMatchPlayStatus } from "@/lib/captura/matchPlayGroupDecision";
import { closeMatchAndAdvanceForGroup } from "@/lib/matchplay/closeAndAdvance";

export type TryAutoCloseMatchForGroupResult =
  | { attempted: false; reason: "not_matchplay" | "not_decided" | "needs_playoff" }
  | {
      attempted: true;
      closed: true;
      message: string;
      nextGroupCreated?: boolean;
      nextGroupNo?: number | null;
      nextTeeTime?: string | null;
      bracketPublished?: boolean;
    }
  | {
      attempted: true;
      closed: false;
      error: string;
      bracketPublished?: boolean;
    };

/**
 * Si el match del grupo ya está matemáticamente decidido, cierra el partido
 * en `matchplay_matches`, avanza al ganador y crea la salida de la siguiente
 * ronda cuando ya hay dos parejas en el siguiente match.
 *
 * `closeMatchAndAdvanceForGroup` publica el cuadro automáticamente si aún no
 * existe (subasta completa).
 */
export async function tryAutoCloseMatchForGroup(
  admin: SupabaseClient,
  groupId: string,
  options?: { notifyNextGroup?: boolean }
): Promise<TryAutoCloseMatchForGroupResult> {
  const gid = String(groupId ?? "").trim();
  if (!gid) {
    return { attempted: true, closed: false, error: "Falta group_id." };
  }

  const status = await loadGroupMatchPlayStatus(admin, gid);
  if (!status) {
    return { attempted: false, reason: "not_matchplay" };
  }
  if (status.needsPlayoff) {
    return { attempted: false, reason: "needs_playoff" };
  }
  if (status.decidedAtHole == null) {
    return { attempted: false, reason: "not_decided" };
  }
  if (status.matchplayCompleted) {
    return {
      attempted: true,
      closed: true,
      message: "El match ya estaba cerrado en el cuadro.",
    };
  }

  const hadBracketBefore = Boolean(status.matchplayMatchId);

  const result = await closeMatchAndAdvanceForGroup(admin, {
    groupId: gid,
    notifyNextGroup: options?.notifyNextGroup !== false,
  });

  if (!result.ok) {
    return {
      attempted: true,
      closed: false,
      error: result.error,
      bracketPublished: !hadBracketBefore,
    };
  }

  return {
    attempted: true,
    closed: true,
    message: result.message,
    nextGroupCreated: result.nextGroupCreated,
    nextGroupNo: result.nextGroupNo,
    nextTeeTime: result.nextTeeTime,
    bracketPublished: !hadBracketBefore,
  };
}
