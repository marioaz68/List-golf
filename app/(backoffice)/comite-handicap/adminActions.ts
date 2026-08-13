"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireGhinCommitteeAccess } from "@/lib/handicap-committee/requireGhinAccess";
import {
  dryRunGhinRounds,
  postLoadSanityCheck,
  toInsertRow,
} from "@/lib/handicap-committee/ghinImportDryRun";
import { parseHoleByHoleXlsx } from "@/lib/handicap-committee/parseHoleByHoleXlsx";
import {
  applySuggestCandidates,
  DEFAULT_SUGGEST_THRESHOLDS,
  type SuggestThresholds,
  type CommitteeSelectionRow,
} from "@/lib/handicap-committee/loadSelectionRows";

export type BulkFlagItem = {
  entryId: string;
  flagged: boolean;
  reason: string;
};

export async function saveCommitteeFlagsBulk(params: {
  tournamentId: string;
  items: BulkFlagItem[];
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const { userId } = await requireGhinCommitteeAccess();
  const tournamentId = params.tournamentId?.trim();
  if (!tournamentId) return { ok: false, error: "Falta tournament_id" };
  if (!Array.isArray(params.items) || params.items.length === 0) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  const now = new Date().toISOString();
  let updated = 0;

  // Tras validar fn_user_can_read_ghin: escritura con service role
  // (mismo patrón que toggleEntryCommitteeFlag — RLS de entries no
  // siempre permite update al rol comité).
  const admin = createAdminClient();

  for (const item of params.items) {
    const flag = Boolean(item.flagged);
    const { data, error } = await admin
      .from("tournament_entries")
      .update({
        flagged_for_committee: flag,
        flagged_committee_reason: flag
          ? item.reason?.trim() || null
          : null,
        flagged_committee_at: flag ? now : null,
        flagged_committee_by: flag ? userId : null,
      })
      .eq("id", item.entryId)
      .eq("tournament_id", tournamentId)
      .select("id");

    if (error) {
      return { ok: false, error: error.message };
    }
    if (data?.length) updated += data.length;
  }

  revalidatePath("/comite-handicap");
  revalidatePath("/comite-handicap/seleccion");
  revalidatePath("/entries");
  return { ok: true, updated };
}

export async function suggestCommitteeCandidatesAction(params: {
  rows: CommitteeSelectionRow[];
  thresholds?: Partial<SuggestThresholds>;
}): Promise<
  | { ok: true; rows: CommitteeSelectionRow[] }
  | { ok: false; error: string }
> {
  const { supabase } = await requireGhinCommitteeAccess();
  try {
    const thresholds = {
      ...DEFAULT_SUGGEST_THRESHOLDS,
      ...(params.thresholds ?? {}),
    };
    const rows = await applySuggestCandidates(
      supabase,
      params.rows,
      thresholds
    );
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al sugerir",
    };
  }
}

export type GhinDryRunActionResult =
  | {
      ok: true;
      logId: string;
      sourceFile: string;
      gender: "M" | "F";
      warnings: string[];
      exact: number;
      neu: number;
      dateConflict: number;
      ambiguousDates: number;
      dateMin: string | null;
      dateMax: string | null;
      sampleNew: Array<{
        ghin_number: string;
        golfer_name: string;
        date_played: string;
        tee_name: string;
        total_score: number;
      }>;
      sampleDateConflict: Array<{
        ghin_number: string;
        golfer_name: string;
        date_played: string;
        existingDate?: string;
        tee_name: string;
        total_score: number;
      }>;
      sanity: ReturnType<typeof postLoadSanityCheck>;
    }
  | { ok: false; error: string };

export async function dryRunGhinHoleByHoleUpload(
  formData: FormData
): Promise<GhinDryRunActionResult> {
  const { supabase, userId } = await requireGhinCommitteeAccess();

  const file = formData.get("file");
  const genderRaw = String(formData.get("gender") ?? "M").toUpperCase();
  const gender = genderRaw === "F" ? "F" : "M";
  const exportCutoff =
    String(formData.get("export_cutoff") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return { ok: false, error: "Selecciona un archivo .xlsx" };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Solo se aceptan archivos .xlsx" };
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseHoleByHoleXlsx(buffer, gender);
    if (!parsed.rows.length) {
      return {
        ok: false,
        error:
          parsed.warnings[0] ??
          "No se extrajeron filas del archivo. Revisa el formato Hole by Hole.",
      };
    }

    const report = await dryRunGhinRounds(supabase, parsed.rows);
    const sanity = postLoadSanityCheck(parsed.rows, exportCutoff);

    // Log dry_run con service role (escritura)
    const admin = createAdminClient();
    const { data: logRow, error: logErr } = await admin
      .from("ghin_import_log")
      .insert({
        source_file: file.name,
        gender,
        uploaded_by: userId,
        rows_in_file: parsed.rows.length,
        rows_inserted: 0,
        rows_skipped: report.exact,
        rows_date_conflict: report.dateConflict,
        date_min: report.dateMin,
        date_max: report.dateMax,
        status: "dry_run",
        notes: [...parsed.warnings, ...sanity.notes].join(" · ") || null,
        report_json: {
          exact: report.exact,
          neu: report.neu,
          dateConflict: report.dateConflict,
          ambiguousDates: report.ambiguousDates,
          sanity,
          exportCutoff,
        },
      })
      .select("id")
      .single();

    if (logErr) {
      return { ok: false, error: `Log dry-run: ${logErr.message}` };
    }

    return {
      ok: true,
      logId: String(logRow.id),
      sourceFile: file.name,
      gender,
      warnings: parsed.warnings,
      exact: report.exact,
      neu: report.neu,
      dateConflict: report.dateConflict,
      ambiguousDates: report.ambiguousDates,
      dateMin: report.dateMin,
      dateMax: report.dateMax,
      sampleNew: report.sampleNew.map((r) => ({
        ghin_number: r.ghin_number,
        golfer_name: r.golfer_name,
        date_played: r.date_played,
        tee_name: r.tee_name,
        total_score: r.total_score,
      })),
      sampleDateConflict: report.sampleDateConflict.map((r) => ({
        ghin_number: r.ghin_number,
        golfer_name: r.golfer_name,
        date_played: r.date_played,
        existingDate: r.existingDate,
        tee_name: r.tee_name,
        total_score: r.total_score,
      })),
      sanity,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error en dry-run",
    };
  }
}

export async function applyGhinHoleByHoleUpload(
  formData: FormData
): Promise<
  | { ok: true; inserted: number; skipped: number; dateConflict: number; logId: string }
  | { ok: false; error: string }
> {
  const { userId } = await requireGhinCommitteeAccess();

  const file = formData.get("file");
  const genderRaw = String(formData.get("gender") ?? "M").toUpperCase();
  const gender = genderRaw === "F" ? "F" : "M";
  const dryRunLogId = String(formData.get("dry_run_log_id") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "") === "true";

  if (!confirm) {
    return { ok: false, error: "Debes confirmar el reporte de dry-run antes de insertar." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Vuelve a seleccionar el archivo .xlsx" };
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseHoleByHoleXlsx(buffer, gender);
    const admin = createAdminClient();
    const report = await dryRunGhinRounds(admin, parsed.rows);
    const toInsert = report.rows.filter((r) => r.classification === "new");

    let inserted = 0;
    const batchSize = 200;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const slice = toInsert
        .slice(i, i + batchSize)
        .map((r) => toInsertRow(r, file.name));
      const { error, count } = await admin
        .from("ghin_rounds")
        .insert(slice, { count: "exact" });
      if (error) {
        await admin.from("ghin_import_log").insert({
          source_file: file.name,
          gender,
          uploaded_by: userId,
          rows_in_file: parsed.rows.length,
          rows_inserted: inserted,
          rows_skipped: report.exact,
          rows_date_conflict: report.dateConflict,
          date_min: report.dateMin,
          date_max: report.dateMax,
          status: "error",
          notes: error.message,
        });
        return { ok: false, error: error.message };
      }
      inserted += count ?? slice.length;
    }

    const { data: logRow, error: logErr } = await admin
      .from("ghin_import_log")
      .insert({
        source_file: file.name,
        gender,
        uploaded_by: userId,
        rows_in_file: parsed.rows.length,
        rows_inserted: inserted,
        rows_skipped: report.exact,
        rows_date_conflict: report.dateConflict,
        date_min: report.dateMin,
        date_max: report.dateMax,
        status: "applied",
        notes: dryRunLogId
          ? `Aplicado tras dry-run ${dryRunLogId}`
          : "Aplicado tras confirmación",
        report_json: {
          exact: report.exact,
          neu: report.neu,
          dateConflict: report.dateConflict,
        },
      })
      .select("id")
      .single();

    if (logErr) {
      return {
        ok: false,
        error: `Insertó ${inserted} filas pero falló el log: ${logErr.message}`,
      };
    }

    if (dryRunLogId) {
      await admin
        .from("ghin_import_log")
        .update({ status: "applied", notes: `Confirmado → ${logRow.id}` })
        .eq("id", dryRunLogId)
        .eq("status", "dry_run");
    }

    revalidatePath("/comite-handicap/ghin-datos");
    return {
      ok: true,
      inserted,
      skipped: report.exact,
      dateConflict: report.dateConflict,
      logId: String(logRow.id),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al aplicar carga",
    };
  }
}
