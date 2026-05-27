import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { mimeFromFilename } from "@/lib/player-files/ghinFromFilename";

const BUCKET = "player-files";
const SIGNED_URL_TTL_SEC = 3600;

type FileRow = {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
};

async function fetchAuthorizedFileRow(
  playerId: string
): Promise<{ ok: true; row: FileRow } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: fileRow, error } = await supabase
    .from("player_files")
    .select("id, file_path, file_name, mime_type")
    .eq("player_id", playerId)
    .eq("kind", "handicap_report")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !fileRow?.file_path) {
    return { ok: false, error: "No hay archivo de handicap para este jugador" };
  }

  return { ok: true, row: fileRow as FileRow };
}

/** URL firmada del último reporte GHIN del jugador (respeta RLS del usuario). */
export async function getPlayerHandicapReportSignedUrl(
  playerId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await fetchAuthorizedFileRow(playerId);
  if (!res.ok) return res;

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(res.row.file_path, SIGNED_URL_TTL_SEC, {
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

/**
 * Streamea el reporte GHIN del jugador con headers correctos para que el
 * navegador lo abra inline en lugar de descargarlo (Supabase Storage envía
 * Content-Disposition: attachment para HTML en signed URLs).
 */
export async function streamPlayerHandicapReport(
  playerId: string
): Promise<Response> {
  const res = await fetchAuthorizedFileRow(playerId);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: res.error }), {
      status: res.error === "No autenticado" ? 401 : 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(res.row.file_path);

  if (dlErr || !blob) {
    return new Response(
      JSON.stringify({ error: dlErr?.message ?? "No se pudo leer el archivo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const mime =
    res.row.mime_type?.trim() ||
    mimeFromFilename(res.row.file_name) ||
    "application/octet-stream";

  const arrayBuffer = await blob.arrayBuffer();
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${res.row.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
