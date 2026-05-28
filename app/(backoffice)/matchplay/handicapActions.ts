"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { recomputeTournamentHandicaps } from "@/lib/handicap/recomputeTournamentHandicaps";

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
  return recomputeTournamentHandicaps(admin, tournament_id);
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
