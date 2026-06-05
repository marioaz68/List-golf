import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGroupMatchPlayStatus } from "@/lib/captura/matchPlayGroupDecision";
import { closeMatchAndAdvanceForGroup } from "@/lib/matchplay/closeAndAdvance";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import {
  isEntryEliminatedInMatch,
  losingPairEntryIds,
} from "@/lib/matchplay/entryMatchOutcome";
import {
  isConsolationMpEntryRound,
  loadConsolationMpRule,
} from "@/lib/matchplay/consolationMatchPlay";
import {
  notifyNextRoundGroupCreated,
  type NotifyResult,
} from "@/lib/matchplay/notifyNextRoundGroup";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import { resolveOpenCaptureRoundForEntry } from "@/lib/rounds/resolveOpenCaptureRoundForEntry";
import type { SessionRoundFields } from "@/app/(backoffice)/tee-sheet/sessionBlock";
import type { RoundForGate } from "@/lib/rounds/categoryRoundGate";

export type CloseMatchPlayGroupRoundResult =
  | {
      ok: true;
      closedCount: number;
      alreadyLockedCount: number;
      currentRoundNo: number;
      nextRoundNo: number | null;
      nextRoundId: string | null;
      nextGroupId: string | null;
      telegramNotified: NotifyResult | null;
      /** Pareja del anchor perdió el match y queda fuera del torneo. */
      eliminated: boolean;
      /** Nombres de los jugadores de la pareja eliminada (para aviso en UI). */
      eliminatedPlayerNames: string[];
      message: string;
    }
  | { ok: false; error: string };

function buildPlayerName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  const parts = [String(first ?? "").trim(), String(last ?? "").trim()].filter(
    Boolean
  );
  return parts.join(" ") || "Jugador";
}

async function findGroupForEntryInRound(
  admin: SupabaseClient,
  entryId: string,
  roundId: string
): Promise<string | null> {
  const { data: groupsInRound } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", roundId);
  const groupIds = (groupsInRound ?? [])
    .map((g) => String(g.id ?? "").trim())
    .filter(Boolean);
  if (groupIds.length === 0) return null;

  const { data: memberRow } = await admin
    .from("pairing_group_members")
    .select("group_id")
    .eq("entry_id", entryId)
    .in("group_id", groupIds)
    .maybeSingle();

  return String(memberRow?.group_id ?? "").trim() || null;
}

export type StaffCloseEntryParams = {
  tournamentId: string;
  roundId: string;
  roundNo: number;
  entryId: string;
  playerId: string;
  minHolesRequired: number;
};

/** Cierra las 4 tarjetas del grupo y resuelve la salida de la ronda siguiente. */
export async function closeMatchPlayGroupRound(
  admin: SupabaseClient,
  staffCloseEntry: (
    admin: SupabaseClient,
    params: StaffCloseEntryParams
  ) => Promise<{ alreadyLocked: boolean }>,
  params: {
    tournamentId: string;
    groupId: string;
    anchorEntryId: string;
  }
): Promise<CloseMatchPlayGroupRoundResult> {
  const tournamentId = String(params.tournamentId ?? "").trim();
  const groupId = String(params.groupId ?? "").trim();
  const anchorEntryId = String(params.anchorEntryId ?? "").trim();

  if (!tournamentId || !groupId || !anchorEntryId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", groupId)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim();
  if (!roundId) {
    return { ok: false, error: "Grupo no encontrado." };
  }

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, round_no, tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const currentRoundNo = Number(roundRow?.round_no ?? 0);
  if (!roundRow?.tournament_id || roundRow.tournament_id !== tournamentId) {
    return { ok: false, error: "La ronda del grupo no pertenece a este torneo." };
  }

  const { data: memberRows } = await admin
    .from("pairing_group_members")
    .select("entry_id")
    .eq("group_id", groupId);
  const entryIds = (memberRows ?? [])
    .map((r) => String(r.entry_id ?? "").trim())
    .filter(Boolean);
  if (entryIds.length === 0) {
    return { ok: false, error: "El grupo no tiene jugadores." };
  }

  const { data: entryRows } = await admin
    .from("tournament_entries")
    .select("id, player_id, category_id")
    .in("id", entryIds);
  const entriesById = new Map(
    (entryRows ?? []).map((e) => [
      String(e.id),
      {
        playerId: String(e.player_id ?? "").trim(),
        categoryId: e.category_id as string | null,
      },
    ])
  );

  // Match play: el resultado oficial vive en matchplay_matches, no en
  // hole_scores. El cierre del grupo desde score-entry no debe exigir
  // un mínimo de capturas hoyo por hoyo (parejas con BYE no juegan, y
  // matches decididos antes del 18 quedan con capturas parciales).
  const minHolesRequired = 0;

  let closedCount = 0;
  let alreadyLockedCount = 0;
  const errors: string[] = [];

  for (const entryId of entryIds) {
    const meta = entriesById.get(entryId);
    if (!meta?.playerId) {
      errors.push(`Inscripción ${entryId}: jugador no encontrado.`);
      continue;
    }
    try {
      const result = await staffCloseEntry(admin, {
        tournamentId,
        roundId,
        roundNo: currentRoundNo,
        entryId,
        playerId: meta.playerId,
        minHolesRequired,
      });
      if (result.alreadyLocked) alreadyLockedCount += 1;
      else closedCount += 1;
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : `Error cerrando tarjeta de ${entryId}.`
      );
    }
  }

  if (errors.length > 0 && closedCount === 0 && alreadyLockedCount === 0) {
    return { ok: false, error: errors.join(" ") };
  }

  try {
    const mp = await loadGroupMatchPlayStatus(admin, groupId);
    if (
      mp &&
      mp.decidedAtHole != null &&
      !mp.matchplayCompleted &&
      !mp.needsPlayoff
    ) {
      await closeMatchAndAdvanceForGroup(admin, {
        groupId,
        notifyNextGroup: false,
      });
    }
  } catch {
    /* best-effort: el cierre de tarjetas ya se aplicó */
  }

  let eliminated = false;
  let eliminatedPlayerNames: string[] = [];

  try {
    const { data: rulesRow } = await admin
      .from("tournament_matchplay_rules")
      .select("pair_format")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (rulesRow?.pair_format === "low_high") {
      const consolationRule = await loadConsolationMpRule(admin, tournamentId);
      const derived = await derivePairingGroupMatches(admin, tournamentId);
      const groupNo =
        typeof groupRow?.group_no === "number" ? groupRow.group_no : null;
      const derivedMatchId =
        groupNo != null ? `derived-${roundId}-g${groupNo}` : "";
      const derivedMatch =
        derivedMatchId !== ""
          ? derived.matches.find((m) => m.id === derivedMatchId)
          : undefined;
      if (derivedMatch) {
        const { decisions } = await deriveMatchHolesFromStrokes(
          admin,
          tournamentId,
          [derivedMatch]
        );
        const decision = decisions.get(derivedMatchId);
        if (
          decision &&
          isEntryEliminatedInMatch(anchorEntryId, derivedMatch, decision) &&
          !isConsolationMpEntryRound(consolationRule, currentRoundNo)
        ) {
          eliminated = true;
          const loserEntryIds = losingPairEntryIds(derivedMatch, decision);
          if (loserEntryIds.length > 0) {
            const { data: loserEntries } = await admin
              .from("tournament_entries")
              .select("player_id")
              .in("id", loserEntryIds);
            const playerIds = (loserEntries ?? [])
              .map((r) => String(r.player_id ?? "").trim())
              .filter(Boolean);
            if (playerIds.length > 0) {
              const { data: players } = await admin
                .from("players")
                .select("id, first_name, last_name")
                .in("id", playerIds);
              eliminatedPlayerNames = (players ?? []).map((p) =>
                buildPlayerName(p.first_name, p.last_name)
              );
            }
          }
        }
      }
    }
  } catch {
    /* best-effort: el aviso de eliminación no debe bloquear el cierre */
  }

  const anchorMeta = entriesById.get(anchorEntryId);
  const gateCtx = await loadCategoryRoundGateContext(admin, tournamentId);
  const { data: roundRows } = await admin
    .from("rounds")
    .select(
      "id, round_no, round_date, tournament_id, category_id, wave, start_type, start_time, interval_minutes"
    )
    .eq("tournament_id", tournamentId);

  const roundsForCapture = ((roundRows ?? []) as SessionRoundFields[]).map(
    (r) => ({
      ...r,
      category_id: r.category_id ?? null,
    })
  ) as Array<RoundForGate & SessionRoundFields>;

  const open = resolveOpenCaptureRoundForEntry(
    anchorEntryId,
    anchorMeta?.categoryId ?? null,
    roundsForCapture,
    gateCtx.lookups
  );

  let nextRoundNo: number | null = null;
  let nextRoundId: string | null = null;
  let nextGroupId: string | null = null;

  if (!eliminated && open.ok && open.roundNo > currentRoundNo) {
    nextRoundNo = open.roundNo;
    nextRoundId = open.roundId;
    nextGroupId = await findGroupForEntryInRound(
      admin,
      anchorEntryId,
      open.roundId
    );
  } else if (
    !eliminated &&
    open.ok &&
    open.roundNo === currentRoundNo &&
    alreadyLockedCount === entryIds.length
  ) {
    // Todas cerradas en R actual: buscar siguiente ronda lógica del torneo.
    const roundNos = [
      ...new Set(roundsForCapture.map((r) => r.round_no)),
    ]
      .filter((n) => Number.isFinite(n) && n > currentRoundNo)
      .sort((a, b) => a - b);
    const followRoundNo = roundNos[0] ?? null;
    if (followRoundNo != null) {
      const followRound = roundsForCapture.find(
        (r) =>
          r.round_no === followRoundNo &&
          (!anchorMeta?.categoryId ||
            !r.category_id ||
            r.category_id === anchorMeta.categoryId)
      );
      if (followRound?.id) {
        nextRoundNo = followRoundNo;
        nextRoundId = String(followRound.id);
        nextGroupId = await findGroupForEntryInRound(
          admin,
          anchorEntryId,
          followRound.id
        );
      }
    }
  }

  // Notificar por Telegram a jugadores + caddies del nuevo grupo.
  // Best-effort: si falla, seguimos devolviendo ok=true para el cierre.
  let telegramNotified: NotifyResult | null = null;
  if (nextRoundNo != null && nextRoundId && nextGroupId) {
    try {
      telegramNotified = await notifyNextRoundGroupCreated(admin, {
        tournamentId,
        nextRoundId,
        nextGroupId,
        closedMatchResult: `R${currentRoundNo} cerrada`,
      });
    } catch {
      telegramNotified = null;
    }
  }

  const partialNote =
    errors.length > 0 ? ` Algunas tarjetas no se cerraron: ${errors.join(" ")}` : "";

  const eliminatedNamesLabel =
    eliminatedPlayerNames.length > 0
      ? eliminatedPlayerNames.join(" y ")
      : "La pareja buscada";

  if (eliminated) {
    return {
      ok: true,
      closedCount,
      alreadyLockedCount,
      currentRoundNo,
      nextRoundNo: null,
      nextRoundId: null,
      nextGroupId: null,
      telegramNotified: null,
      eliminated: true,
      eliminatedPlayerNames,
      message: `R${currentRoundNo} cerrada. ${eliminatedNamesLabel} eliminado${eliminatedPlayerNames.length === 1 ? "" : "s"} del torneo tras perder el match.${partialNote}`,
    };
  }

  if (nextRoundNo != null && nextGroupId) {
    return {
      ok: true,
      closedCount,
      alreadyLockedCount,
      currentRoundNo,
      nextRoundNo,
      nextRoundId,
      nextGroupId,
      telegramNotified,
      eliminated: false,
      eliminatedPlayerNames: [],
      message: `R${currentRoundNo} cerrada (${closedCount} tarjeta${closedCount === 1 ? "" : "s"} nuevas). Abriendo captura de R${nextRoundNo}.${partialNote}`,
    };
  }

  if (nextRoundNo != null) {
    return {
      ok: true,
      closedCount,
      alreadyLockedCount,
      currentRoundNo,
      nextRoundNo,
      nextRoundId,
      nextGroupId: null,
      telegramNotified,
      eliminated: false,
      eliminatedPlayerNames: [],
      message: `R${currentRoundNo} cerrada. R${nextRoundNo} lista para captura; la salida del grupo se creará cuando el rival también termine su partido.${partialNote}`,
    };
  }

  if (alreadyLockedCount === entryIds.length && closedCount === 0) {
    return {
      ok: true,
      closedCount,
      alreadyLockedCount,
      currentRoundNo,
      nextRoundNo: null,
      nextRoundId: null,
      nextGroupId: null,
      telegramNotified,
      eliminated: false,
      eliminatedPlayerNames: [],
      message: `Las tarjetas de este grupo ya estaban cerradas.${partialNote}`,
    };
  }

  return {
    ok: true,
    closedCount,
    alreadyLockedCount,
    currentRoundNo,
    nextRoundNo: null,
    nextRoundId: null,
    nextGroupId: null,
    telegramNotified,
    eliminated: false,
    eliminatedPlayerNames: [],
    message: `Tarjetas de R${currentRoundNo} cerradas.${partialNote}`,
  };
}
