"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export type ForgotPasswordState = {
  ok: boolean;
  message: string;
};

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { ok: false, message: "Falta el email." };
  }

  const cookieStore = await cookies();
  const headerStore = await headers();

  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

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

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/login/reset-password`,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message:
      "Listo. Si el correo existe, recibirás una liga para cambiar tu contraseña.",
  };
}