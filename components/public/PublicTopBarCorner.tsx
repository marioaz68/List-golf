import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { PublicLanguageToggle } from "@/components/i18n/PublicLanguageToggle";
import { PublicUserNavIcon } from "@/components/public/PublicUserNavIcon";
import type { Locale } from "@/lib/i18n/locale";

/** Restaurante + idioma + icono de usuario, alineados arriba a la derecha. */
export function PublicTopBarCorner({ locale }: { locale: Locale }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link
        href="/restaurante"
        className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-slate-800/80 px-2 py-1 text-[10px] font-bold leading-none text-slate-200 transition hover:bg-slate-700"
        aria-label={locale === "en" ? "Restaurant menu" : "Menú del restaurante"}
      >
        <UtensilsCrossed className="h-3 w-3 shrink-0 text-amber-300" aria-hidden />
        <span className="hidden sm:inline">
          {locale === "en" ? "Restaurant" : "Restaurante"}
        </span>
      </Link>
      <PublicLanguageToggle locale={locale} />
      <PublicUserNavIcon />
    </div>
  );
}
