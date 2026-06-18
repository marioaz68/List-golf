/** Misma lógica que `app/(backoffice)/tee-sheet/page.tsx` para hoyo + lado A/B. */

import {
  CCQ_PAR3_HOLES,
  CCQ_PAR4_HOLES,
  CCQ_PAR5_HOLES,
} from "@/lib/distances/ccqScorecard";

type ShotgunSlot = {
  hole: number;
  side: "A" | "B";
};

function getShotgunExtraHoleOrder() {
  const primary = [1, 10];
  const par5 = [...CCQ_PAR5_HOLES];
  const par4 = [...CCQ_PAR4_HOLES];
  const par3 = [...CCQ_PAR3_HOLES];

  return [...primary, ...par5, ...par4, ...par3];
}

export function buildShotgunSlots(totalGroups: number): ShotgunSlot[] {
  const extraNeeded = Math.max(0, totalGroups - 18);
  const doubleHoles = new Set(getShotgunExtraHoleOrder().slice(0, extraNeeded));
  const slots: ShotgunSlot[] = [];

  for (let hole = 1; hole <= 18; hole++) {
    if (doubleHoles.has(hole)) {
      slots.push({ hole, side: "B" });
      slots.push({ hole, side: "A" });
    } else {
      slots.push({ hole, side: "A" });
    }
  }

  return slots.slice(0, totalGroups);
}

export function startingHoleLabelForGroup(params: {
  startType: string | null | undefined;
  groupIndexInRound: number;
  groupsInRound: number;
  starting_hole: number | null;
}): string | null {
  const st = String(params.startType ?? "").toLowerCase();
  const isShotgun = st === "shotgun";

  if (isShotgun && params.groupsInRound > 0) {
    const slots = buildShotgunSlots(params.groupsInRound);
    const slot = slots[params.groupIndexInRound];
    if (slot) return `H${slot.hole}${slot.side}`;
  }

  if (typeof params.starting_hole === "number") {
    return `H${params.starting_hole}`;
  }

  return null;
}
