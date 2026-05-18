import {
  buildSessionBlocks,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { startingHoleLabelForGroup } from "@/app/torneos/[id]/lib/shotgunStartingLabels";

export type PairingGroupForLabel = {
  id: string;
  round_id: string;
  group_no: number;
  starting_hole: number | null;
};

/**
 * Etiquetas H1B / H1A / H2B… por bloque de sesión (día + turno + shotgun),
 * no por fila `rounds` de categoría. Si solo se cuenta por `round_id`, >18 grupos
 * repartidos en varias categorías nunca activan salida B.
 */
export function buildPairingGroupLabelsBySession(
  groups: PairingGroupForLabel[],
  rounds: SessionRoundFields[]
): Map<string, string | null> {
  const labelByGroupId = new Map<string, string | null>();
  if (groups.length === 0 || rounds.length === 0) return labelByGroupId;

  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const blocks = buildSessionBlocks(rounds);

  for (const block of blocks) {
    const blockRoundIds = new Set(block.map((r) => r.id));
    const blockGroups = groups
      .filter((g) => blockRoundIds.has(g.round_id))
      .sort((a, b) => {
        const ra = block.findIndex((r) => r.id === a.round_id);
        const rb = block.findIndex((r) => r.id === b.round_id);
        if (ra !== rb) return ra - rb;
        return Number(a.group_no) - Number(b.group_no);
      });

    const startType = block[0]?.start_type ?? null;
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
  }

  for (const g of groups) {
    if (labelByGroupId.has(g.id)) continue;
    const round = roundById.get(g.round_id);
    const list = groups
      .filter((x) => x.round_id === g.round_id)
      .sort((a, b) => Number(a.group_no) - Number(b.group_no));
    const idx = list.findIndex((x) => x.id === g.id);
    labelByGroupId.set(
      g.id,
      startingHoleLabelForGroup({
        startType: round?.start_type ?? null,
        groupIndexInRound: Math.max(0, idx),
        groupsInRound: list.length,
        starting_hole: g.starting_hole,
      })
    );
  }

  return labelByGroupId;
}
