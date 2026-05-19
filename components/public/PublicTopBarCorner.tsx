import { PublicLanguageToggle } from "@/components/i18n/PublicLanguageToggle";
import { PublicUserNavIcon } from "@/components/public/PublicUserNavIcon";
import type { Locale } from "@/lib/i18n/locale";

/** Idioma + icono de usuario, alineados arriba a la derecha. */
export function PublicTopBarCorner({ locale }: { locale: Locale }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <PublicLanguageToggle locale={locale} />
      <PublicUserNavIcon />
    </div>
  );
}
