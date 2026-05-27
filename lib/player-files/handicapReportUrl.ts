import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const BUCKET = "player-files";
const SIGNED_URL_TTL_SEC = 3600;

/** URL firmada del último reporte GHIN del jugador (respeta RLS del usuario). */
export async function getPlayerHandicapReportSignedUrl(
  playerId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: fileRow, error } = await supabase
    .from("player_files")
    .select("id, file_path, mime_type")
    .eq("player_id", playerId)
    .eq("kind", "handicap_report")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !fileRow?.file_path) {
    return { ok: false, error: "No hay archivo de handicap para este jugador" };
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(fileRow.file_path, SIGNED_URL_TTL_SEC, {
      download: false,
    });

  if (signErr || !signed?.signedUrl) {
    return {
      ok: false,
      error: signErr?.message ?? "No se pudo abrir el archivo",
    };
  }

  return { ok: true, url: signed.signedUrl };
}
