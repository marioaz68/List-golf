"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

type ActionResult =
  | { ok: true; message: string; poster_path?: string }
  | { ok: false; message: string };

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

async function ensureStaffAdminAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.trim().toLowerCase();
  if (fromName) return fromName;

  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function getPosterFile(formData: FormData) {
  const value = formData.get("poster");

  if (!value || !(value instanceof File)) return null;
  if (!value.name || value.size <= 0) return null;

  return value;
}

async function uploadTournamentPoster(params: {
  tournamentId: string;
  file: File;
  previousPosterPath?: string | null;
}) {
  const admin = createAdminClient();
  const { tournamentId, file, previousPosterPath } = params;

  const ext = getFileExtension(file);
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const filePath = `tournaments/${tournamentId}/poster.${safeExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage
    .from("tournament-posters")
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Error subiendo póster: ${uploadError.message}`);
  }

  if (previousPosterPath && previousPosterPath !== filePath) {
    await admin.storage.from("tournament-posters").remove([previousPosterPath]);
  }

  return filePath;
}

async function getActiveClubById(club_id: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("clubs")
    .select("id, name, short_name, is_active")
    .eq("id", club_id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo club: ${error.message}`);
  }

  return data as
    | {
        id: string;
        name: string | null;
        short_name: string | null;
        is_active: boolean | null;
      }
    | null;
}

async function getCourseById(course_id: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("courses")
    .select("id, name, club_id")
    .eq("id", course_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo campo: ${error.message}`);
  }

  return data as
    | {
        id: string;
        name: string | null;
        club_id: string | null;
      }
    | null;
}

export async function createTournamentAndMaybeCopyCategories(
  formData: FormData
) {
  const admin = createAdminClient();

  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const status = optStr(formData, "status") ?? "draft";
  const club_id = reqStr(formData, "club_id");
  const course_id = optStr(formData, "course_id");
  const start_date = optStr(formData, "start_date");
  const copy_from_tournament_id = optStr(formData, "copy_from_tournament_id");
  const posterFile = getPosterFile(formData);

  const club = await getActiveClubById(club_id);

  if (!club) {
    throw new Error("Club inválido o inactivo.");
  }

  let resolved_course_id: string | null = null;
  let course_name: string | null = null;

  if (course_id) {
    const course = await getCourseById(course_id);

    if (!course) {
      throw new Error("Campo inválido.");
    }

    if ((course.club_id ?? null) !== club_id) {
      throw new Error("El campo seleccionado no pertenece al club elegido.");
    }

    resolved_course_id = course.id;
    course_name = course.name ?? null;
  }

  const { data: tournament, error: tournamentError } = await admin
    .from("tournaments")
    .insert({
      name,
      short_name,
      status,
      club_id,
      club_name: club.name ?? null,
      course_id: resolved_course_id,
      course_name,
      start_date,
    })
    .select("id")
    .single();

  if (tournamentError) throw new Error(tournamentError.message);

  let poster_path: string | null = null;

  if (posterFile) {
    poster_path = await uploadTournamentPoster({
      tournamentId: tournament.id,
      file: posterFile,
    });

    const { error: posterUpdateError } = await admin
      .from("tournaments")
      .update({ poster_path })
      .eq("id", tournament.id);

    if (posterUpdateError) {
      throw new Error(posterUpdateError.message);
    }
  }

  if (copy_from_tournament_id) {
    const { data: sourceCategories, error: sourceCategoriesError } =
      await admin
        .from("categories")
        .select(`
          code,
          name,
          gender,
          min_age,
          max_age,
          handicap_min,
          handicap_max,
          sort_order,
          is_active,
          category_group,
          handicap_percent_override,
          allow_multiple_prizes_per_player,
          default_prize_count
        `)
        .eq("tournament_id", copy_from_tournament_id)
        .order("sort_order", { ascending: true });

    if (sourceCategoriesError) throw new Error(sourceCategoriesError.message);

    if (sourceCategories?.length) {
      const rows = sourceCategories.map((c) => ({
        tournament_id: tournament.id,
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
      }));

      const { error: insertCategoriesError } = await admin
        .from("categories")
        .insert(rows);

      if (insertCategoriesError) throw new Error(insertCategoriesError.message);
    }
  }

  revalidatePath("/tournaments");
  revalidatePath("/");
  revalidatePath(`/torneos/${tournament.id}`);
  redirect("/tournaments");
}

export async function updateTournamentAction(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const status = optStr(formData, "status") ?? "draft";
  const club_id = reqStr(formData, "club_id");
  const course_id = optStr(formData, "course_id");
  const start_date = optStr(formData, "start_date");
  const posterFile = getPosterFile(formData);

  await ensureStaffAdminAccess(tournament_id);

  const club = await getActiveClubById(club_id);

  if (!club) {
    throw new Error("Club inválido o inactivo.");
  }

  let resolved_course_id: string | null = null;
  let course_name: string | null = null;

  if (course_id) {
    const course = await getCourseById(course_id);

    if (!course) {
      throw new Error("Campo inválido.");
    }

    if ((course.club_id ?? null) !== club_id) {
      throw new Error("El campo seleccionado no pertenece al club elegido.");
    }

    resolved_course_id = course.id;
    course_name = course.name ?? null;
  }

  let previousPosterPath: string | null = null;

  if (posterFile) {
    const { data: currentTournament, error: currentTournamentError } =
      await supabase
        .from("tournaments")
        .select("poster_path")
        .eq("id", tournament_id)
        .single();

    if (currentTournamentError) {
      throw new Error(currentTournamentError.message);
    }

    previousPosterPath = currentTournament?.poster_path ?? null;
  }

  const updatePayload: {
    name: string;
    short_name: string | null;
    status: string;
    club_id: string;
    club_name: string | null;
    course_id: string | null;
    course_name: string | null;
    start_date: string | null;
    poster_path?: string | null;
  } = {
    name,
    short_name,
    status,
    club_id,
    club_name: club.name ?? null,
    course_id: resolved_course_id,
    course_name,
    start_date,
  };

  if (posterFile) {
    const poster_path = await uploadTournamentPoster({
      tournamentId: tournament_id,
      file: posterFile,
      previousPosterPath,
    });

    const admin = createAdminClient();
    const { error: posterUpdateError } = await admin
      .from("tournaments")
      .update({ poster_path })
      .eq("id", tournament_id);

    if (posterUpdateError) {
      throw new Error(posterUpdateError.message);
    }

    updatePayload.poster_path = poster_path;
  }

  const { error } = await supabase
    .from("tournaments")
    .update(updatePayload)
    .eq("id", tournament_id);

  if (error) throw new Error(error.message);

  revalidatePath("/tournaments");
  revalidatePath("/");
  revalidatePath(`/torneos/${tournament_id}`);
  redirect("/tournaments");
}

export async function uploadTournamentPosterFromList(
  formData: FormData
): Promise<ActionResult> {
  try {
    const tournament_id = reqStr(formData, "tournament_id");
    const posterFile = getPosterFile(formData);

    await ensureStaffAdminAccess(tournament_id);

    if (!posterFile) {
      return { ok: false, message: "Selecciona un archivo de póster." };
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (posterFile.type && !allowedTypes.has(posterFile.type)) {
      return {
        ok: false,
        message: "Formato no permitido. Usa JPG, PNG o WEBP.",
      };
    }

    const maxBytes = 8 * 1024 * 1024;
    if (posterFile.size > maxBytes) {
      return { ok: false, message: "El póster excede el límite de 8 MB." };
    }

    const admin = createAdminClient();

    const { data: currentTournament, error: currentTournamentError } =
      await admin
        .from("tournaments")
        .select("poster_path")
        .eq("id", tournament_id)
        .single();

    if (currentTournamentError) {
      return { ok: false, message: currentTournamentError.message };
    }

    const previousPosterPath = currentTournament?.poster_path ?? null;

    const poster_path = await uploadTournamentPoster({
      tournamentId: tournament_id,
      file: posterFile,
      previousPosterPath,
    });

    const { error: updateError } = await admin
      .from("tournaments")
      .update({ poster_path })
      .eq("id", tournament_id);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    revalidatePath("/tournaments");
    revalidatePath("/");
    revalidatePath(`/torneos/${tournament_id}`);

    return {
      ok: true,
      message: "Póster actualizado correctamente.",
      poster_path,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Error inesperado subiendo póster.",
    };
  }
}

export async function togglePublic(tournamentId: string) {
  await ensureStaffAdminAccess(tournamentId);

  const admin = createAdminClient();

  const { data: current, error: readError } = await admin
    .from("tournaments")
    .select("id, is_public, is_archived")
    .eq("id", tournamentId)
    .single();

  if (readError) {
    throw new Error(`Error leyendo torneo: ${readError.message}`);
  }

  const isArchived = current?.is_archived ?? false;
  const currentIsPublic = current?.is_public ?? true;
  const nextIsPublic = isArchived ? false : !currentIsPublic;

  const { error: updateError } = await admin
    .from("tournaments")
    .update({ is_public: nextIsPublic })
    .eq("id", tournamentId);

  if (updateError) {
    throw new Error(`Error actualizando visibilidad: ${updateError.message}`);
  }

  revalidatePath("/tournaments");
  revalidatePath("/");
  revalidatePath(`/torneos/${tournamentId}`);
}

export async function toggleArchive(tournamentId: string) {
  await ensureStaffAdminAccess(tournamentId);

  const admin = createAdminClient();

  const { data: current, error: readError } = await admin
    .from("tournaments")
    .select("id, is_public, is_archived")
    .eq("id", tournamentId)
    .single();

  if (readError) {
    throw new Error(`Error leyendo torneo: ${readError.message}`);
  }

  const nextIsArchived = !(current?.is_archived ?? false);

  const updatePayload: {
    is_archived: boolean;
    is_public?: boolean;
  } = {
    is_archived: nextIsArchived,
  };

  if (nextIsArchived) {
    updatePayload.is_public = false;
  }

  const { error: updateError } = await admin
    .from("tournaments")
    .update(updatePayload)
    .eq("id", tournamentId);

  if (updateError) {
    throw new Error(`Error actualizando archivo: ${updateError.message}`);
  }

  revalidatePath("/tournaments");
  revalidatePath("/");
  revalidatePath(`/torneos/${tournamentId}`);
}