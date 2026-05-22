import { UserNavIconLink } from "@/components/public/UserNavIconLink";
import { resolveUserDisplayName } from "@/lib/auth/resolveUserDisplayName";
import { messages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

/** Icono de usuario sin fondo ni borde (esquina superior derecha en páginas públicas). */
export const userNavIconOnlyClass =
  "inline-flex h-10 shrink-0 items-center justify-center text-slate-200 transition hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";

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

  let labelText = nav.enter;
  if (user) {
    const { displayName, email } = await resolveUserDisplayName(supabase, user);
    labelText = displayName;
    return (
      <UserNavIconLink
        href={href}
        label={label}
        title={email}
        className={`${userNavIconOnlyClass} max-w-[11rem] gap-1.5 px-1 sm:max-w-[14rem]`}
        iconClassName="h-6 w-6 shrink-0"
        showLabel
        labelText={labelText}
      />
    );
  }

  return (
    <UserNavIconLink
      href={href}
      label={label}
      className={`${userNavIconOnlyClass} max-w-[11rem] gap-1.5 px-1 sm:max-w-[14rem]`}
      iconClassName="h-6 w-6 shrink-0"
      showLabel
      labelText={labelText}
    />
  );
}
