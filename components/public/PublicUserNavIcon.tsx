import { UserNavIconLink } from "@/components/public/UserNavIconLink";
import { messages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

/** Icono de usuario sin fondo ni borde (esquina superior derecha en páginas públicas). */
export const userNavIconOnlyClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-200 transition hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";

export async function PublicUserNavIcon() {
  const locale = await getLocale();
  const nav = messages[locale].nav;
  const pub = messages[locale].publicTournament;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const href = user ? "/tournaments" : "/login";
  const label = user ? pub.adminList : nav.enter;

  return (
    <UserNavIconLink
      href={href}
      label={label}
      className={userNavIconOnlyClass}
      iconClassName="h-6 w-6"
    />
  );
}
