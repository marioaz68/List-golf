"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { getUserRoles, isCommitteeOnlyUser } from "@/lib/auth/getUserRoles";
import { committeeOnlyHomePath } from "@/lib/handicap-committee/openCommitteesForUser";
import { committeeLandingFromNext } from "@/lib/handicap-committee/committeeOnlyPublic";

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
  // su pantalla operativa. Solo-comité puede llegar desde el poster
  // (`next=/torneos/{id}` → votación de ese torneo).
  const next = String(formData.get("next") ?? "").trim();
  const landing = await resolveLandingForUser(email, next);
  redirect(landing);
}

/**
 * Landing post-login según rol. Prioridad:
 *   - admins (super/club/director) → /dashboard
 *   - handicap_committee Y ningún otro rol de la tabla roles → módulo comité
 *   - restaurante (sin admin) → /fb-mesero
 *   - marshal → /tee-sheet
 *   - fallback → /dashboard
 * Quien tiene comité + otro rol operativo sigue el flujo normal (no se
 * manda al módulo del comité).
 */
async function resolveLandingForUser(
  email: string,
  requestedNext = ""
): Promise<string> {
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

  const roles = new Set(await getUserRoles(admin, userId));

  // admin → /dashboard
  for (const r of ADMIN_ROLES) {
    if (roles.has(r)) return "/dashboard";
  }
  // Restaurante (manager) → grid de mesas
  if (roles.has("restaurante")) return "/fb-mesero";
  // Mesero → grid de mesas (su pantalla principal)
  if (roles.has("mesero")) return "/fb-mesero";
  // Cocinero → cocina
  if (roles.has("cocinero")) return "/fb-cocina";
  // Operador de carrito → mini app del carrito (sin venue param: pick automático)
  if (roles.has("operador_carrito")) return "/captura/carrito";
  if (isCommitteeOnlyUser([...roles])) {
    const fromPoster = committeeLandingFromNext(requestedNext);
    if (fromPoster) return fromPoster;
    return committeeOnlyHomePath();
  }
  if (roles.has("marshal")) return "/tee-sheet";
  return "/dashboard";
}