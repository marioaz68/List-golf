"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Locale } from "@/lib/i18n/locale";
import { messages, type AppMessages } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  t: AppMessages;
};

const AppLocaleContext = createContext<LocaleContextValue | null>(null);

export function AppLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: messages[locale] }),
    [locale]
  );

  return (
    <AppLocaleContext.Provider value={value}>
      {children}
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale() {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) {
    throw new Error("useAppLocale must be used within AppLocaleProvider");
  }
  return ctx;
}
