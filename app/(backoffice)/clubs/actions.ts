"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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

async function getClubById(club_id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clubs")
    .select("id, name, short_name, normalized_name, is_active")
    .eq("id", club_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo club: ${error.message}`);
  }

  return (data as ClubCheckRow | null) ?? null;
}

async function getActiveDuplicatesByNormalizedName(
  normalized_name: string,
  excludeId?: string
) {
  const supabase = await createClient();

  let query = supabase
    .from("clubs")
    .select("id, name, short_name, normalized_name, is_active")
    .eq("normalized_name", normalized_name)
    .eq("is_active", true);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error buscando duplicados: ${error.message}`);
  }

  return (data ?? []) as ClubCheckRow[];
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
    const winner = duplicates[0];
    throw new Error(
      `Ya existe otro club activo con nombre equivalente: "${winner?.name ?? "Club existente"}".`
    );
  }
}

function revalidateAll() {
  revalidatePath("/clubs");
  revalidatePath("/courses");
  revalidatePath("/tournaments");
  revalidatePath("/", "layout");
}

export async function createClub(formData: FormData) {
  const supabase = await createClient();

  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const is_active = boolFromForm(formData, "is_active");

  const normalized_name = normalizeText(name);

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
  }

  if (is_active) {
    await ensureUniqueActiveNormalizedName(null, normalized_name);
  }

  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name,
      short_name,
      normalized_name,
      is_active,
    })
    .select("id, name, short_name, is_active, normalized_name")
    .maybeSingle();

  if (error) {
    throw new Error(`Error creando club: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "No se pudo crear el club. Revisa permisos RLS de INSERT en Supabase."
    );
  }

  revalidateAll();
}

export async function updateClub(formData: FormData) {
  const supabase = await createClient();

  const club_id = reqStr(formData, "club_id");
  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const is_active = boolFromForm(formData, "is_active");

  const existingClub = await getClubById(club_id);

  if (!existingClub) {
    throw new Error(
      "No se encontró el club a editar. Recarga la pantalla y vuelve a intentar."
    );
  }

  const normalized_name = normalizeText(name);

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
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
    .select("id, name, short_name, is_active, normalized_name")
    .maybeSingle();

  if (error) {
    throw new Error(`Error actualizando club: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "No se pudo actualizar el club. Revisa permisos RLS de UPDATE en Supabase."
    );
  }

  revalidateAll();
}

export async function toggleClubActive(formData: FormData) {
  const supabase = await createClient();

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
    .select("id, name, short_name, is_active")
    .maybeSingle();

  if (error) {
    throw new Error(`Error cambiando estatus del club: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "No se pudo cambiar estatus del club. Revisa permisos RLS de UPDATE en Supabase."
    );
  }

  revalidateAll();
}