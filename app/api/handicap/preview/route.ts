import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { resolveTournamentEntryHandicap } from "@/lib/handicap/resolveTournamentEntryHandicap";
import { checkTournamentAccess } from "@/lib/auth/requireTournamentAccess";

type Body = {
  tournament_id?: string;
  player_id?: string;
  hi?: number | string | null;
  gender?: "M" | "F" | "X" | null;
  birth_year?: number | null;
  category_id?: string | null;
  entry_id?: string | null;
};

/**
 * POST /api/handicap/preview
 *
 * Devuelve un cálculo "en vivo" de CH/PH para un torneo dado con un HI
 * propuesto. Se usa en el modal y en el alta/edición de jugadores para
 * mostrar HC y PH como valores informativos.
 *
 * No persiste nada; sólo es una vista previa.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body inválido" },
      { status: 400 }
    );
  }

  const tournamentId = String(body.tournament_id ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, message: "Falta tournament_id" },
      { status: 400 }
    );
  }

  const access = await checkTournamentAccess({ tournamentId });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, message: "Sin acceso al torneo" },
      { status: 403 }
    );
  }

  const hi =
    typeof body.hi === "string"
      ? Number(body.hi.replace(",", "."))
      : typeof body.hi === "number"
        ? body.hi
        : null;
  if (hi == null || !Number.isFinite(hi)) {
    return NextResponse.json(
      { ok: false, message: "HI inválido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let categoryId = body.category_id ?? null;
  let storedOverride: number | null = null;
  let gender: "M" | "F" | "X" =
    body.gender === "F" ? "F" : body.gender === "X" ? "X" : "M";
  let birthYear: number | null =
    typeof body.birth_year === "number" ? body.birth_year : null;

  if (body.entry_id) {
    const { data: entry } = await admin
      .from("tournament_entries")
      .select(
        "id, player_id, category_id, playing_handicap_override, player:players(gender, birth_year)"
      )
      .eq("id", body.entry_id)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (entry) {
      categoryId = categoryId ?? entry.category_id ?? null;
      storedOverride = entry.playing_handicap_override ?? null;
      const playerRow = Array.isArray(entry.player) ? entry.player[0] : entry.player;
      const g = (playerRow as { gender?: string | null } | null)?.gender;
      if (g) {
        gender = (String(g).toUpperCase() as "M" | "F" | "X");
      }
      const by =
        (playerRow as { birth_year?: number | null } | null)?.birth_year ?? null;
      if (by != null) birthYear = by;
    }
  } else if (body.player_id) {
    const { data: player } = await admin
      .from("players")
      .select("gender, birth_year")
      .eq("id", body.player_id)
      .maybeSingle();
    if (player) {
      const g = (player as { gender?: string | null }).gender;
      if (g) gender = String(g).toUpperCase() as "M" | "F" | "X";
      const by = (player as { birth_year?: number | null }).birth_year ?? null;
      if (by != null) birthYear = by;
    }
  }

  const ctx = await loadTournamentHandicapContext(admin, tournamentId);

  const calc = resolveTournamentEntryHandicap(
    {
      id: body.entry_id ?? "preview",
      player_id: body.player_id ?? "preview",
      category_id: categoryId,
      handicap_index: hi,
      playing_handicap_override: storedOverride,
      player: {
        gender,
        birth_year: birthYear,
        handicap_index: hi,
      },
    },
    ctx
  );

  if (!calc) {
    return NextResponse.json({
      ok: true,
      course_handicap: null,
      playing_handicap: null,
      allowance_pct:
        categoryId != null
          ? ctx.allowancePctByCategory.get(categoryId) ??
            ctx.matchplayFallback?.allowance_pct ??
            null
          : ctx.matchplayFallback?.allowance_pct ?? null,
      hi_cap_applied: null,
      hi_cap_source: null,
    });
  }

  return NextResponse.json({
    ok: true,
    course_handicap: calc.course_handicap,
    playing_handicap: calc.playing_handicap,
    allowance_pct: calc.meta?.allowance_pct ?? null,
    hi_cap_applied: calc.meta?.hi_cap_applied ?? null,
    hi_cap_source: calc.meta?.hi_cap_source ?? null,
  });
}
