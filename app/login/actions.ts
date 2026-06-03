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

  // /dashboard requiere auth + módulo "tournaments"; el middleware ya redirige
  // automáticamente al usuario de comité de handicap a /comite-handicap si no
  // tiene acceso al panel principal.
  redirect("/dashboard");
}