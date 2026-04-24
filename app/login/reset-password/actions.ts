"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type ResetPasswordState = {
  ok: boolean;
  message: string;
};

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password) {
    return { ok: false, message: "Falta la nueva contraseña." };
  }

  if (password.length < 6) {
    return {
      ok: false,
      message: "La contraseña debe tener mínimo 6 caracteres.",
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: "Las contraseñas no coinciden." };
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

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
  };
}