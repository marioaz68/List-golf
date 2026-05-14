"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setUserLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/locale";
import { useAppLocale } from "./AppLocaleProvider";

export default function LanguageToggle() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { locale, t } = useAppLocale();

  function pick(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  const btn = (code: Locale, label: string) => {
    const isActive = locale === code;
    const ariaLabel =
      code === "es"
        ? isActive
          ? t.language.ariaEsActive
          : t.language.ariaEsInactive
        : isActive
          ? t.language.ariaEnActive
          : t.language.ariaEnInactive;

    return (
      <button
        key={code}
        type="button"
        disabled={pending}
        onClick={() => pick(code)}
        aria-label={ariaLabel}
        aria-pressed={isActive}
        className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
          isActive
            ? "bg-[#63BC46] text-black shadow-sm"
            : "text-white/70 hover:bg-white/10"
        } ${pending ? "opacity-50" : ""}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 sm:inline">
        {t.language.label}
      </span>
      <div className="inline-flex rounded-lg border border-white/10 bg-black/25 p-0.5">
        {btn("es", t.language.es)}
        {btn("en", t.language.en)}
      </div>
    </div>
  );
}
