"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setUserLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";

export function PublicLanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = messages[locale];

  function pick(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  const btn = (code: Locale, label: string) => (
    <button
      key={code}
      type="button"
      disabled={pending}
      onClick={() => pick(code)}
      className={`rounded-md px-2 py-1 text-[10px] font-bold leading-none transition ${
        locale === code
          ? "bg-emerald-500 text-white shadow-sm"
          : "border border-white/15 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
      } ${pending ? "opacity-50" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 px-1.5 py-1">
      <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
        {t.language.label}
      </span>
      <div className="inline-flex gap-0.5">
        {btn("es", t.language.es)}
        {btn("en", t.language.en)}
      </div>
    </div>
  );
}
