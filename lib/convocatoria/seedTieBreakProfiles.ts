import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CCQ_TIE_BREAK_PROFILES,
  CCQ_TIE_BREAK_STEPS,
  type CcqTieBreakProfileKey,
} from "./ccqTieBreakProfiles";

/** Crea o actualiza perfiles de desempate CCQ para el torneo. */
export async function seedCcqTieBreakProfiles(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<Record<CcqTieBreakProfileKey, string>> {
  const names = CCQ_TIE_BREAK_PROFILES.map((p) => p.name);

  const { data: existing, error: listErr } = await supabase
    .from("tie_break_profiles")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .in("name", names);

  if (listErr) {
    throw new Error(`Perfiles de desempate: ${listErr.message}`);
  }

  const byName = new Map(
    (existing ?? []).map((r) => [String(r.name), String(r.id)])
  );

  const idByKey = {} as Record<CcqTieBreakProfileKey, string>;

  for (const profile of CCQ_TIE_BREAK_PROFILES) {
    let profileId = byName.get(profile.name);

    if (!profileId) {
      const { data: inserted, error: insErr } = await supabase
        .from("tie_break_profiles")
        .insert({
          tournament_id: tournamentId,
          name: profile.name,
          applies_to: profile.applies_to,
          is_active: true,
          sort_order: profile.sort_order,
        })
        .select("id")
        .single();

      if (insErr || !inserted?.id) {
        throw new Error(
          `No se pudo crear perfil «${profile.name}»: ${insErr?.message ?? "sin id"}`
        );
      }
      profileId = String(inserted.id);
    } else {
      await supabase
        .from("tie_break_profiles")
        .update({
          applies_to: profile.applies_to,
          is_active: true,
          sort_order: profile.sort_order,
        })
        .eq("id", profileId);
    }

    idByKey[profile.key] = profileId;

    await supabase
      .from("tie_break_steps")
      .delete()
      .eq("tie_break_profile_id", profileId);

    const steps = CCQ_TIE_BREAK_STEPS.filter(
      (s) => s.tie_break_profile_key === profile.key
    ).map((s) => ({
      tie_break_profile_id: profileId,
      step_no: s.step_no,
      method: s.method,
      basis: s.basis,
      round_scope: s.round_scope,
      hole_scope: s.hole_scope,
      handicap_mode: s.handicap_mode,
      direction: s.direction,
      value_text: s.value_text,
    }));

    if (steps.length) {
      const { error: stepsErr } = await supabase
        .from("tie_break_steps")
        .insert(steps);
      if (stepsErr) {
        throw new Error(
          `Pasos de desempate «${profile.name}»: ${stepsErr.message}`
        );
      }
    }
  }

  return idByKey;
}
