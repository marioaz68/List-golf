import { UserNavIconLink } from "@/components/public/UserNavIconLink";
import { resolveUserDisplayName } from "@/lib/auth/resolveUserDisplayName";
import { messages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

/** Estilo base del «chip» de usuario (icono + texto) en la esquina superior derecha. */
const baseChipClass =
  "inline-flex h-10 shrink-0 items-center justify-start gap-1.5 rounded-lg border px-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";

/** Logueado: chip neutro con fondo y borde sutil, claramente clickeable. */
const userChipClass = `${baseChipClass} max-w-[14rem] border-white/15 bg-white/10 text-white hover:bg-white/20 sm:max-w-[18rem]`;

/** Visitante: chip cyan (CTA) para invitar a entrar. */
const guestChipClass = `${baseChipClass} border-cyan-300/60 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25`;

export async function PublicUserNavIcon() {
  const locale = await getLocale();
  const nav = messages[locale].nav;
  const pub = messages[locale].publicTournament;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { displayName, email } = await resolveUserDisplayName(
        supabase,
        user
      );
      return (
        <UserNavIconLink
          href="/tournaments"
          label={pub.adminList}
          title={email}
          className={userChipClass}
          iconClassName="h-5 w-5 text-cyan-300"
          showLabel
          labelText={displayName}
        />
      );
    }
  } catch {
    // Si Supabase falla, mostramos «Entrar» igualmente para no perder el acceso.
  }

  return (
    <UserNavIconLink
      href="/login"
      label={nav.enter}
      className={guestChipClass}
      iconClassName="h-5 w-5"
      showLabel
      labelText={nav.enter}
    />
  );
}
