import { createAdminClient } from "@/utils/supabase/admin";
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

export async function fetchPublicConvocatoria(
  tournamentId: string,
  refLabels: PublicConvocatoriaRefLabels
): Promise<PublicConvocatoriaPayload> {
  const empty: PublicConvocatoriaPayload = { visible: false, sections: [] };

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tournament_convocatoria")
      .select("draft_json, extracted_text, status")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (error || !data) return empty;

    if (!isConvocatoriaPublicVisible(data.status)) return empty;

    const draft = normalizeConvocatoriaDraft(
      data.draft_json as ConvocatoriaDraft
    );
    const sections = buildPublicConvocatoriaSections(draft, refLabels, {
      extractedText: data.extracted_text,
    });

    if (sections.length === 0) return empty;

    return { visible: true, sections };
  } catch {
    return empty;
  }
}
