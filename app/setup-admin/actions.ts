"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export type SetupAdminState = {
  ok: boolean;
  message: string;
};

export async function setupAdminAction(
  _prevState: SetupAdminState,
  formData: FormData
): Promise<SetupAdminState> {
  const secret = String(formData.get("secret") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();

  if (!secret || secret !== process.env.BOOTSTRAP_ADMIN_SECRET) {
    return { ok: false, message: "Secreto incorrecto." };
  }

  if (!email) {
    return { ok: false, message: "Falta el email." };
  }

  if (!password) {
    return { ok: false, message: "Falta el password." };
  }

  if (password.length < 6) {
    return {
      ok: false,
      message: "El password debe tener al menos 6 caracteres.",
    };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, message: "Falta NEXT_PUBLIC_SUPABASE_URL." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Falta SUPABASE_SERVICE_ROLE_KEY." };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  try {
    // Verifica si ya existe un admin inicial
    const { count, error: countError } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) {
      return {
        ok: false,
        message: `No se pudo validar si ya existe admin: ${countError.message}`,
      };
    }

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: "El admin inicial ya fue creado. Esta página ya no debe usarse.",
      };
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
      },
    });

    if (error) {
      return {
        ok: false,
        message: `Error creando usuario: ${error.message}`,
      };
    }

    const userId = data.user?.id;

    if (!userId) {
      return {
        ok: false,
        message: "Supabase no regresó el id del usuario.",
      };
    }

    const { error: profileErr } = await supabase.from("user_profiles").upsert(
      {
        id: userId,
        full_name: fullName || null,
        role: "admin",
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      return {
        ok: false,
        message: `Usuario creado en Auth, pero falló user_profiles: ${profileErr.message}`,
      };
    }

    redirect("/login");
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Error inesperado creando admin.",
    };
  }
}