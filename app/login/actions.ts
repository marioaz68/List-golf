"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tryCreateAdminClient } from "@/utils/supabase/admin";

export type LoginState = {
  ok: boolean;
  message: string;
};

/** Resuelve un nombre de usuario a su email para poder iniciar sesión en
 *  Supabase Auth (que sólo acepta email/teléfono). Usa el cliente admin para
 *  poder leer profiles aunque haya RLS. Devuelve null si no existe. */
async function resolveEmailFromUsername(
  username: string
): Promise<string | null> {
  const admin = tryCreateAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .ilike("username", username)
    .maybeSingle();

  if (error || !data) return null;
  return (data.email as string | null) ?? null;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  // El campo admite email o nombre de usuario.
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier) {
    return { ok: false, message: "Falta el email o usuario." };
  }

  if (!password) {
    return { ok: false, message: "Falta el password." };
  }

  // Si no parece email (sin "@"), lo tratamos como nombre de usuario y
  // resolvemos su email asociado.
  let email = identifier;

  if (!identifier.includes("@")) {
    const resolved = await resolveEmailFromUsername(identifier);

    if (!resolved) {
      return {
        ok: false,
        message: "Usuario o contraseña incorrectos.",
      };
    }

    email = resolved;
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({
            name,
            value,
            ...(options ?? {}),
          });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({
            name,
            value: "",
            ...(options ?? {}),
            maxAge: 0,
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  // Determinar a dónde aterrizar según rol del usuario. Un mesero / personal
  // de restaurante no usa /dashboard (está vacío para ellos); va directo a
  // su pantalla operativa.
  const landing = await resolveLandingForUser(email);
  redirect(landing);
}

/**
 * Landing post-login según rol. Prioridad:
 *   - admins (super/club/director) → /dashboard
 *   - handicap_committee solo → /comite-handicap
 *   - restaurante (sin admin) → /fb-mesero (caja del restaurante)
 *   - marshal solo → /tee-sheet
 *   - fallback → /dashboard
 */
async function resolveLandingForUser(email: string): Promise<string> {
  const admin = tryCreateAdminClient();
  if (!admin) return "/dashboard";

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!profile) return "/dashboard";
  const userId = (profile as { id: string }).id;

  const ADMIN_ROLES = new Set([
    "super_admin",
    "club_admin",
    "tournament_director",
  ]);

  const roles = new Set<string>();
  for (const table of [
    "user_global_roles",
    "user_club_roles",
    "user_tournament_roles",
  ] as const) {
    const { data } = await admin
      .from(table)
      .select("roles:role_id ( code )")
      .eq("user_id", userId)
      .eq("is_active", true);
    for (const row of (data ?? []) as Array<{
      roles: { code: string | null } | { code: string | null }[] | null;
    }>) {
      const r = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (r?.code) roles.add(r.code);
    }
  }

  // admin → /dashboard
  for (const r of ADMIN_ROLES) {
    if (roles.has(r)) return "/dashboard";
  }
  if (roles.has("restaurante")) return "/fb-mesero";
  if (roles.has("handicap_committee")) return "/comite-handicap";
  if (roles.has("marshal")) return "/tee-sheet";
  return "/dashboard";
}