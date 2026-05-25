"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import {
  computeWhsHandicap,
  pickTeeForGender,
  type WhsTeeData,
} from "@/lib/handicap/whs";

function reqStr(fd: FormData, key: string): string {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optNum(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function ensureAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

function backTo(tournament_id: string, params: Record<string, string> = {}): never {
  const q = new URLSearchParams({ tournament_id, ...params });
  redirect(`/matchplay?${q.toString()}#handicaps`);
}

/**
 * Guarda slope / course rating / par por sexo y % de allowance para el match play
 * de este torneo. Después dispara recálculo de todos los CH/PH de inscritos
 * (respetando overrides manuales).
 */
export async function saveMatchplayWhsSettings(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();

  const allowance_pct = optNum(formData, "allowance_pct");
  if (allowance_pct == null || allowance_pct <= 0 || allowance_pct > 100) {
    backTo(tournament_id, {
      whs_status: "error",
      whs_message: "El % de allowance debe estar entre 1 y 100.",
    });
  }

  const patch = {
    handicap_allowance: "custom" as const,
    handicap_allowance_pct: allowance_pct,
    whs_slope_men: optNum(formData, "whs_slope_men"),
    whs_slope_women: optNum(formData, "whs_slope_women"),
    whs_course_rating_men: optNum(formData, "whs_course_rating_men"),
    whs_course_rating_women: optNum(formData, "whs_course_rating_women"),
    whs_par_men: optNum(formData, "whs_par_men"),
    whs_par_women: optNum(formData, "whs_par_women"),
  };

  const { data: existing } = await admin
    .from("tournament_matchplay_rules")
    .select("id")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("tournament_matchplay_rules")
      .update(patch)
      .eq("id", existing.id);
    if (error) {
      backTo(tournament_id, {
        whs_status: "error",
        whs_message: `Error guardando WHS: ${error.message}`,
      });
    }
  } else {
    const { error } = await admin
      .from("tournament_matchplay_rules")
      .insert({ tournament_id, ...patch });
    if (error) {
      backTo(tournament_id, {
        whs_status: "error",
        whs_message: `Error guardando WHS: ${error.message}`,
      });
    }
  }

  const recap = await recomputeMatchplayHandicapsInternal(tournament_id);

  revalidatePath("/matchplay");
  backTo(tournament_id, {
    whs_status: "ok",
    whs_message: `Configuración WHS guardada. Recalculados ${recap.updated} de ${recap.total} inscritos.`,
  });
}

/** Recalcula CH/PH para todos los inscritos del torneo. Respeta overrides. */
export async function recomputeMatchplayHandicaps(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const result = await recomputeMatchplayHandicapsInternal(tournament_id);

  revalidatePath("/matchplay");
  backTo(tournament_id, {
    whs_status: "ok",
    whs_message: `Recalculados ${result.updated} de ${result.total} inscritos. ${
      result.skipped_no_tee
    } sin salida válida${
      result.kept_override > 0 ? `, ${result.kept_override} con override` : ""
    }.`,
  });
}

type RecomputeResult = {
  total: number;
  updated: number;
  skipped_no_tee: number;
  kept_override: number;
};

async function recomputeMatchplayHandicapsInternal(
  tournament_id: string
): Promise<RecomputeResult> {
  const admin = createAdminClient();

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select(
      "handicap_allowance_pct, whs_slope_men, whs_slope_women, whs_course_rating_men, whs_course_rating_women, whs_par_men, whs_par_women"
    )
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!rules) {
    return { total: 0, updated: 0, skipped_no_tee: 0, kept_override: 0 };
  }

  const allowance_pct = Number(rules.handicap_allowance_pct ?? 100);

  const tee_men: Partial<WhsTeeData> | null = rules.whs_slope_men != null
    ? {
        slope: Number(rules.whs_slope_men),
        course_rating: Number(rules.whs_course_rating_men ?? 0),
        par: Number(rules.whs_par_men ?? 0),
      }
    : null;

  const tee_women: Partial<WhsTeeData> | null = rules.whs_slope_women != null
    ? {
        slope: Number(rules.whs_slope_women),
        course_rating: Number(rules.whs_course_rating_women ?? 0),
        par: Number(rules.whs_par_women ?? 0),
      }
    : null;

  const { data: entries } = await admin
    .from("tournament_entries")
    .select(
      "id, handicap_index, playing_handicap_override, players:players(gender, handicap_torneo, handicap_index)"
    )
    .eq("tournament_id", tournament_id)
    .neq("status", "cancelled");

  let updated = 0;
  let skipped_no_tee = 0;
  let kept_override = 0;
  const total = entries?.length ?? 0;

  for (const e of entries ?? []) {
    const player: any = Array.isArray((e as any).players)
      ? (e as any).players[0]
      : (e as any).players;
    const gender = (player?.gender ?? "X").toString().toUpperCase() as
      | "M"
      | "F"
      | "X";

    const hiFromEntry = (e as any).handicap_index;
    const hi = hiFromEntry != null
      ? Number(hiFromEntry)
      : Number(player?.handicap_torneo ?? player?.handicap_index ?? 0);

    const tee = pickTeeForGender({ gender, men: tee_men, women: tee_women });
    if (!tee) {
      skipped_no_tee++;
      continue;
    }

    const calc = computeWhsHandicap({
      hi,
      slope: tee.slope,
      course_rating: tee.course_rating,
      par: tee.par,
      allowance_pct,
    });

    const override = (e as any).playing_handicap_override;
    const finalPh = override != null ? Number(override) : calc.playing_handicap;
    if (override != null) kept_override++;

    const { error: upErr } = await admin
      .from("tournament_entries")
      .update({
        course_handicap: calc.course_handicap,
        playing_handicap: finalPh,
        handicap_calc_meta: calc.meta,
      })
      .eq("id", (e as any).id);

    if (!upErr) updated++;
  }

  return { total, updated, skipped_no_tee, kept_override };
}

export async function setEntryPlayingHandicapOverride(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const entry_id = reqStr(formData, "entry_id");
  const ph_raw = optNum(formData, "playing_handicap");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await ensureAccess(tournament_id);

  if (ph_raw == null) {
    backTo(tournament_id, {
      whs_status: "error",
      whs_message: "Falta el valor del PH manual.",
    });
  }

  const ph = Math.round(ph_raw!);
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await admin
    .from("tournament_entries")
    .update({
      playing_handicap: ph,
      playing_handicap_override: ph,
      playing_handicap_override_reason: reason,
      playing_handicap_override_at: new Date().toISOString(),
      playing_handicap_override_by: user?.id ?? null,
    })
    .eq("id", entry_id)
    .eq("tournament_id", tournament_id);

  if (error) {
    backTo(tournament_id, {
      whs_status: "error",
      whs_message: `Error en override: ${error.message}`,
    });
  }

  revalidatePath("/matchplay");
  backTo(tournament_id, {
    whs_status: "ok",
    whs_message: "Override manual aplicado.",
  });
}

export async function clearEntryPlayingHandicapOverride(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const entry_id = reqStr(formData, "entry_id");
  await ensureAccess(tournament_id);

  const admin = createAdminClient();

  const { error } = await admin
    .from("tournament_entries")
    .update({
      playing_handicap_override: null,
      playing_handicap_override_reason: null,
      playing_handicap_override_at: null,
      playing_handicap_override_by: null,
    })
    .eq("id", entry_id)
    .eq("tournament_id", tournament_id);

  if (error) {
    backTo(tournament_id, {
      whs_status: "error",
      whs_message: `Error limpiando override: ${error.message}`,
    });
  }

  await recomputeMatchplayHandicapsInternal(tournament_id);

  revalidatePath("/matchplay");
  backTo(tournament_id, {
    whs_status: "ok",
    whs_message: "Override eliminado; PH recalculado automáticamente.",
  });
}
