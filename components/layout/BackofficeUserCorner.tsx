import { User } from "lucide-react";
import { resolveUserDisplayName } from "@/lib/auth/resolveUserDisplayName";
import { createClient } from "@/utils/supabase/server";

/** Usuario conectado en la barra superior del backoffice (todas las pantallas de admin). */
export default async function BackofficeUserCorner() {
  let displayName: string | null = null;
  let email = "";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const resolved = await resolveUserDisplayName(supabase, user);
    displayName = resolved.displayName;
    email = resolved.email;
  } catch {
    return null;
  }

  if (!displayName) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className="inline-flex h-9 min-w-0 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 text-white sm:max-w-[16rem]"
        title={email}
      >
        <User
          className="h-4 w-4 shrink-0 text-cyan-300"
          strokeWidth={2.25}
          aria-hidden
        />
        <span className="min-w-0 truncate whitespace-nowrap text-sm font-semibold">
          {displayName}
        </span>
      </div>

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/20"
          title="Cerrar sesión para entrar con otro usuario"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
