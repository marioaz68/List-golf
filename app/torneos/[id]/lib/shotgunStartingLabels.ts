/** Misma lógica que `app/(backoffice)/tee-sheet/page.tsx` para hoyo + lado A/B. */

type ShotgunSlot = {
  hole: number;
  side: "A" | "B";
};

function getShotgunExtraHoleOrder() {
  const primary = [1, 10];
  const par5 = [5, 9, 14, 18];
  const par4 = [2, 4, 6, 11, 13, 15, 17];
  const par3 = [8, 3, 7, 12, 16];

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
