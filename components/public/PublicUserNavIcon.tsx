import { UserNavIconLink } from "@/components/public/UserNavIconLink";
import { messages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

/** Icono de usuario sin fondo ni borde (esquina superior derecha en páginas públicas). */
export const userNavIconOnlyClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-200 transition hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";

/** Primer nombre (sin apellidos) a partir de un texto. */
function firstNameOnly(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  return firstToken.trim() || null;
}

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

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("id", user.id)
      .maybeSingle();

    displayName =
      firstNameOnly(profile?.first_name) ??
      firstNameOnly(
        typeof user.user_metadata?.first_name === "string"
          ? user.user_metadata.first_name
          : null
      ) ??
      firstNameOnly(
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null
      ) ??
      firstNameOnly(user.email?.split("@")[0] ?? null);
  }

  return (
    <UserNavIconLink
      href={href}
      label={label}
      className={`${userNavIconOnlyClass} max-w-[11rem] gap-1.5 px-1 sm:max-w-[14rem]`}
      iconClassName="h-6 w-6 shrink-0"
      showLabel
      labelText={user ? displayName ?? "Admin" : nav.enter}
    />
  );
}
