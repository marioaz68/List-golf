"use client";

import { Menu, X } from "lucide-react";
import BrowserBehaviorFix from "@/components/ui/BrowserBehaviorFix";
import { AppLocaleProvider, useAppLocale } from "@/components/i18n/AppLocaleProvider";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import Sidebar from "@/components/layout/Sidebar";
import {
  BackofficeNavProvider,
  useBackofficeNav,
} from "@/components/layout/BackofficeNavContext";
import type { Locale } from "@/lib/i18n/locale";

function MobileBackdrop() {
  const { open, setOpen } = useBackofficeNav();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[35] bg-black/60 backdrop-blur-[1px] md:hidden"
      aria-hidden
      onClick={() => setOpen(false)}
    />
  );
}

function MobileMenuButton() {
  const { open, setOpen } = useBackofficeNav();
  const { t } = useAppLocale();
  return (
    <button
      type="button"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white md:hidden"
      aria-label={open ? t.sidebar.closeMenu : t.sidebar.openMenu}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {open ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
    </button>
  );
}

export default function BackofficeLayoutClient({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <>
      <BrowserBehaviorFix />
      <AppLocaleProvider locale={locale}>
        <BackofficeNavProvider>
          <div className="flex min-h-screen overflow-hidden bg-[#0F1720] text-white">
            <MobileBackdrop />
            <Sidebar />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#141c26] px-3 py-2 sm:px-4">
                <MobileMenuButton />
                <div className="flex min-w-0 flex-1 justify-end">
                  <LanguageToggle />
                </div>
              </header>

              <main className="min-h-0 flex-1 overflow-auto overscroll-x-none p-4 md:p-6">
                {children}
              </main>
            </div>
          </div>
        </BackofficeNavProvider>
      </AppLocaleProvider>
    </>
  );
}
