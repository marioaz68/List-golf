import { buildCutRulesCcQ } from "./buildCutRules";
import { buildPrizeRulesFromCompetition } from "./buildPrizeRules";
import { ccqTorneoAnualMachote } from "./templates/ccqTorneoAnualMachote";
import type { ConvocatoriaDraft } from "./types";

const CCQ_CODES = new Set([
  "CAMP",
  "AA",
  "A",
  "B",
  "C",
  "DE",
  "SEN",
  "SS",
  "DA",
  "DB",
  "DC",
]);

/** Borrador estándar CCQ (plantilla o importación previa). */
export function isCcqStandardDraft(draft: ConvocatoriaDraft): boolean {
  if (draft.categories.length !== 11) return false;
  const codes = new Set(draft.categories.map((c) => c.code.toUpperCase()));
  for (const code of CCQ_CODES) {
    if (!codes.has(code)) return false;
  }
  return true;
}

/** Falta alineación 68º (exención SEN/SS, premios socio, textos de referencia). */
export function draftNeedsMachoteSync(draft: ConvocatoriaDraft): boolean {
  if (!isCcqStandardDraft(draft)) return false;

  const senCut = draft.cut_rules.find((r) =>
    r.category_codes.some((c) => c === "SEN" || c === "SS")
  );
  if (senCut && !senCut.gross_exemption_enabled) return true;

  const hasMemberPrize = draft.prize_rules.some((p) =>
    /socia del club|socio del club/i.test(p.prize_label)
  );
  if (!hasMemberPrize) return true;

  if (!draft.reference?.cut_tiebreak_gross?.trim()) return true;

  const da = draft.categories.find((c) => c.code === "DA");
  if (da && !/4\.1|4\.2|bandas/i.test(da.format_notes ?? "")) return true;

  const grossCut = draft.cut_rules.find((r) =>
    r.category_codes.includes("CAMP")
  );
  if (
    grossCut &&
    (grossCut.ranking_mode !== "specified_rounds" ||
      grossCut.from_round_no !== 1 ||
      !grossCut.tie_break_profile_key)
  ) {
    return true;
  }

  return false;
}

/** Alinea cortes, premios, competencia y referencia con machote 68º (conserva título y ediciones menores). */
export function alignConvocatoriaWithMachote(
  draft: ConvocatoriaDraft,
  tournamentTitle?: string | null
): ConvocatoriaDraft {
  const machote = ccqTorneoAnualMachote({
    title:
      draft.meta.title ??
      (tournamentTitle ? `${tournamentTitle} — Torneo Anual` : null),
  });

  if (!isCcqStandardDraft(draft)) {
    return {
      ...draft,
      meta: { ...machote.meta, ...draft.meta },
      reference: draft.reference ?? machote.reference,
    };
  }

  const categories = machote.categories.map((mc) => {
    const existing = draft.categories.find(
      (c) => c.code.toUpperCase() === mc.code
    );
    if (!existing) return mc;
    return {
      ...mc,
      name: existing.name || mc.name,
      handicap_min: existing.handicap_min ?? mc.handicap_min,
      handicap_max: existing.handicap_max ?? mc.handicap_max,
      tee_hint: existing.tee_hint ?? mc.tee_hint,
      format_notes: existing.format_notes || mc.format_notes,
      has_cut: existing.has_cut,
    };
  });

  const competition_rules = machote.competition_rules;
  const meta = { ...machote.meta, ...draft.meta };
  const cut_rules = buildCutRulesCcQ(meta);
  const prize_rules = buildPrizeRulesFromCompetition(competition_rules);

  const syncNote =
    "Cortes y premios alineados automáticamente con convocatoria 68º Torneo Anual CCQ.";

  return {
    ...draft,
    meta,
    reference: {
      ...machote.reference!,
      ...(draft.reference ?? {}),
    },
    categories,
    competition_rules,
    cut_rules,
    prize_rules,
    warnings: [
      ...new Set([...(draft.warnings ?? []).filter((w) => w !== syncNote), syncNote]),
    ],
  };
}

export function buildMachoteDraftForTournament(
  tournamentName?: string | null
): ConvocatoriaDraft {
  return ccqTorneoAnualMachote({
    title: tournamentName
      ? `${tournamentName} — Torneo Anual`
      : "68º Torneo Anual",
  });
}
