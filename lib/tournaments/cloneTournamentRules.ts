/**
 * Clona la configuración operativa de un torneo a otro (sin inscritos,
 * resultados, cuadros ni GPS).
 *
 * Incluye: settings (merge), categorías, convocatoria, tees asignados,
 * hoyos del torneo, reglas de categoría/tees, competencia/corte/premios,
 * matchplay_rules y perfiles de desempate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyTournamentTemplate,
  type TemplateRole,
} from "@/lib/tournaments/templatePresets";

export type CloneRulesResult = {
  ok: boolean;
  messages: string[];
  categoryMap: Map<string, string>;
};

function softError(messages: string[], label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  messages.push(`${label}: ${msg}`);
}

async function copyCategories(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  messages: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data: sourceCats, error } = await admin
    .from("categories")
    .select(
      `
      id, code, name, gender, min_age, max_age, handicap_min, handicap_max,
      sort_order, is_active, category_group, handicap_percent_override,
      allow_multiple_prizes_per_player, default_prize_count
    `
    )
    .eq("tournament_id", sourceId)
    .order("sort_order", { ascending: true });

  if (error) {
    softError(messages, "categorías", error);
    return map;
  }
  if (!sourceCats?.length) return map;

  // Borrar categorías basura del target si hubiera (recién creado suele estar limpio).
  await admin.from("categories").delete().eq("tournament_id", targetId);

  for (const c of sourceCats) {
    const { data: inserted, error: insErr } = await admin
      .from("categories")
      .insert({
        tournament_id: targetId,
        code: c.code ?? null,
        name: c.name ?? null,
        gender: c.gender ?? null,
        min_age: c.min_age ?? null,
        max_age: c.max_age ?? null,
        handicap_min: c.handicap_min ?? null,
        handicap_max: c.handicap_max ?? null,
        sort_order: c.sort_order ?? null,
        is_active: c.is_active ?? true,
        category_group: c.category_group ?? "main",
        handicap_percent_override: c.handicap_percent_override ?? null,
        allow_multiple_prizes_per_player:
          c.allow_multiple_prizes_per_player ?? false,
        default_prize_count: c.default_prize_count ?? null,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      softError(messages, `categoría ${c.code ?? c.name}`, insErr);
      continue;
    }
    map.set(String(c.id), String(inserted.id));
  }
  messages.push(`Categorías: ${map.size}`);
  return map;
}

async function copyConvocatoria(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  targetName: string,
  messages: string[]
) {
  const { data: sourceConv, error } = await admin
    .from("tournament_convocatoria")
    .select("draft_json, warnings, file_name")
    .eq("tournament_id", sourceId)
    .maybeSingle();
  if (error) {
    softError(messages, "convocatoria", error);
    return;
  }
  if (!sourceConv?.draft_json) {
    messages.push("Convocatoria: sin draft en origen");
    return;
  }

  const draft = sourceConv.draft_json as Record<string, unknown>;
  const meta =
    draft && typeof draft.meta === "object" && draft.meta
      ? (draft.meta as Record<string, unknown>)
      : {};

  const clonedDraft = {
    ...draft,
    source: "template",
    meta: { ...meta, title: targetName },
  };

  const now = new Date().toISOString();
  const { error: upErr } = await admin.from("tournament_convocatoria").upsert(
    {
      tournament_id: targetId,
      file_name: sourceConv.file_name
        ? `Clonado: ${sourceConv.file_name}`
        : "Clonado de torneo plantilla",
      extracted_text: null,
      draft_json: clonedDraft,
      warnings: sourceConv.warnings ?? null,
      status: "editing",
      updated_at: now,
    },
    { onConflict: "tournament_id" }
  );
  if (upErr) softError(messages, "convocatoria upsert", upErr);
  else messages.push("Convocatoria: copiada (estado editing — revisar y aplicar)");
}

function remapCategoryId(
  map: Map<string, string>,
  oldId: string | null | undefined
): string | null {
  if (!oldId) return null;
  return map.get(String(oldId)) ?? null;
}

async function copyRowsWithCategoryRemap(
  admin: SupabaseClient,
  table: string,
  sourceId: string,
  targetId: string,
  categoryMap: Map<string, string>,
  messages: string[],
  options?: {
    categoryField?: string;
    extraRemap?: (
      row: Record<string, unknown>
    ) => Record<string, unknown> | null;
  }
) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq("tournament_id", sourceId);
  if (error) {
    softError(messages, table, error);
    return;
  }
  if (!data?.length) {
    messages.push(`${table}: 0`);
    return;
  }

  const catField = options?.categoryField ?? "category_id";
  const rows: Record<string, unknown>[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = raw;
    const next: Record<string, unknown> = {
      ...rest,
      tournament_id: targetId,
    };
    if (catField in next) {
      const mapped = remapCategoryId(categoryMap, String(next[catField] ?? ""));
      if (!mapped) continue;
      next[catField] = mapped;
    }
    if (options?.extraRemap) {
      const remapped = options.extraRemap(next);
      if (!remapped) continue;
      rows.push(remapped);
    } else {
      rows.push(next);
    }
  }

  if (!rows.length) {
    messages.push(`${table}: 0 (sin mapeo de categorías)`);
    return;
  }

  await admin.from(table).delete().eq("tournament_id", targetId);
  const { error: insErr } = await admin.from(table).insert(rows);
  if (insErr) softError(messages, `${table} insert`, insErr);
  else messages.push(`${table}: ${rows.length}`);
}

async function copyMatchplayRules(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  messages: string[]
) {
  const { data, error } = await admin
    .from("tournament_matchplay_rules")
    .select("*")
    .eq("tournament_id", sourceId)
    .maybeSingle();
  if (error) {
    softError(messages, "matchplay_rules", error);
    return;
  }
  if (!data) {
    messages.push("matchplay_rules: sin fila en origen");
    return;
  }
  const row = data as Record<string, unknown>;
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
  const { error: upErr } = await admin.from("tournament_matchplay_rules").upsert(
    {
      ...rest,
      tournament_id: targetId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id" }
  );
  if (upErr) softError(messages, "matchplay_rules upsert", upErr);
  else messages.push("matchplay_rules: copiadas");
}

async function copyTournamentHoles(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  messages: string[]
) {
  const { data, error } = await admin
    .from("tournament_holes")
    .select("*")
    .eq("tournament_id", sourceId);
  if (error) {
    softError(messages, "tournament_holes", error);
    return;
  }
  if (!data?.length) {
    messages.push("tournament_holes: 0");
    return;
  }
  const rows = (data as Record<string, unknown>[]).map((raw) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = raw;
    return { ...rest, tournament_id: targetId };
  });
  await admin.from("tournament_holes").delete().eq("tournament_id", targetId);
  const { error: insErr } = await admin.from("tournament_holes").insert(rows);
  if (insErr) softError(messages, "tournament_holes insert", insErr);
  else messages.push(`tournament_holes: ${rows.length}`);
}

async function copyTournamentTeeSets(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  messages: string[]
) {
  const { data, error } = await admin
    .from("tournament_tee_sets")
    .select("tee_set_catalog_id, sort_order")
    .eq("tournament_id", sourceId);
  if (error) {
    softError(messages, "tournament_tee_sets", error);
    return;
  }
  if (!data?.length) {
    messages.push("tournament_tee_sets: 0");
    return;
  }
  await admin.from("tournament_tee_sets").delete().eq("tournament_id", targetId);
  const rows = data.map((r) => ({
    tournament_id: targetId,
    tee_set_catalog_id: r.tee_set_catalog_id,
    sort_order: r.sort_order ?? 1,
  }));
  const { error: insErr } = await admin.from("tournament_tee_sets").insert(rows);
  if (insErr) softError(messages, "tournament_tee_sets insert", insErr);
  else messages.push(`tournament_tee_sets: ${rows.length}`);
}

async function copyTieBreakProfiles(
  admin: SupabaseClient,
  sourceId: string,
  targetId: string,
  messages: string[]
) {
  const { data: profiles, error } = await admin
    .from("tie_break_profiles")
    .select("*")
    .eq("tournament_id", sourceId);
  if (error) {
    softError(messages, "tie_break_profiles", error);
    return;
  }
  if (!profiles?.length) {
    messages.push("tie_break_profiles: 0");
    return;
  }

  const profileMap = new Map<string, string>();
  await admin.from("tie_break_profiles").delete().eq("tournament_id", targetId);

  for (const p of profiles as Record<string, unknown>[]) {
    const oldId = String(p.id);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
    const { data: ins, error: insErr } = await admin
      .from("tie_break_profiles")
      .insert({ ...rest, tournament_id: targetId })
      .select("id")
      .single();
    if (insErr || !ins?.id) {
      softError(messages, "tie_break_profiles row", insErr);
      continue;
    }
    profileMap.set(oldId, String(ins.id));
  }

  const oldProfileIds = Array.from(profileMap.keys());
  if (oldProfileIds.length === 0) return;

  const { data: steps, error: stepsErr } = await admin
    .from("tie_break_steps")
    .select("*")
    .in("profile_id", oldProfileIds);
  if (stepsErr) {
    softError(messages, "tie_break_steps", stepsErr);
    return;
  }
  if (steps?.length) {
    const stepRows = (steps as Record<string, unknown>[])
      .map((s) => {
        const newPid = profileMap.get(String(s.profile_id));
        if (!newPid) return null;
        const { id: _id, ...rest } = s;
        return { ...rest, profile_id: newPid };
      })
      .filter(Boolean);
    if (stepRows.length) {
      const { error: si } = await admin.from("tie_break_steps").insert(stepRows);
      if (si) softError(messages, "tie_break_steps insert", si);
    }
  }
  messages.push(`tie_break_profiles: ${profileMap.size}`);
}

/**
 * Deep-clone de reglas. No falla la creación del torneo si alguna tabla
 * parcial falla: reporta en messages.
 */
export async function cloneTournamentRules(params: {
  admin: SupabaseClient;
  sourceTournamentId: string;
  targetTournamentId: string;
  targetName: string;
}): Promise<CloneRulesResult> {
  const { admin, sourceTournamentId, targetTournamentId, targetName } = params;
  const messages: string[] = [];

  const { data: source, error: srcErr } = await admin
    .from("tournaments")
    .select("id, name, settings")
    .eq("id", sourceTournamentId)
    .maybeSingle();

  if (srcErr || !source) {
    return {
      ok: false,
      messages: [`Origen inválido: ${srcErr?.message ?? "no encontrado"}`],
      categoryMap: new Map(),
    };
  }

  // Settings: heredar reglas del origen (incl. matchplay_variant / template_role).
  const sourceSettings =
    source.settings && typeof source.settings === "object"
      ? (source.settings as Record<string, unknown>)
      : {};
  const role =
    classifyTournamentTemplate({
      id: source.id,
      name: source.name,
      settings: source.settings,
    }) ?? null;

  const nextSettings: Record<string, unknown> = {
    ...sourceSettings,
  };
  if (role) nextSettings.template_role = role;

  const { error: setErr } = await admin
    .from("tournaments")
    .update({ settings: nextSettings })
    .eq("id", targetTournamentId);
  if (setErr) softError(messages, "settings", setErr);
  else messages.push("settings: copiados del origen");

  // Marcar origen como plantilla de su rol (refuerzo para la próxima vez).
  if (role && templateRoleNotSet(sourceSettings)) {
    await admin
      .from("tournaments")
      .update({
        settings: { ...sourceSettings, template_role: role },
      })
      .eq("id", sourceTournamentId);
  }

  const categoryMap = await copyCategories(
    admin,
    sourceTournamentId,
    targetTournamentId,
    messages
  );

  await copyConvocatoria(
    admin,
    sourceTournamentId,
    targetTournamentId,
    targetName,
    messages
  );

  await copyTournamentHoles(
    admin,
    sourceTournamentId,
    targetTournamentId,
    messages
  );
  await copyTournamentTeeSets(
    admin,
    sourceTournamentId,
    targetTournamentId,
    messages
  );

  await copyRowsWithCategoryRemap(
    admin,
    "category_tee_rules",
    sourceTournamentId,
    targetTournamentId,
    categoryMap,
    messages
  );

  await copyRowsWithCategoryRemap(
    admin,
    "category_competition_rules",
    sourceTournamentId,
    targetTournamentId,
    categoryMap,
    messages
  );

  await copyRowsWithCategoryRemap(
    admin,
    "category_prize_rules",
    sourceTournamentId,
    targetTournamentId,
    categoryMap,
    messages,
    {
      extraRemap: (row) => {
        if (row.scope_type === "category" && row.scope_value) {
          const mapped = categoryMap.get(String(row.scope_value));
          if (!mapped) return null;
          return { ...row, scope_value: mapped };
        }
        return row;
      },
    }
  );

  // Desempates primero (por si cortes apuntan a ellos con id — re-map en cuts).
  await copyTieBreakProfiles(
    admin,
    sourceTournamentId,
    targetTournamentId,
    messages
  );

  // Cortes: remap category scopes; leave profile ids if table allows orphan
  // (often category scope_value is category uuid).
  await copyRowsWithCategoryRemap(
    admin,
    "round_advancement_rules",
    sourceTournamentId,
    targetTournamentId,
    categoryMap,
    messages,
    {
      categoryField: "__none__", // no category_id column
      extraRemap: (row) => {
        if (row.scope_type === "category" && row.scope_value) {
          const mapped = categoryMap.get(String(row.scope_value));
          if (mapped) return { ...row, scope_value: mapped };
        }
        // tie_break_profile_id: no map (profiles recreated with new ids). null out.
        return { ...row, tie_break_profile_id: null };
      },
    }
  );

  await copyMatchplayRules(
    admin,
    sourceTournamentId,
    targetTournamentId,
    messages
  );

  // No copiar rounds llenas de salida: el usuario armará salidas del día.
  // Opcional: copiar solo esqueleto de rondas (round_no + date null) —
  // omitimos para no arrastrar pairing groups.

  return { ok: true, messages, categoryMap };
}

function templateRoleNotSet(settings: Record<string, unknown>): boolean {
  const r = settings.template_role;
  return r !== "anual" && r !== "calcuta_mixto" && r !== "ryder";
}

export type { TemplateRole };
