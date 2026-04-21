"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

type SavePlayerInput = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  initials?: string | null;
  gender?: "M" | "F" | "X" | null;
  handicap_index?: number | string | null;
  handicap_torneo?: number | string | null;
  birth_year?: number | string | null;
  phone?: string | null;
  whatsapp_phone_e164?: string | null;
  email?: string | null;
  club?: string | null;
  club_id?: string | null;
  ghin_number?: string | null;
  shirt_size?: string | null;
  shoe_size?: string | number | null;
};

function toNullableString(value: unknown) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function toNullableUpperString(value: unknown) {
  const s = toNullableString(value);
  return s ? s.toUpperCase() : null;
}

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeGender(value: unknown): "M" | "F" | "X" | null {
  if (value === "F") return "F";
  if (value === "M") return "M";
  if (value === "X") return "X";
  return null;
}

function buildPlayerPayload(input: SavePlayerInput) {
  const payload: Record<string, unknown> = {
    first_name: toNullableString(input.first_name),
    last_name: toNullableString(input.last_name),
    initials: toNullableUpperString(input.initials),
    gender: normalizeGender(input.gender),
    handicap_index: toNullableNumber(input.handicap_index),
    handicap_torneo: toNullableNumber(input.handicap_torneo),
    birth_year: toNullableNumber(input.birth_year),
    phone: toNullableString(input.phone),
    whatsapp_phone_e164: toNullableString(input.whatsapp_phone_e164),
    email: toNullableString(input.email),
    club: toNullableString(input.club),
    club_id: toNullableString(input.club_id),
    ghin_number: toNullableString(input.ghin_number),
  };

  const shirtSize = toNullableUpperString(input.shirt_size);
  const shoeSize = toNullableString(input.shoe_size);

  if (shirtSize !== null) {
    payload.shirt_size = shirtSize;
  }

  if (shoeSize !== null) {
    payload.shoe_size = shoeSize;
  }

  return payload;
}

function validatePlayerPayload(payload: Record<string, unknown>) {
  if (!payload.first_name) {
    return "Falta nombre.";
  }

  if (!payload.last_name) {
    return "Falta apellido.";
  }

  if (!payload.gender) {
    return "Falta género.";
  }

  return null;
}

export async function savePlayerAction(input: SavePlayerInput) {
  try {
    const supabase = createAdminClient();
    const playerId = toNullableString(input.id);
    const payload = buildPlayerPayload(input);

    const validationError = validatePlayerPayload(payload);
    if (validationError) {
      return { ok: false, message: validationError };
    }

    if (playerId) {
      const { data, error } = await supabase
        .from("players")
        .update(payload)
        .eq("id", playerId)
        .select("id")
        .single();

      if (error) {
        return { ok: false, message: error.message };
      }

      revalidatePath("/players");
      revalidatePath("/entries");

      return {
        ok: true,
        mode: "update" as const,
        id: data.id,
      };
    }

    const { data, error } = await supabase
      .from("players")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/players");
    revalidatePath("/entries");

    return {
      ok: true,
      mode: "insert" as const,
      id: data.id,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message ?? "Error guardando jugador.",
    };
  }
}

export async function deletePlayerAction(
  playerId: string,
  tournamentId: string
) {
  try {
    const validPlayerId = toNullableString(playerId);
    const validTournamentId = toNullableString(tournamentId);

    if (!validPlayerId) {
      return { ok: false, message: "Jugador no válido." };
    }

    if (!validTournamentId) {
      return { ok: false, message: "Torneo no válido." };
    }

    const authSupabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, message: "No autenticado." };
    }

    const { data: tournament, error: tournamentError } = await authSupabase
      .from("tournaments")
      .select("id, club_id")
      .eq("id", validTournamentId)
      .single();

    if (tournamentError || !tournament) {
      return { ok: false, message: "Torneo no encontrado." };
    }

    const { data: globalRows, error: globalError } = await authSupabase
      .from("user_global_roles")
      .select("roles(code)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (globalError) {
      return {
        ok: false,
        message: `No se pudieron validar roles globales: ${globalError.message}`,
      };
    }

    const globalCodes =
      globalRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

    const isSuperAdmin = globalCodes.includes("super_admin");

    let isClubAdmin = false;
    if (tournament.club_id) {
      const { data: clubRows, error: clubError } = await authSupabase
        .from("user_club_roles")
        .select("roles(code)")
        .eq("user_id", user.id)
        .eq("club_id", tournament.club_id)
        .eq("is_active", true);

      if (clubError) {
        return {
          ok: false,
          message: `No se pudieron validar roles del club: ${clubError.message}`,
        };
      }

      const clubCodes =
        clubRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

      isClubAdmin = clubCodes.includes("club_admin");
    }

    const { data: tournamentRows, error: tournamentRolesError } =
      await authSupabase
        .from("user_tournament_roles")
        .select("roles(code)")
        .eq("user_id", user.id)
        .eq("tournament_id", validTournamentId)
        .eq("is_active", true);

    if (tournamentRolesError) {
      return {
        ok: false,
        message: `No se pudieron validar roles del torneo: ${tournamentRolesError.message}`,
      };
    }

    const tournamentCodes =
      tournamentRows?.map((r: any) => r.roles?.code).filter(Boolean) ?? [];

    const isTournamentDirector =
      tournamentCodes.includes("tournament_director");

    const canDelete = isSuperAdmin || isClubAdmin || isTournamentDirector;

    if (!canDelete) {
      return {
        ok: false,
        message:
          "No tienes permiso para eliminar jugadores. Solo gerente del torneo, club admin o super admin.",
      };
    }

    const supabase = createAdminClient();

    const { count: entriesCount, error: entriesCountError } = await supabase
      .from("tournament_entries")
      .select("id", { count: "exact", head: true })
      .eq("player_id", validPlayerId);

    if (entriesCountError) {
      return {
        ok: false,
        message: `No se pudo validar inscripciones: ${entriesCountError.message}`,
      };
    }

    if ((entriesCount ?? 0) > 0) {
      return {
        ok: false,
        message:
          "No se puede eliminar el jugador porque tiene inscripciones en torneos. Elimínalo primero de entries.",
      };
    }

    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", validPlayerId);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    revalidatePath("/players");
    revalidatePath("/entries");

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message ?? "Error eliminando jugador.",
    };
  }
}