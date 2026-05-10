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

function normalizeShortName(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

function cleanClubWords(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const CLUB_SHORT_OVERRIDES: Record<string, string> = {
  "BOSQUE REAL COUNTRY CLUB": "BRC",
  "BOSQUE REAL EJECUTIVO": "BRE",
  "CAMPESTRE CELAYA": "CCY",
  "CAMPO DE GOLF EL CID": "CID",
  "CAMPO DE GOLF ZIBATA": "ZIB",
  "CLUB CAMPESTRE CHILUCA": "CHI",
  "CLUB CAMPESTRE DE CELAYA": "CCC",
  "CLUB CAMPESTRE DE LEON": "CCL",
};

function buildSmartClubShortName(name: string) {
  const cleaned = cleanClubWords(name);
  if (!cleaned) return null;

  const override = CLUB_SHORT_OVERRIDES[cleaned];
  if (override) return override;

  let words = cleaned.split(" ").filter(Boolean);

  // Campo de Golf El Cid -> CID / Campo de Golf Zibatá -> ZIB
  if (
    words[0] === "CAMPO" &&
    words[1] === "DE" &&
    words[2] === "GOLF"
  ) {
    words = words.slice(3).filter((word) => !["EL", "LA", "LOS", "LAS"].includes(word));
    const mainWord = words[0];
    if (mainWord) return normalizeShortName(mainWord);
  }

  // Club Campestre Chiluca -> CHI, but Club Campestre de Celaya -> CCC.
  if (words[0] === "CLUB" && words[1] === "CAMPESTRE") {
    const afterCampestre = words.slice(2).filter((word) => word !== "DE");
    if (afterCampestre.length === 1 && words[2] !== "DE") {
      return normalizeShortName(afterCampestre[0]);
    }
  }

  const ignored = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y"]);
  const meaningful = words.filter((word) => !ignored.has(word));

  if (meaningful.length >= 3) {
    return normalizeShortName(meaningful.map((word) => word[0]).join(""));
  }

  if (meaningful.length === 2) {
    const first = meaningful[0];
    const second = meaningful[1];

    if (first === "CAMPESTRE" && second.length >= 2) {
      return normalizeShortName(`${first[0]}${second[0]}${second[second.length - 1]}`);
    }

    return normalizeShortName(`${first[0]}${second.slice(0, 2)}`);
  }

  return normalizeShortName(meaningful[0] || cleaned);
}

function getFinalClubShortName(name: string, submittedShortName: string | null) {
  return normalizeShortName(submittedShortName) || buildSmartClubShortName(name) || "CLB";
}

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function colorFromShortName(shortName: string | null, name: string) {
  const palette = [
    "#0f766e",
    "#1d4ed8",
    "#7c3aed",
    "#be123c",
    "#b45309",
    "#15803d",
    "#0369a1",
    "#4338ca",
    "#a21caf",
    "#0f172a",
    "#166534",
    "#92400e",
  ];

  const seed = normalizeShortName(shortName) || normalizeText(name) || "CLUB";
  return palette[hashString(seed) % palette.length];
}


function normalizeDropboxUrl(url: string | null) {
  const raw = String(url ?? "").trim();

  if (!raw) return null;

  if (raw.includes("www.dropbox.com")) {
    return raw
      .replace("https://www.dropbox.com", "https://dl.dropboxusercontent.com")
      .replace("&raw=1", "")
      .replace("?raw=1", "");
  }

  return raw;
}

function buildGeneratedLogoDataUrl(params: {
  short_name: string | null;
  name: string;
  primary_color?: string | null;
}) {
  const shortName = normalizeShortName(params.short_name) || buildSmartClubShortName(params.name) || "CLB";
  const letters = shortName;
  const bg = params.primary_color || colorFromShortName(shortName, params.name);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g" cx="35%" cy="25%" r="80%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="45%" stop-color="${bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.28"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="124" fill="url(#g)" stroke="#e2e8f0" stroke-width="8"/>
  <circle cx="128" cy="128" r="104" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
  <text x="128" y="144" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${letters.length > 2 ? 68 : 82}" font-weight="800" fill="#ffffff" letter-spacing="4">${letters}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type ClubCheckRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  logo_url: string | null;
  generated_logo_url: string | null;
  primary_color: string | null;
  is_verified_logo: boolean | null;
  is_active: boolean | null;
};

function revalidateAll() {
  revalidatePath("/clubs");
  revalidatePath("/courses");
  revalidatePath("/tournaments");
  revalidatePath("/players");
  revalidatePath("/tee-sheet");
  revalidatePath("/", "layout");
}

async function getClubById(club_id: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("clubs")
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
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
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
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
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
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
  const short_name = getFinalClubShortName(name, optStr(formData, "short_name"));
  const is_active = boolFromForm(formData, "is_active");
  const normalized_name = normalizeText(name);
  const primary_color =
    optStr(formData, "primary_color") || colorFromShortName(short_name, name);
  const logo_url = normalizeDropboxUrl(optStr(formData, "logo_url"));

  if (!normalized_name) {
    throw new Error("Falta nombre válido del club.");
  }

  await ensureUniqueNormalizedName(null, normalized_name);

  const generated_logo_url = buildGeneratedLogoDataUrl({
    short_name,
    name,
    primary_color,
  });

  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name,
      short_name,
      normalized_name,
      logo_url,
      generated_logo_url,
      primary_color,
      is_verified_logo: Boolean(logo_url),
      is_active,
    })
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
    .single();

  if (error) throw new Error(`Error creando club: ${error.message}`);

  revalidateAll();

  return data;
}

export async function updateClub(formData: FormData) {
  const supabase = createAdminClient();

  const club_id = reqStr(formData, "club_id");
  const name = reqStr(formData, "name");
  const short_name = getFinalClubShortName(name, optStr(formData, "short_name"));
  const is_active = boolFromForm(formData, "is_active");
  const normalized_name = normalizeText(name);
  const logo_url = normalizeDropboxUrl(optStr(formData, "logo_url"));
  const existingClub = await getClubById(club_id);

  if (!existingClub) {
    throw new Error(
      "No se encontró el club a editar. Recarga la pantalla y vuelve a intentar."
    );
  }

  const primary_color =
    optStr(formData, "primary_color") ||
    existingClub.primary_color ||
    colorFromShortName(short_name, name);

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

  const generated_logo_url = buildGeneratedLogoDataUrl({
    short_name,
    name,
    primary_color,
  });

  const { data, error } = await supabase
    .from("clubs")
    .update({
      name,
      short_name,
      normalized_name,
      logo_url,
      generated_logo_url,
      primary_color,
      is_verified_logo: Boolean(logo_url),
      is_active,
    })
    .eq("id", club_id)
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
    .single();

  if (error) throw new Error(`Error actualizando club: ${error.message}`);

  revalidateAll();

  return data;
}

export async function updateClubLogo(formData: FormData) {
  const supabase = createAdminClient();

  const club_id = reqStr(formData, "club_id");
  const logo_url = normalizeDropboxUrl(optStr(formData, "logo_url"));
  const primary_color = optStr(formData, "primary_color");

  const club = await getClubById(club_id);

  if (!club) {
    throw new Error("No se encontró el club.");
  }

  const finalColor =
    primary_color ||
    club.primary_color ||
    colorFromShortName(club.short_name, club.name || "");

  const generated_logo_url = buildGeneratedLogoDataUrl({
    short_name: club.short_name,
    name: club.name || "Club",
    primary_color: finalColor,
  });

  const { data, error } = await supabase
    .from("clubs")
    .update({
      logo_url,
      generated_logo_url,
      primary_color: finalColor,
      is_verified_logo: Boolean(logo_url),
    })
    .eq("id", club_id)
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
    .single();

  if (error) throw new Error(`Error actualizando logo del club: ${error.message}`);

  revalidateAll();

  return data;
}

export async function regenerateClubLogo(formData: FormData) {
  const supabase = createAdminClient();

  const club_id = reqStr(formData, "club_id");
  const club = await getClubById(club_id);

  if (!club) {
    throw new Error("No se encontró el club.");
  }

  const primary_color =
    club.primary_color || colorFromShortName(club.short_name, club.name || "");

  const generated_logo_url = buildGeneratedLogoDataUrl({
    short_name: club.short_name,
    name: club.name || "Club",
    primary_color,
  });

  const { data, error } = await supabase
    .from("clubs")
    .update({
      generated_logo_url,
      primary_color,
    })
    .eq("id", club_id)
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
    .single();

  if (error) throw new Error(`Error regenerando logo: ${error.message}`);

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
    .select(
      "id, name, short_name, normalized_name, logo_url, generated_logo_url, primary_color, is_verified_logo, is_active"
    )
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

  const { error: movePlayersError } = await supabase
    .from("players")
    .update({ club_id: target_club_id })
    .eq("club_id", source_club_id);

  if (movePlayersError) {
    throw new Error(
      `Error moviendo players al club destino: ${movePlayersError.message}`
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
