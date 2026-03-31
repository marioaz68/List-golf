"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
}

function boolFromForm(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on";
}

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

type ClubCheckRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
};

function revalidateAll() {
  revalidatePath("/clubs");
  revalidatePath("/courses");
  revalidatePath("/tournaments");
  revalidatePath("/", "layout");
}

async function getClubById(club_id: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, short_name, normalized_name, is_active")
    .eq("id", club_id)
    .maybeSingle();

  if (error) throw new Error(`Error leyendo club: ${error.message}`);
  return (data as ClubCheckRow | null) ?? null;
}

async function getDuplicatesByNormalizedName(
  normalized_name: string,
  excludeId?: string
) {
  const supabase = createAdminClient();

  let query = supabase
    .from("clubs")
    .select("id, name, short_name, normalized_name, is_active")
    .eq("normalized_name", normalized_name);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw new Error(`Error buscando duplicados: ${error.message}`);

  return (data ?? []) as ClubCheckRow[];
}

async function getActiveDuplicatesByNormalizedName(
  normalized_name: string,
  excludeId?: string
) {
  const supabase = createAdminClient();

  let query = supabase
    .from("clubs")
    .select("id, name, short_name, normalized_name, is_active")
    .eq("normalized_name", normalized_name)
    .eq("is_active", true);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Error buscando duplicados activos: ${error.message}`);
  }

  return (data ?? []) as ClubCheckRow[];
}

async function ensureUniqueNormalizedName(
  clubId: string | null,
  normalized_name: string
) {
  const duplicates = await getDuplicatesByNormalizedName(
    normalized_name,
    clubId ?? undefined
  );

  if (duplicates.length > 0) {
    const existing = duplicates[0];
    throw new Error(
      `Ya existe un club con nombre equivalente: "${existing?.name ?? "Club existente"}".`
    );
  }
}

async function ensureUniqueActiveNormalizedName(
  clubId: string | null,
  normalized_name: string
) {
  const duplicates = await getActiveDuplicatesByNormalizedName(
    normalized_name,
    clubId ?? undefined
  );

  if (duplicates.length > 0) {
    const existing = duplicates[0];
    throw new Error(
      `Ya existe otro club activo con nombre equivalente: "${existing?.name ?? "Club existente"}".`
    );
  }
}

export async function createClub(formData: FormData) {
  const supabase = createAdminClient();

  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const is_active = boolFromForm(formData, "is_active");
  const normalized_name = normalizeText(name);

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
  }

  await ensureUniqueNormalizedName(null, normalized_name);

  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name,
      short_name,
      normalized_name,
      is_active,
    })
    .select("id, name, short_name, normalized_name, is_active")
    .single();

  if (error) throw new Error(`Error creando club: ${error.message}`);

  revalidateAll();
  return data;
}

export async function updateClub(formData: FormData) {
  const supabase = createAdminClient();

  const club_id = reqStr(formData, "club_id");
  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const is_active = boolFromForm(formData, "is_active");
  const normalized_name = normalizeText(name);

  const existingClub = await getClubById(club_id);

  if (!existingClub) {
    throw new Error(
      "No se encontró el club a editar. Recarga la pantalla y vuelve a intentar."
    );
  }

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
  }

  const previousNormalized = normalizeText(existingClub.name || "");
  const normalizedChanged = normalized_name !== previousNormalized;

  if (normalizedChanged) {
    await ensureUniqueNormalizedName(club_id, normalized_name);
  }

  if (is_active) {
    await ensureUniqueActiveNormalizedName(club_id, normalized_name);
  }

  const { data, error } = await supabase
    .from("clubs")
    .update({
      name,
      short_name,
      normalized_name,
      is_active,
    })
    .eq("id", club_id)
    .select("id, name, short_name, normalized_name, is_active")
    .single();

  if (error) throw new Error(`Error actualizando club: ${error.message}`);

  revalidateAll();
  return data;
}

export async function toggleClubActive(formData: FormData) {
  const supabase = createAdminClient();

  const club_id = reqStr(formData, "club_id");
  const next_active = boolFromForm(formData, "next_active");

  const current = await getClubById(club_id);

  if (!current) {
    throw new Error("No se encontró el club a actualizar.");
  }

  if (next_active) {
    const normalized_name = normalizeText(current.name || "");

    if (!normalized_name) {
      throw new Error(
        "No se puede activar este club porque no tiene nombre válido."
      );
    }

    await ensureUniqueActiveNormalizedName(club_id, normalized_name);
  }

  const { data, error } = await supabase
    .from("clubs")
    .update({
      is_active: next_active,
    })
    .eq("id", club_id)
    .select("id, name, short_name, normalized_name, is_active")
    .single();

  if (error) throw new Error(`Error cambiando estatus del club: ${error.message}`);

  revalidateAll();
  return data;
}

export async function mergeClubIntoWinner(formData: FormData) {
  const supabase = createAdminClient();

  const source_club_id = reqStr(formData, "source_club_id");
  const target_club_id = reqStr(formData, "target_club_id");

  if (source_club_id === target_club_id) {
    throw new Error("El club origen y el club destino no pueden ser el mismo.");
  }

  const [sourceClub, targetClub] = await Promise.all([
    getClubById(source_club_id),
    getClubById(target_club_id),
  ]);

  if (!sourceClub) throw new Error("No se encontró el club duplicado/origen.");
  if (!targetClub) throw new Error("No se encontró el club destino.");

  const targetNormalized = normalizeText(targetClub.name || "");
  if (!targetNormalized) throw new Error("El club destino no tiene nombre válido.");

  await ensureUniqueActiveNormalizedName(target_club_id, targetNormalized);

  const { error: moveCoursesError } = await supabase
    .from("courses")
    .update({ club_id: target_club_id })
    .eq("club_id", source_club_id);

  if (moveCoursesError) {
    throw new Error(
      `Error moviendo courses al club destino: ${moveCoursesError.message}`
    );
  }

  const { error: deactivateSourceError } = await supabase
    .from("clubs")
    .update({ is_active: false })
    .eq("id", source_club_id);

  if (deactivateSourceError) {
    throw new Error(
      `Error desactivando club origen: ${deactivateSourceError.message}`
    );
  }

  const { error: activateTargetError } = await supabase
    .from("clubs")
    .update({ is_active: true })
    .eq("id", target_club_id);

  if (activateTargetError) {
    throw new Error(
      `Error activando club destino: ${activateTargetError.message}`
    );
  }

  revalidateAll();
  return { ok: true };
}