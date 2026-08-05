"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { parseDistanceToCm } from "@/lib/cercanos/distanceFormat";
import { loadPar3Holes } from "@/lib/cercanos/loadClosestToPin";

export type SaveClosestToPinState = {
  ok: boolean;
  message: string;
};

const MAX_SIGNATURE_CHARS = 600_000; // ~450 KB base64 PNG

function parseSignaturePayload(raw: FormDataEntryValue | null): {
  signature: string | null;
  error: string | null;
} {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return { signature: null, error: null };
  if (!s.startsWith("data:image/png;base64,")) {
    return {
      signature: null,
      error: "Firma inválida. Vuelve a firmar en el recuadro.",
    };
  }
  if (s.length > MAX_SIGNATURE_CHARS) {
    return {
      signature: null,
      error: "La firma es demasiado grande. Limpia y vuelve a firmar.",
    };
  }
  return { signature: s, error: null };
}

export async function saveGroupClosestToPin(
  _prev: SaveClosestToPinState,
  formData: FormData
): Promise<SaveClosestToPinState> {
  const tournamentId = String(formData.get("tournament_id") ?? "").trim();
  const roundId = String(formData.get("round_id") ?? "").trim();
  const groupId = String(formData.get("group_id") ?? "").trim();
  const holeNumber = Number(formData.get("hole_number"));
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 120);
  const { signature, error: sigErr } = parseSignaturePayload(
    formData.get("signature_payload")
  );
  if (sigErr) return { ok: false, message: sigErr };

  if (!tournamentId || !roundId || !groupId) {
    return { ok: false, message: "Faltan torneo, ronda o grupo." };
  }
  if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { ok: false, message: "Hoyo inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Debes iniciar sesión." };

  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "cercanos")) {
    return { ok: false, message: "Sin permiso para capturar cercanos." };
  }

  const admin = createAdminClient();
  const par3 = await loadPar3Holes(admin, tournamentId);
  if (!par3.includes(holeNumber)) {
    return {
      ok: false,
      message: `El hoyo ${holeNumber} no es par 3 en este torneo.`,
    };
  }

  const { data: round } = await admin
    .from("rounds")
    .select("id, tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || (round as { tournament_id: string }).tournament_id !== tournamentId) {
    return { ok: false, message: "La ronda no pertenece al torneo." };
  }

  const { data: members } = await admin
    .from("pairing_group_members")
    .select("entry_id")
    .eq("group_id", groupId);

  const allowedEntryIds = new Set(
    ((members ?? []) as Array<{ entry_id: string }>).map((m) => m.entry_id)
  );
  if (allowedEntryIds.size === 0) {
    return { ok: false, message: "El grupo no tiene jugadores." };
  }

  const now = new Date().toISOString();

  type UpsertRow = {
    tournament_id: string;
    round_id: string;
    hole_number: number;
    entry_id: string;
    distance_cm: number;
    group_id: string;
    captured_by_profile_id: string;
    updated_at: string;
    signature_payload?: string | null;
    signed_at?: string | null;
    signer_name?: string | null;
  };

  const upserts: UpsertRow[] = [];
  const clearEntryIds: string[] = [];

  for (const entryId of allowedEntryIds) {
    const raw = formData.get(`dist_${entryId}`);
    const text = raw == null ? "" : String(raw).trim();
    if (!text) {
      clearEntryIds.push(entryId);
      continue;
    }
    const cm = parseDistanceToCm(text);
    if (cm == null) {
      return {
        ok: false,
        message: `Distancia inválida para un jugador ("${text}"). Usa m (ej. 1.25), cm o pies'pulgadas.`,
      };
    }
    const row: UpsertRow = {
      tournament_id: tournamentId,
      round_id: roundId,
      hole_number: holeNumber,
      entry_id: entryId,
      distance_cm: cm,
      group_id: groupId,
      captured_by_profile_id: user.id,
      updated_at: now,
    };
    // Solo el capturista (sesión staff en /cercanos) firma aquí.
    // Si no hay firma nueva, no se tocan columnas de firma (upsert parcial vía
    // dos pasos cuando hay firma).
    if (signature) {
      row.signature_payload = signature;
      row.signed_at = now;
      row.signer_name = signerName || null;
    }
    upserts.push(row);
  }

  if (clearEntryIds.length > 0) {
    const { error: delErr } = await admin
      .from("closest_to_pin_entries")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("round_id", roundId)
      .eq("hole_number", holeNumber)
      .in("entry_id", clearEntryIds);
    if (delErr) {
      return { ok: false, message: delErr.message };
    }
  }

  if (upserts.length > 0) {
    if (signature) {
      const { error: upErr } = await admin
        .from("closest_to_pin_entries")
        .upsert(upserts, { onConflict: "round_id,hole_number,entry_id" });
      if (upErr) return { ok: false, message: upErr.message };
    } else {
      // Sin firma nueva: actualizar solo distancia sin borrar firmas previas.
      for (const row of upserts) {
        const { error: upErr } = await admin.from("closest_to_pin_entries").upsert(
          {
            tournament_id: row.tournament_id,
            round_id: row.round_id,
            hole_number: row.hole_number,
            entry_id: row.entry_id,
            distance_cm: row.distance_cm,
            group_id: row.group_id,
            captured_by_profile_id: row.captured_by_profile_id,
            updated_at: row.updated_at,
          },
          { onConflict: "round_id,hole_number,entry_id" }
        );
        if (upErr) return { ok: false, message: upErr.message };
      }
    }
  }

  revalidatePath("/cercanos");
  revalidatePath(`/torneos/${tournamentId}/cercanos`);
  revalidatePath(`/torneos/${tournamentId}`);

  const firmada = signature ? " · firmado por capturista" : "";
  return {
    ok: true,
    message: `Guardado: ${upserts.length} distancia(s)${clearEntryIds.length ? `, ${clearEntryIds.length} borrada(s)` : ""}${firmada}.`,
  };
}
