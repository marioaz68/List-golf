import { startingHoleLabelForGroup } from "@/app/torneos/[id]/lib/shotgunStartingLabels";
import {
  normalizeStartTypeForSession,
  normalizeTime,
  toYyyyMmDd,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";

export type PairingGroupForLabel = {
  id: string;
  round_id: string;
  group_no: number;
  starting_hole: number | null;
};

/** Sesión de salidas sin dividir por onda (viernes PM = un solo bloque). */
function pairingSessionLabelKey(r: SessionRoundFields) {
  return [
    r.tournament_id,
    String(r.round_no),
    toYyyyMmDd(r.round_date) ?? String(r.round_date ?? "").trim(),
    normalizeStartTypeForSession(r.start_type),
    normalizeTime(r.start_time),
  ].join("|");
}

function isShotgunSession(rounds: SessionRoundFields[]) {
  return rounds.some((r) => normalizeStartTypeForSession(r.start_type) === "shotgun");
}

function buildPairingLabelBlocks(rounds: SessionRoundFields[]) {
  const map = new Map<string, SessionRoundFields[]>();
  for (const r of rounds) {
    const k = pairingSessionLabelKey(r);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return [...map.values()].map((list) =>
    [...list].sort((a, b) =>
      String(a.category_id ?? "").localeCompare(String(b.category_id ?? ""))
    )
  );
}

/** Mismo hoyo en shotgun: primer grupo B, segundo A (como en generación 1B → 1A). */
function applyShotgunLabelsFromStartingHoles(
  labelByGroupId: Map<string, string | null>,
  blockGroups: PairingGroupForLabel[]
) {
  const byHole = new Map<number, PairingGroupForLabel[]>();
  for (const g of blockGroups) {
    const hole = g.starting_hole;
    if (hole == null || !Number.isFinite(hole)) continue;
    const list = byHole.get(hole) ?? [];
    list.push(g);
    byHole.set(hole, list);
  }

  for (const [hole, list] of byHole) {
    const sorted = [...list].sort(
      (a, b) =>
        Number(a.group_no) - Number(b.group_no) ||
        String(a.round_id).localeCompare(String(b.round_id)) ||
        String(a.id).localeCompare(String(b.id))
    );
    if (sorted.length >= 2) {
      labelByGroupId.set(sorted[0]!.id, `H${hole}B`);
      labelByGroupId.set(sorted[1]!.id, `H${hole}A`);
      for (let i = 2; i < sorted.length; i++) {
        labelByGroupId.set(sorted[i]!.id, `H${hole}A`);
      }
    } else if (sorted.length === 1) {
      const current = labelByGroupId.get(sorted[0]!.id);
      if (!current || !/[AB]$/i.test(current)) {
        labelByGroupId.set(sorted[0]!.id, `H${hole}A`);
      }
    }
  }
}

/**
 * Etiquetas H1B / H1A / H2B… por bloque de sesión (día + turno + shotgun).
 * Usa TODAS las categorías del viernes juntas (>18 grupos → salidas B).
 */
export function buildPairingGroupLabelsBySession(
  groups: PairingGroupForLabel[],
  rounds: SessionRoundFields[]
): Map<string, string | null> {
  const labelByGroupId = new Map<string, string | null>();
  if (groups.length === 0 || rounds.length === 0) return labelByGroupId;

  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const blocks = buildPairingLabelBlocks(rounds);

  for (const block of blocks) {
    const sessionKey = pairingSessionLabelKey(block[0]!);
    const sessionRoundIds = new Set(
      rounds
        .filter((r) => pairingSessionLabelKey(r) === sessionKey)
        .map((r) => r.id)
    );

    const blockGroups = groups
      .filter((g) => sessionRoundIds.has(g.round_id))
      .sort((a, b) => {
        const ra = block.findIndex((r) => r.id === a.round_id);
        const rb = block.findIndex((r) => r.id === b.round_id);
        if (ra !== rb) return ra - rb;
        return Number(a.group_no) - Number(b.group_no);
      });

    if (blockGroups.length === 0) continue;

    const startType = block[0]?.start_type ?? null;
    const shotgun = isShotgunSession(block);

    if (shotgun) {
      const n = blockGroups.length;
      blockGroups.forEach((g, idx) => {
        labelByGroupId.set(
          g.id,
          startingHoleLabelForGroup({
            startType,
            groupIndexInRound: idx,
            groupsInRound: n,
            starting_hole: g.starting_hole,
          })
        );
      });
      applyShotgunLabelsFromStartingHoles(labelByGroupId, blockGroups);
    } else {
      blockGroups.forEach((g) => {
        const hole = g.starting_hole;
        labelByGroupId.set(
          g.id,
          hole != null ? `H${hole}` : null
        );
      });
    }
  }

  for (const g of groups) {
    if (labelByGroupId.has(g.id)) continue;
    const round = roundById.get(g.round_id);
    const hole = g.starting_hole;
    labelByGroupId.set(
      g.id,
      hole != null ? `H${hole}` : null
    );
  }

  return labelByGroupId;
}
