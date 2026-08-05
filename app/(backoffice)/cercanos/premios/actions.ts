"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { loadPar3Holes } from "@/lib/cercanos/loadClosestToPin";
import { CLOSEST_TO_PIN_MAX_PRIZES } from "@/lib/cercanos/types";

export type SaveCercanosPremiosState = {
  ok: boolean;
  message: string;
};

function n(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function saveClosestToPinPrize(
  _prev: SaveCercanosPremiosState,
  formData: FormData
): Promise<SaveCercanosPremiosState> {
  const tournamentId = n(formData, "tournament_id");
  const prizeId = n(formData, "prize_id");
  const holeNumber = Number(n(formData, "hole_number"));
  const prizePosition = Number(n(formData, "prize_position"));
  const prizeLabel = n(formData, "prize_label").slice(0, 200);
  const sponsor = n(formData, "sponsor").slice(0, 120) || null;
  const notes = n(formData, "notes").slice(0, 500) || null;
  const isActive = n(formData, "is_active") !== "0";

  if (!tournamentId) return { ok: false, message: "Falta torneo." };
  if (!prizeLabel) return { ok: false, message: "Escribe el nombre del premio." };
  if (
    !Number.isFinite(holeNumber) ||
    holeNumber < 1 ||
    holeNumber > 18
  ) {
    return { ok: false, message: "Hoyo inválido." };
  }
  if (
    !Number.isFinite(prizePosition) ||
    prizePosition < 1 ||
    prizePosition > CLOSEST_TO_PIN_MAX_PRIZES
  ) {
    return {
      ok: false,
      message: `El lugar debe ser entre 1 y ${CLOSEST_TO_PIN_MAX_PRIZES}.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Debes iniciar sesión." };
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "cercanos")) {
    return { ok: false, message: "Sin permiso." };
  }

  const admin = createAdminClient();
  const par3 = await loadPar3Holes(admin, tournamentId);
  if (!par3.includes(holeNumber)) {
    return {
      ok: false,
      message: `El hoyo ${holeNumber} no es par 3 en este torneo.`,
    };
  }

  const now = new Date().toISOString();
  const payload = {
    tournament_id: tournamentId,
    hole_number: holeNumber,
    prize_position: prizePosition,
    prize_label: prizeLabel,
    sponsor,
    notes,
    is_active: isActive,
    updated_at: now,
  };

  if (prizeId) {
    const { error } = await admin
      .from("closest_to_pin_prizes")
      .update(payload)
      .eq("id", prizeId)
      .eq("tournament_id", tournamentId);
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: `Ya existe un premio para hoyo ${holeNumber} lugar ${prizePosition}.`,
        };
      }
      return { ok: false, message: error.message };
    }
  } else {
    const { error } = await admin.from("closest_to_pin_prizes").insert({
      ...payload,
      created_at: now,
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: `Ya existe un premio para hoyo ${holeNumber} lugar ${prizePosition}. Edítalo en la lista.`,
        };
      }
      return { ok: false, message: error.message };
    }
  }

  revalidatePath("/cercanos/premios");
  revalidatePath("/cercanos");
  revalidatePath(`/torneos/${tournamentId}/cercanos`);
  return { ok: true, message: prizeId ? "Premio actualizado." : "Premio dado de alta." };
}

export async function deleteClosestToPinPrize(
  formData: FormData
): Promise<void> {
  const tournamentId = n(formData, "tournament_id");
  const prizeId = n(formData, "prize_id");
  if (!tournamentId || !prizeId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "cercanos")) return;

  const admin = createAdminClient();
  await admin
    .from("closest_to_pin_prizes")
    .delete()
    .eq("id", prizeId)
    .eq("tournament_id", tournamentId);

  revalidatePath("/cercanos/premios");
  revalidatePath(`/torneos/${tournamentId}/cercanos`);
}
