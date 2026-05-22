import { User } from "lucide-react";
import { resolveUserDisplayName } from "@/lib/auth/resolveUserDisplayName";
import { createClient } from "@/utils/supabase/server";

/** Usuario conectado en la barra superior del backoffice (todas las pantallas de admin). */
export default async function BackofficeUserCorner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { displayName, email } = await resolveUserDisplayName(supabase, user);

  return (
    <div
      className="flex min-w-0 max-w-[11rem] items-center gap-1.5 text-white/90 sm:max-w-[14rem]"
      title={email}
    >
      <User
        className="h-5 w-5 shrink-0 text-cyan-300"
        strokeWidth={2.25}
        aria-hidden
      />
      <span className="truncate text-sm font-medium">{displayName}</span>
    </div>
  );
}
