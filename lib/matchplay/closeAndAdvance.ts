import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import { advanceWinnerInBracket } from "@/lib/matchplay/advanceWinner";
import { maybeCreateNextRoundGroup } from "@/lib/matchplay/maybeCreateNextRoundGroup";
import { notifyNextRoundGroupCreated } from "@/lib/matchplay/notifyNextRoundGroup";
import { autoPublishOnAuctionComplete } from "@/lib/matchplay/autoPublishOnAuctionComplete";
import {
  findBracketMatchForPairs,
  getMainBracketSize,
  routeLoserToConsolationMp,
} from "@/lib/matchplay/consolationMatchPlay";

/**
 * Cierra un match (formato Bola Baja + Alta) cuando ya está
 * matemáticamente decidido y avanza al ganador al cuadro:
 *  1. Identifica el `matchplay_matches` real correspondiente al grupo
 *     (mismas 2 parejas en la misma ronda del bracket).
 *  2. Lo marca como `completed` con `winner_pair_id`, `result_text`,
 *     `holes_played`.
 *  3. Llama a `advanceWinnerInBracket` para colocar al ganador en el
 *     siguiente match del cuadro.
 *  4. Si el siguiente match ya quedó con AMBAS parejas asignadas, crea
 *     automáticamente el `pairing_group` + tee time para esa salida
 *     (siguiente ronda del torneo).
 *
 * La función es idempotente: si el match ya está `completed`, sólo
 * recalcula el siguiente paso de salidas si aplica.
 */
export type CloseMatchResult =
  | {
      ok: true;
      matchplayMatchId: string;
      winnerPairId: string | null;
      status: "completed" | "halved";
      advanced: boolean;
      nextMatchId: string | null;
      nextGroupCreated: boolean;
      nextRoundId: string | null;
      nextGroupNo: number | null;
      nextTeeTime: string | null;
      /** Conteo de notificaciones de Telegram enviadas al nuevo grupo. */
      telegramNotified?: { sent: number; failed: number; skipped: number };
      message: string;
    }
  | { ok: false; error: string };

function formatResultText(
  decidedAtHole: number,
  topTotal: number,
  bottomTotal: number,
  viaPlayoff: boolean,
  playoffHole?: number
): string {
  const diff = Math.abs(topTotal - bottomTotal);
  const lead = Number.isInteger(diff)
    ? String(diff)
    : diff.toFixed(1).replace(/\.0$/, "");
  if (viaPlayoff && playoffHole != null) {
    return `Desempate H${playoffHole} · ${lead} arriba`;
  }
  const pointsLeft = Math.max(0, 18 - decidedAtHole) * 2;
  const tail = pointsLeft > 0 ? ` · ${pointsLeft} por jugar` : "";
  return `H${decidedAtHole} · ${lead} arriba${tail}`;
}

export async function closeMatchAndAdvanceForGroup(
  admin: SupabaseClient,
  params: {
    groupId: string;
    /** Si true (default) y la siguiente salida se crea automáticamente,
     *  se envía un mensaje de Telegram a los 4 jugadores y a sus caddies
     *  asignados con la nueva ronda + link a la tarjeta. Best-effort. */
    notifyNextGroup?: boolean;
  }
): Promise<CloseMatchResult> {
  const groupId = String(params.groupId ?? "").trim();
  if (!groupId) return { ok: false, error: "Falta group_id." };
  const shouldNotify = params.notifyNextGroup !== false;

  // 1) Grupo + ronda + torneo
  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", groupId)
    .maybeSingle();
  if (!groupRow?.round_id) {
    return { ok: false, error: "Grupo no encontrado." };
  }
  const roundId = String(groupRow.round_id);
  const groupNo =
    typeof groupRow.group_no === "number" ? groupRow.group_no : null;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, tournament_id, round_no")
    .eq("id", roundId)
    .maybeSingle();
  if (!roundRow?.tournament_id) {
    return { ok: false, error: "Ronda inválida." };
  }
  const tournamentId = String(roundRow.tournament_id);
  const currentRoundNo = Number(roundRow.round_no ?? 0);

  // 2) Reglas — debe ser Bola Baja + Alta
  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (rulesRow?.pair_format !== "low_high") {
    return {
      ok: false,
      error: "El torneo no es Match Play Bola Baja + Alta.",
    };
  }

  // 3) Bracket publicado en DB (si falta y la subasta está completa, publicar
  //    aquí para no bloquear cierre desde captura).
  let { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id, status")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bracket?.id) {
    const pub = await autoPublishOnAuctionComplete(admin, tournamentId);
    if (pub.status === "published" || pub.status === "bracket_exists") {
      const refetch = await admin
        .from("matchplay_brackets")
        .select("id, status")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      bracket = refetch.data;
    } else if (pub.status === "incomplete") {
      return {
        ok: false,
        error: `Faltan ${pub.pending} pareja(s) por adjudicar en la subasta antes de cerrar el match.`,
      };
    } else if (pub.status === "no_teams") {
      return {
        ok: false,
        error: "No hay equipos activos para publicar el cuadro.",
      };
    } else {
      return {
        ok: false,
        error:
          pub.reason ??
          "No se pudo publicar el cuadro automáticamente. Revisa /matchplay.",
      };
    }
  }

  if (!bracket?.id) {
    return {
      ok: false,
      error:
        "El torneo no tiene cuadro publicado. Publícalo en /matchplay o completa la subasta.",
    };
  }
  const bracketId = String(bracket.id);

  // 4) Derivar la pareja top/bottom del grupo
  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const derivedMatchId = `derived-${roundId}-g${groupNo}`;
  const derivedMatch = derived.matches.find((m) => m.id === derivedMatchId);
  if (
    !derivedMatch ||
    !derivedMatch.top_pair_id ||
    !derivedMatch.bottom_pair_id
  ) {
    return {
      ok: false,
      error: "El grupo no tiene dos parejas asignadas (¿BYE?).",
    };
  }
  const topPairId = derivedMatch.top_pair_id;
  const bottomPairId = derivedMatch.bottom_pair_id;

  // 5) Encontrar el match real (cuadro principal o consolación) en la misma
  //    ronda del calendario.
  const realMatchRef = await findBracketMatchForPairs(admin, {
    tournamentId,
    mainBracketId: bracketId,
    roundNo: currentRoundNo,
    topPairId,
    bottomPairId,
  });
  if (!realMatchRef) {
    return {
      ok: false,
      error:
        `No hay partido en R${currentRoundNo} del cuadro (principal ni consolación) con estas dos parejas. ` +
        "Usa “Reparar cuadro y cerrar R1” para regenerar el bracket desde los grupos del calendario.",
    };
  }

  const { data: realMatch } = await admin
    .from("matchplay_matches")
    .select(
      "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, next_match_id"
    )
    .eq("id", realMatchRef.id)
    .maybeSingle();

  if (!realMatch) {
    return { ok: false, error: "Partido del cuadro no encontrado." };
  }
  const matchplayMatchId = String(realMatch.id);

  // 6) Re-derivar la decisión a partir de los scores stroke play
  const { decisions } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    [derivedMatch]
  );
  const decision = decisions.get(derivedMatchId);
  if (!decision) {
    return {
      ok: false,
      error: "El match todavía no está matemáticamente decidido.",
    };
  }

  // Determinar el ganador real en términos de pair_id (no derived "top/bottom").
  const derivedWinnerPairId =
    decision.winner === "top" ? topPairId : bottomPairId;

  // En matchplay_matches el "lado" puede estar invertido respecto al
  // derived; eso es OK porque guardamos winner_pair_id directamente.
  const winnerPairId = derivedWinnerPairId;

  // 7) Idempotencia: si ya está completado con este ganador, sólo
  //    reintentamos el paso 8/9.
  let alreadyCompleted = false;
  if (
    realMatch.status === "completed" &&
    realMatch.winner_pair_id === winnerPairId
  ) {
    alreadyCompleted = true;
  } else if (realMatch.status === "completed") {
    return {
      ok: false,
      error:
        "El match ya está cerrado con un ganador distinto. Reabre el cuadro desde /matchplay si es necesario.",
    };
  }

  const holesPlayed = decision.via_playoff
    ? 18 + Number(decision.playoff_hole ?? 0)
    : decision.decided_at_hole;
  const resultText = formatResultText(
    decision.decided_at_hole,
    decision.top_total,
    decision.bottom_total,
    Boolean(decision.via_playoff),
    decision.playoff_hole
  );

  if (!alreadyCompleted) {
    const { error: updErr } = await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: winnerPairId,
        status: "completed",
        result_text: resultText,
        holes_played: holesPlayed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchplayMatchId);
    if (updErr) {
      return { ok: false, error: `Error cerrando match: ${updErr.message}` };
    }
  }

  // 8) Avanzar al ganador (advanceWinnerInBracket también intenta crear
  //    la salida de la ronda siguiente automáticamente).
  const adv = await advanceWinnerInBracket(admin, {
    match_id: matchplayMatchId,
    winner_pair_id: winnerPairId,
  });

  let nextGroupCreated = !!adv.next_group?.created;
  let nextGroupNo: number | null = adv.next_group?.groupNo ?? null;
  let nextRoundId: string | null = adv.next_group?.roundId ?? null;
  let nextTeeTime: string | null = adv.next_group?.teeTime ?? null;
  let consolationNote = "";

  // Perdedores de la ronda configurada (ej. R3 cuartos) → consolación MP en
  // la ronda siguiente (G3–G4 en R4, después de semis G1–G2 del cuadro principal).
  const isMainBracketMatch = String(realMatch.bracket_id) === bracketId;
  if (isMainBracketMatch && winnerPairId) {
    const loserPairId =
      winnerPairId === topPairId ? bottomPairId : topPairId;
    const mainSize = await getMainBracketSize(admin, tournamentId);
    const consol = await routeLoserToConsolationMp(admin, {
      tournamentId,
      closedRoundNo: Number(realMatch.round_no),
      closedPositionNo: Number(realMatch.position_no),
      loserPairId,
      mainBracketSize: mainSize,
    });
    if (consol.routed) {
      consolationNote = ` ${consol.message}`;
      if (consol.groupCreated && consol.groupNo != null) {
        nextGroupCreated = true;
        nextGroupNo = consol.groupNo;
        const nextRoundNo = Number(realMatch.round_no) + 1;
        const { data: rr } = await admin
          .from("rounds")
          .select("id, start_time, interval_minutes")
          .eq("tournament_id", tournamentId)
          .eq("round_no", nextRoundNo)
          .maybeSingle();
        if (rr?.id) {
          nextRoundId = String(rr.id);
          if (rr.start_time && consol.groupNo != null) {
            const parseHHMM = (raw: string): number | null => {
              const m = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
              if (!m) return null;
              return Number(m[1]) * 60 + Number(m[2]);
            };
            const formatHHMM = (total: number): string => {
              const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
              return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
            };
            const base = parseHHMM(String(rr.start_time));
            const interval =
              typeof rr.interval_minutes === "number" && rr.interval_minutes > 0
                ? rr.interval_minutes
                : 10;
            if (base != null) {
              nextTeeTime = formatHHMM(
                base + (consol.groupNo - 1) * interval
              );
            }
          }
        }
      }
    }
  }

  if (adv.next_group?.created || adv.next_group?.updated) {
    nextGroupCreated = !!adv.next_group.created;
  } else if (adv.advanced && adv.next_match_id && isMainBracketMatch) {
    // Fallback: si la siguiente salida no se generó automáticamente (por
    // ejemplo, porque la cascada de BYE creó el siguiente match y aún
    // espera a la otra pareja), reintentamos por si la actualización de
    // la otra pareja ya pasó.
    const retry = await maybeCreateNextRoundGroup(admin, {
      tournamentId,
      nextMatchId: adv.next_match_id,
    });
    if (retry.ok) {
      nextGroupCreated = retry.created;
      nextGroupNo = retry.groupNo;
      nextRoundId = retry.roundId;
      nextTeeTime = retry.teeTime;
    }
  }
  // Variable usada para mantener el rastro del paso 6 (no para lógica).
  void currentRoundNo;

  // 10) Notificar por Telegram al nuevo grupo (jugadores + caddies).
  //     Best-effort: no rompemos el cierre si falla.
  let telegramNotified: { sent: number; failed: number; skipped: number } | undefined;
  if (shouldNotify && nextGroupCreated && nextRoundId) {
    try {
      telegramNotified = await notifyNextRoundGroupCreated(admin, {
        tournamentId,
        nextRoundId,
        nextGroupNo,
        nextTeeTime,
        closedMatchResult: resultText,
      });
    } catch {
      telegramNotified = { sent: 0, failed: 0, skipped: 0 };
    }
  }

  const advanceMessage = adv.advanced
    ? adv.message
    : "Sin partido siguiente (campeón) o BYE.";

  const notifySuffix = telegramNotified
    ? telegramNotified.sent > 0
      ? ` ${telegramNotified.sent} notificacion(es) Telegram enviada(s)${
          telegramNotified.failed > 0
            ? `, ${telegramNotified.failed} fallaron`
            : ""
        }${
          telegramNotified.skipped > 0
            ? `, ${telegramNotified.skipped} sin chat ID`
            : ""
        }.`
      : telegramNotified.skipped > 0 || telegramNotified.failed > 0
        ? ` Sin destinatarios con Telegram vinculado.`
        : ""
    : "";

  return {
    ok: true,
    matchplayMatchId,
    winnerPairId,
    status: "completed",
    advanced: adv.advanced,
    nextMatchId: adv.next_match_id ?? null,
    nextGroupCreated,
    nextRoundId,
    nextGroupNo,
    nextTeeTime,
    telegramNotified,
    message: nextGroupCreated
      ? `${advanceMessage}${consolationNote} Salida creada (G${nextGroupNo} · ${nextTeeTime}).${notifySuffix}`
      : `${advanceMessage}${consolationNote}${notifySuffix ? notifySuffix : ""}`,
  };
}

