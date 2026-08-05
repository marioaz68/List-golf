import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSEST_TO_PIN_MAX_PRIZES } from "./types";

export type ClosestToPinPrize = {
  id: string;
  tournamentId: string;
  holeNumber: number;
  prizePosition: number;
  prizeLabel: string;
  sponsor: string | null;
  notes: string | null;
  isActive: boolean;
};

type DbRow = {
  id: string;
  tournament_id: string;
  hole_number: number;
  prize_position: number;
  prize_label: string;
  sponsor: string | null;
  notes: string | null;
  is_active: boolean;
};

function mapRow(r: DbRow): ClosestToPinPrize {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    holeNumber: r.hole_number,
    prizePosition: r.prize_position,
    prizeLabel: r.prize_label,
    sponsor: r.sponsor,
    notes: r.notes,
    isActive: r.is_active,
  };
}

export async function loadClosestToPinPrizes(
  admin: SupabaseClient,
  tournamentId: string,
  opts?: { holeNumber?: number; activeOnly?: boolean }
): Promise<ClosestToPinPrize[]> {
  let q = admin
    .from("closest_to_pin_prizes")
    .select(
      "id, tournament_id, hole_number, prize_position, prize_label, sponsor, notes, is_active"
    )
    .eq("tournament_id", tournamentId)
    .order("hole_number", { ascending: true })
    .order("prize_position", { ascending: true });

  if (opts?.holeNumber != null) {
    q = q.eq("hole_number", opts.holeNumber);
  }
  if (opts?.activeOnly !== false) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map(mapRow);
}

/** Mapa hole → position → prize for ranking display. */
export function prizesByHolePosition(
  prizes: ClosestToPinPrize[]
): Map<number, Map<number, ClosestToPinPrize>> {
  const m = new Map<number, Map<number, ClosestToPinPrize>>();
  for (const p of prizes) {
    if (!p.isActive) continue;
    if (p.prizePosition < 1 || p.prizePosition > CLOSEST_TO_PIN_MAX_PRIZES) {
      continue;
    }
    let byPos = m.get(p.holeNumber);
    if (!byPos) {
      byPos = new Map();
      m.set(p.holeNumber, byPos);
    }
    byPos.set(p.prizePosition, p);
  }
  return m;
}

export function prizeText(p: ClosestToPinPrize): string {
  if (p.sponsor?.trim()) {
    return `${p.prizeLabel.trim()} (${p.sponsor.trim()})`;
  }
  return p.prizeLabel.trim();
}
