/**
 * Auto-crea categoría + round + pairing_groups vacíos para una ronda diaria.
 *
 * Convención:
 *   - 1 categoría "ABIERTA" mixta (gender='X') con HCP 0-54
 *   - 1 round vinculada a esa categoría
 *   - Pairing groups vacíos cada 10 min (hoyo 1 y hoyo 10 por cada hora):
 *       tanda mañana:  07:00-09:10  (14 salidas)
 *       tanda media:   11:40-13:50  (14 salidas)
 *       tanda tarde:   16:00-17:50  (12 salidas)
 *
 * Idempotente: si ya existe categoría o ya hay pairing_groups, no duplica.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface SeedResult {
  ok: boolean;
  categoryCreated: boolean;
  roundCreated: boolean;
  groupsCreated: number;
  error?: string;
}

/**
 * Asegura la estructura base de una ronda diaria (categoría ABIERTA + 1 round)
 * SIN generar las 48 salidas. Útil para agregar salidas individuales a mano.
 * Idempotente.
 */
export async function ensureDailyRoundBase(
  admin: SupabaseClient,
  tournamentId: string,
  roundDate: string
): Promise<{ ok: boolean; categoryId?: string; roundId?: string; error?: string }> {
  if (!tournamentId) return { ok: false, error: "Falta tournamentId" };

  const { data: tour } = await admin
    .from("tournaments")
    .select("id, club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  const clubId = (tour as { club_id: string | null } | null)?.club_id ?? null;
  let orgId: string | null = null;
  if (clubId) {
    const { data: club } = await admin
      .from("clubs")
      .select("org_id")
      .eq("id", clubId)
      .maybeSingle();
    if (club) orgId = (club as { org_id: string | null }).org_id;
  }

  // Categoría
  const { data: existingCats } = await admin
    .from("categories")
    .select("id, code")
    .eq("tournament_id", tournamentId);
  const cats = (existingCats ?? []) as Array<{ id: string; code: string }>;
  let categoryId: string | null =
    cats.find((c) => c.code === "ABIERTA")?.id ?? cats[0]?.id ?? null;
  if (!categoryId) {
    const { data: catRow, error: catErr } = await admin
      .from("categories")
      .insert({
        org_id: orgId,
        tournament_id: tournamentId,
        gender: "X",
        category_group: "main",
        code: "ABIERTA",
        name: "Abierta · Ronda del día",
        handicap_min: 0,
        handicap_max: 54,
        is_active: true,
        allow_multiple_prizes_per_player: false,
        sort_order: 1,
      })
      .select("id")
      .single();
    if (catErr || !catRow) {
      return { ok: false, error: catErr?.message ?? "No pude crear categoría" };
    }
    categoryId = String((catRow as { id: string }).id);
  }

  // Round
  const { data: existingRounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("category_id", categoryId)
    .limit(1);
  let roundId: string | null =
    existingRounds && existingRounds.length > 0
      ? String((existingRounds[0] as { id: string }).id)
      : null;
  if (!roundId) {
    const { data: rRow, error: rErr } = await admin
      .from("rounds")
      .insert({
        tournament_id: tournamentId,
        round_no: 1,
        category_id: categoryId,
        round_date: roundDate,
        wave: "AM",
        start_type: "tee_time",
        start_time: "07:00",
        interval_minutes: 10,
        group_size: 4,
      })
      .select("id")
      .single();
    if (rErr || !rRow) {
      return { ok: false, error: rErr?.message ?? "No pude crear round" };
    }
    roundId = String((rRow as { id: string }).id);
  }

  return { ok: true, categoryId, roundId };
}

export async function seedDailyRoundSchedule(
  admin: SupabaseClient,
  tournamentId: string,
  roundDate: string
): Promise<SeedResult> {
  if (!tournamentId) return { ok: false, categoryCreated: false, roundCreated: false, groupsCreated: 0, error: "Falta tournamentId" };

  // 1) Resolver org_id del torneo (categories lo requiere)
  const { data: tour, error: tErr } = await admin
    .from("tournaments")
    .select("id, club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr || !tour) {
    return { ok: false, categoryCreated: false, roundCreated: false, groupsCreated: 0, error: tErr?.message ?? "Torneo no existe" };
  }
  const clubId = (tour as { club_id: string | null }).club_id;
  let orgId: string | null = null;
  if (clubId) {
    const { data: club } = await admin
      .from("clubs")
      .select("org_id")
      .eq("id", clubId)
      .maybeSingle();
    if (club) orgId = (club as { org_id: string | null }).org_id;
  }

  // 2) Crear (o reusar) categoría ABIERTA mixta
  const { data: existingCats } = await admin
    .from("categories")
    .select("id, code")
    .eq("tournament_id", tournamentId);

  let categoryId: string | null = null;
  let categoryCreated = false;
  const cats = (existingCats ?? []) as Array<{ id: string; code: string }>;
  const abiertaCat = cats.find((c) => c.code === "ABIERTA");
  if (abiertaCat) {
    categoryId = abiertaCat.id;
  } else if (cats.length > 0) {
    // Si hay otras categorías ya, usar la primera (no creamos duplicadas)
    categoryId = cats[0].id;
  } else {
    const { data: catRow, error: catErr } = await admin
      .from("categories")
      .insert({
        org_id: orgId,
        tournament_id: tournamentId,
        gender: "X",
        category_group: "main",
        code: "ABIERTA",
        name: "Abierta · Ronda del día",
        handicap_min: 0,
        handicap_max: 54,
        min_age: null,
        max_age: null,
        max_players: null,
        is_active: true,
        allow_multiple_prizes_per_player: false,
        handicap_percent_override: null,
        default_prize_count: null,
        sort_order: 1,
      })
      .select("id")
      .single();
    if (catErr || !catRow) {
      return {
        ok: false,
        categoryCreated: false,
        roundCreated: false,
        groupsCreated: 0,
        error: catErr?.message ?? "No pude crear categoría",
      };
    }
    categoryId = String((catRow as { id: string }).id);
    categoryCreated = true;
  }

  // 3) Crear (o reusar) round para esa categoría
  const { data: existingRounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("category_id", categoryId)
    .limit(1);
  let roundId: string | null = null;
  let roundCreated = false;
  if (existingRounds && existingRounds.length > 0) {
    roundId = String((existingRounds[0] as { id: string }).id);
  } else {
    const { data: rRow, error: rErr } = await admin
      .from("rounds")
      .insert({
        tournament_id: tournamentId,
        round_no: 1,
        category_id: categoryId,
        round_date: roundDate,
        wave: "AM",
        start_type: "tee_time",
        start_time: "07:00",
        interval_minutes: 10,
        group_size: 4,
      })
      .select("id")
      .single();
    if (rErr || !rRow) {
      return {
        ok: false,
        categoryCreated,
        roundCreated: false,
        groupsCreated: 0,
        error: rErr?.message ?? "No pude crear round",
      };
    }
    roundId = String((rRow as { id: string }).id);
    roundCreated = true;
  }

  // 4) Generar pairing_groups vacíos — solo si todavía no hay grupos
  const { data: existingGroups } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", roundId)
    .limit(1);
  if (existingGroups && existingGroups.length > 0) {
    return { ok: true, categoryCreated, roundCreated, groupsCreated: 0 };
  }

  const slots = buildTeeSlots();
  const rows = slots.map((s, idx) => ({
    round_id: roundId!,
    group_no: idx + 1,
    tee_time: s.tee_time,
    starting_hole: s.hole,
    notes: s.label,
  }));

  const { error: insGErr } = await admin.from("pairing_groups").insert(rows);
  if (insGErr) {
    return {
      ok: false,
      categoryCreated,
      roundCreated,
      groupsCreated: 0,
      error: `No pude crear salidas: ${insGErr.message}`,
    };
  }

  return {
    ok: true,
    categoryCreated,
    roundCreated,
    groupsCreated: rows.length,
  };
}

interface TeeSlot {
  tee_time: string; // HH:MM
  hole: number; // 1 o 10
  label: string; // p.ej. "Mañana · Hoyo 1"
}

/** Genera las salidas: tanda 7-9 + tanda 12-14, ambos hoyos 1 y 10, c/10min. */
function buildTeeSlots(): TeeSlot[] {
  const slots: TeeSlot[] = [];

  // Inclusivo en el extremo final (m <= endMin) para incluir la última hora.
  function addBand(startHHMM: string, endHHMM: string, label: string) {
    const [sh, sm] = startHHMM.split(":").map(Number);
    const [eh, em] = endHHMM.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let m = startMin; m <= endMin; m += 10) {
      const t = formatHHMM(m);
      slots.push({ tee_time: t, hole: 1, label: `${label} · Hoyo 1` });
      slots.push({ tee_time: t, hole: 10, label: `${label} · Hoyo 10` });
    }
  }

  addBand("07:00", "09:10", "Mañana");
  addBand("11:40", "13:50", "Mediodía");
  addBand("16:00", "17:50", "Tarde");

  return slots;
}

function formatHHMM(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}
