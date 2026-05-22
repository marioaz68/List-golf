"use server";

import { applyConvocatoriaDraft } from "@/lib/convocatoria/applyDraft";
import {
  isMatchPlayConvocatoriaDraft,
  normalizeWorkflowStatus,
  parseDraftJson,
} from "@/lib/convocatoria/draftUtils";
import { extractDocxText } from "@/lib/convocatoria/extractDocxText";
import { parseConvocatoriaMatchPlayText } from "@/lib/convocatoria/parseConvocatoriaMatchPlay";
import { parseConvocatoriaText } from "@/lib/convocatoria/parseConvocatoria";
import { matchPlayMachote } from "@/lib/convocatoria/templates/matchPlayMachote";
import { ccqMatchPlayMixto } from "@/lib/convocatoria/templates/ccqMatchPlayMixto";
import { ccqTorneoAnualMachote } from "@/lib/convocatoria/templates/ccqTorneoAnualMachote";
import { applyMatchPlayDraft } from "@/lib/matchplay/applyMatchPlayDraft";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

async function upsertConvocatoriaRow({
  tournament_id,
  draft,
  status,
  file_name,
  extracted_text,
}: {
  tournament_id: string;
  draft: ReturnType<typeof parseDraftJson>;
  status: "editing" | "closed" | "applied";
  file_name?: string | null;
  extracted_text?: string | null;
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("tournament_convocatoria").upsert(
    {
      tournament_id,
      file_name: file_name ?? null,
      extracted_text: extracted_text ?? null,
      draft_json: draft,
      warnings: draft.warnings,
      status,
      updated_at: now,
      ...(status === "applied" ? { applied_at: now } : {}),
    },
    { onConflict: "tournament_id" }
  );

  if (error) {
    throw new Error(`No se pudo guardar la convocatoria: ${error.message}`);
  }
}

async function tournamentUsesMatchPlay(supabase: ReturnType<typeof createAdminClient>, tournament_id: string) {
  const { data } = await supabase
    .from("tournaments")
    .select("settings")
    .eq("id", tournament_id)
    .maybeSingle();
  return isMatchPlayFormat((data?.settings ?? {}) as TournamentSettings);
}

/** Carga la plantilla machote (stroke 68º o match play según formato del torneo). */
export async function loadConvocatoriaTemplate(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const supabase = createAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, settings")
    .eq("id", tournament_id)
    .maybeSingle();

  const matchPlay = isMatchPlayFormat(
    (tournament?.settings ?? {}) as TournamentSettings
  );

  const draft = matchPlay
    ? matchPlayMachote({
        title: tournament?.name ?? "Torneo Match Play",
      })
    : ccqTorneoAnualMachote({
        title: tournament?.name
          ? `${tournament.name} — Torneo Anual`
          : "Torneo Anual",
      });

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "editing",
    file_name: matchPlay
      ? "Plantilla: Match Play por parejas"
      : "Plantilla: 68º Torneo Anual CCQ",
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&template=1`);
}

/** Carga plantilla CCQ Match Play Parejas Mixto 2026. */
export async function loadCcqMixtoMatchPlayTemplate(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const supabase = createAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, settings")
    .eq("id", tournament_id)
    .maybeSingle();

  const settings = (tournament?.settings ?? {}) as TournamentSettings;
  if (!isMatchPlayFormat(settings)) {
    const next: TournamentSettings = {
      ...settings,
      format: {
        ...settings.format,
        format_type: "matchplay",
        round_count: 4,
        holes: 18,
      },
    };
    await supabase
      .from("tournaments")
      .update({ settings: next })
      .eq("id", tournament_id);
  }

  const draft = ccqMatchPlayMixto({
    title: tournament?.name ?? "Match Play Parejas Mixto",
  });

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "editing",
    file_name: "Plantilla: CCQ Match Play Parejas Mixto 2026",
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&template=1`);
}

export async function saveConvocatoriaDraft(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const draft = parseDraftJson(reqStr(formData, "draft_json"));

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("tournament_convocatoria")
    .select("status")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  const status = normalizeWorkflowStatus(row?.status);
  if (status === "applied") {
    throw new Error("La convocatoria ya fue aplicada al torneo.");
  }
  if (status === "closed") {
    throw new Error("La convocatoria está cerrada. Reábrela para editar.");
  }

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "editing",
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&saved=1`);
}

export async function closeConvocatoria(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const draft = parseDraftJson(reqStr(formData, "draft_json"));

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "closed",
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&closed=1`);
}

export async function reopenConvocatoria(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("tournament_convocatoria")
    .select("draft_json, status")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (!row?.draft_json) {
    throw new Error("No hay convocatoria guardada.");
  }
  if (normalizeWorkflowStatus(row.status) === "applied") {
    throw new Error("Ya se generaron parámetros; no se puede reabrir.");
  }

  await upsertConvocatoriaRow({
    tournament_id,
    draft: row.draft_json as ReturnType<typeof parseDraftJson>,
    status: "editing",
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&reopened=1`);
}

/** Importación opcional desde Word (reemplaza borrador en edición). */
export async function uploadConvocatoriaDocx(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const file = formData.get("convocatoria_file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona un archivo .docx");
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Solo se admite formato .docx");
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("tournament_convocatoria")
    .select("status")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (normalizeWorkflowStatus(row?.status) === "closed") {
    throw new Error("Cierra o reabre la convocatoria antes de importar otro Word.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted_text = await extractDocxText(buffer);
  const matchPlay = await tournamentUsesMatchPlay(supabase, tournament_id);
  const draft = matchPlay
    ? parseConvocatoriaMatchPlayText(extracted_text)
    : parseConvocatoriaText(extracted_text);

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "editing",
    file_name: file.name,
    extracted_text,
  });

  revalidatePath("/convocatoria");
  redirect(`/convocatoria?tournament_id=${tournament_id}&imported=1`);
}

/** Genera parámetros del torneo (solo con convocatoria cerrada). */
export async function applyConvocatoriaToTournament(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  const draft = parseDraftJson(reqStr(formData, "draft_json"));

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("tournament_convocatoria")
    .select("status")
    .eq("tournament_id", tournament_id)
    .maybeSingle();

  if (normalizeWorkflowStatus(row?.status) !== "closed") {
    throw new Error(
      "Cierra la convocatoria antes de generar los parámetros del torneo."
    );
  }

  const useMatchPlay =
    isMatchPlayConvocatoriaDraft(draft) ||
    (await tournamentUsesMatchPlay(supabase, tournament_id));

  const result = useMatchPlay
    ? await applyMatchPlayDraft({
        tournamentId: tournament_id,
        draft,
        replaceExisting: true,
      })
    : await applyConvocatoriaDraft({
        tournamentId: tournament_id,
        draft,
        replaceExisting: true,
      });

  await upsertConvocatoriaRow({
    tournament_id,
    draft,
    status: "applied",
  });

  revalidatePath("/convocatoria");
  revalidatePath("/categories");
  revalidatePath("/prize-rules");
  revalidatePath("/rounds");
  if (!useMatchPlay) {
    revalidatePath("/competition-rules");
    revalidatePath("/cut-rules");
  } else {
    revalidatePath("/matchplay");
  }

  redirect(
    `/convocatoria?tournament_id=${tournament_id}&applied=1&cats=${result.categories}&rounds=${result.rounds_created}${useMatchPlay ? "&matchplay=1" : ""}`
  );
}
