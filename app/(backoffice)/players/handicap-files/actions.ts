"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  extractGhinFromFilename,
  mimeFromFilename,
} from "@/lib/player-files/ghinFromFilename";

const BUCKET = "player-files";
const MAX_FILES = 80;
const MAX_BYTES = 15 * 1024 * 1024;

export type BulkUploadRow = {
  file_name: string;
  ghin: string | null;
  status: "uploaded" | "no_ghin" | "not_found" | "duplicate_ghin" | "error";
  message?: string;
  player_name?: string | null;
};

export type BulkUploadResult = {
  ok: boolean;
  rows: BulkUploadRow[];
  uploaded: number;
  failed: number;
  error?: string;
};

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "No autenticado" };

  const { data: globalRoles } = await supabase
    .from("user_global_roles")
    .select("roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const codes = (globalRoles ?? []).map((r: any) => {
    const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
    return role?.code;
  });

  const allowed =
    codes.includes("super_admin") ||
    codes.some((c) => c === "club_admin" || c === "tournament_director");

  if (!allowed) {
    const { data: clubRoles } = await supabase
      .from("user_club_roles")
      .select("roles:role_id(code)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const clubOk = (clubRoles ?? []).some((r: any) => {
      const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return role?.code === "club_admin";
    });
    if (!clubOk) {
      return { ok: false as const, error: "Sin permiso para subir archivos" };
    }
  }

  return { ok: true as const, userId: user.id };
}

export async function bulkUploadPlayerHandicapFiles(
  formData: FormData
): Promise<BulkUploadResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, rows: [], uploaded: 0, failed: 0, error: auth.error };
  }

  const files = formData
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (files.length === 0) {
    return {
      ok: false,
      rows: [],
      uploaded: 0,
      failed: 0,
      error: "No seleccionaste archivos",
    };
  }

  if (files.length > MAX_FILES) {
    return {
      ok: false,
      rows: [],
      uploaded: 0,
      failed: 0,
      error: `Máximo ${MAX_FILES} archivos por lote`,
    };
  }

  const admin = createAdminClient();
  const rows: BulkUploadRow[] = [];
  let uploaded = 0;
  let failed = 0;

  const ghinToPlayers = new Map<
    string,
    { id: string; name: string }[]
  >();

  for (const file of files) {
    const ghin = extractGhinFromFilename(file.name);
    if (!ghin) {
      rows.push({
        file_name: file.name,
        ghin: null,
        status: "no_ghin",
        message: "No se detectó GHIN en el nombre del archivo",
      });
      failed += 1;
      continue;
    }

    let matches = ghinToPlayers.get(ghin);
    if (!matches) {
      const { data: players } = await admin
        .from("players")
        .select("id, first_name, last_name, ghin_number")
        .eq("ghin_number", ghin);

      matches = (players ?? []).map((p) => ({
        id: String(p.id),
        name: `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim(),
      }));
      ghinToPlayers.set(ghin, matches);
    }

    if (matches.length === 0) {
      rows.push({
        file_name: file.name,
        ghin,
        status: "not_found",
        message: "No hay jugador con ese GHIN en el sistema",
      });
      failed += 1;
      continue;
    }

    if (matches.length > 1) {
      rows.push({
        file_name: file.name,
        ghin,
        status: "duplicate_ghin",
        message: `${matches.length} jugadores con el mismo GHIN`,
      });
      failed += 1;
      continue;
    }

    const player = matches[0];

    if (file.size > MAX_BYTES) {
      rows.push({
        file_name: file.name,
        ghin,
        status: "error",
        message: "Archivo demasiado grande (máx. 15 MB)",
        player_name: player.name,
      });
      failed += 1;
      continue;
    }

    try {
      const ext =
        file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() ||
        "bin";
      const ts = Date.now();
      const filePath = `players/${ghin}/handicap-${ts}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || mimeFromFilename(file.name);

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
          contentType,
          upsert: true,
        });

      if (upErr) {
        rows.push({
          file_name: file.name,
          ghin,
          status: "error",
          message: upErr.message,
          player_name: player.name,
        });
        failed += 1;
        continue;
      }

      const { error: insErr } = await admin.from("player_files").insert({
        player_id: player.id,
        ghin_number: ghin,
        kind: "handicap_report",
        file_path: filePath,
        file_name: file.name,
        mime_type: contentType,
        size_bytes: file.size,
        uploaded_by: auth.userId,
      });

      if (insErr) {
        await admin.storage.from(BUCKET).remove([filePath]);
        rows.push({
          file_name: file.name,
          ghin,
          status: "error",
          message: insErr.message,
          player_name: player.name,
        });
        failed += 1;
        continue;
      }

      rows.push({
        file_name: file.name,
        ghin,
        status: "uploaded",
        player_name: player.name,
      });
      uploaded += 1;
    } catch (e) {
      rows.push({
        file_name: file.name,
        ghin,
        status: "error",
        message: e instanceof Error ? e.message : "Error desconocido",
        player_name: player.name,
      });
      failed += 1;
    }
  }

  revalidatePath("/players/handicap-files");
  revalidatePath("/comite-handicap");

  return { ok: true, rows, uploaded, failed };
}

export async function getPlayerHandicapFileSignedUrl(
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
    .createSignedUrl(fileRow.file_path, 3600);

  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: signErr?.message ?? "No se pudo abrir el archivo" };
  }

  return { ok: true, url: signed.signedUrl };
}
