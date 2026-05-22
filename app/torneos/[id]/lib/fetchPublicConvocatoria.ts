import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { createClient as createServerClient } from "@/utils/supabase/server";
import {
  buildPublicConvocatoriaSections,
  isConvocatoriaPublicVisible,
  type PublicConvocatoriaRefLabels,
  type PublicConvocatoriaSection,
} from "@/lib/convocatoria/formatPublicConvocatoria";
import type { ConvocatoriaDraft } from "@/lib/convocatoria/types";
import { normalizeConvocatoriaDraft } from "@/lib/convocatoria/draftUtils";

export type PublicConvocatoriaPayload = {
  visible: boolean;
  sections: PublicConvocatoriaSection[];
};

/**
 * Lee la convocatoria pública del torneo.
 *
 * Primero intenta con el cliente server normal (cookies de sesión / anon).
 * Si falla por RLS u otra razón, prueba con el cliente admin como respaldo.
 * Así no depende de SUPABASE_SERVICE_ROLE_KEY estar configurada.
 */
export async function fetchPublicConvocatoria(
  tournamentId: string,
  refLabels: PublicConvocatoriaRefLabels
): Promise<PublicConvocatoriaPayload> {
  const empty: PublicConvocatoriaPayload = { visible: false, sections: [] };

  type Row = {
    draft_json: ConvocatoriaDraft | null;
    extracted_text: string | null;
    status: string | null;
  };

  async function readRow(): Promise<Row | null> {
    try {
      const supabase = await createServerClient();
      const { data, error } = await supabase
        .from("tournament_convocatoria")
        .select("draft_json, extracted_text, status")
        .eq("tournament_id", tournamentId)
        .maybeSingle();
      if (!error && data) return data as Row;
      if (error) {
        console.warn(
          "[public convocatoria] fallback admin tras error de cliente público:",
          error.message
        );
      }
    } catch (err) {
      console.warn(
        "[public convocatoria] cliente público falló, intentando admin:",
        err
      );
    }

    const admin = tryCreateAdminClient();
    if (!admin) return null;
    const { data, error } = await admin
      .from("tournament_convocatoria")
      .select("draft_json, extracted_text, status")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (error) {
      console.error(
        "[public convocatoria] admin client error:",
        error.message
      );
      return null;
    }
    return (data as Row) ?? null;
  }

  try {
    const row = await readRow();
    if (!row) return empty;

    if (!isConvocatoriaPublicVisible(row.status)) return empty;

    const draft = normalizeConvocatoriaDraft(row.draft_json);
    const sections = buildPublicConvocatoriaSections(draft, refLabels, {
      extractedText: row.extracted_text,
    });

    if (sections.length === 0) return empty;

    return { visible: true, sections };
  } catch (err) {
    console.error("[public convocatoria] fallo inesperado:", err);
    return empty;
  }
}
