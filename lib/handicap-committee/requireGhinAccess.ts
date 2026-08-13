import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * Compuerta de rutas del comité GHIN.
 * Cliente de sesión + fn_user_can_read_ghin; notFound si no pasa.
 */
export async function requireGhinCommitteeAccess(): Promise<{
  supabase: SupabaseClient;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canRead } = await supabase.rpc("fn_user_can_read_ghin", {
    user_uuid: user.id,
  });
  if (!canRead) notFound();

  return { supabase, userId: user.id };
}
