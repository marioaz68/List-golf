import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Primer nombre (sin apellidos) a partir de un texto. */
export function firstNameOnly(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  return firstToken.trim() || null;
}

/** Nombre corto para la UI y email completo (tooltip / accesibilidad). */
export async function resolveUserDisplayName(
  supabase: SupabaseClient,
  user: User
): Promise<{ displayName: string; email: string }> {
  const email = user.email ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    firstNameOnly(profile?.first_name) ??
    firstNameOnly(
      typeof user.user_metadata?.first_name === "string"
        ? user.user_metadata.first_name
        : null
    ) ??
    firstNameOnly(
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null
    ) ??
    firstNameOnly(email.split("@")[0] ?? null) ??
    "Admin";

  return { displayName, email };
}
