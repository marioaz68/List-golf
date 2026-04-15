"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function deletePlayerAction(playerId: string) {
  try {
    if (!playerId) {
      return { ok: false, message: "Jugador no válido." };
    }

    const supabase = await createClient();

    const { count: entriesCount, error: entriesCountError } = await supabase
      .from("tournament_entries")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId);

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
      .eq("id", playerId);

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