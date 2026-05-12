import Sidebar from "@/components/layout/Sidebar";
import BrowserBehaviorFix from "@/components/ui/BrowserBehaviorFix";
import { AppLocaleProvider } from "@/components/i18n/AppLocaleProvider";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import { getLocale } from "@/lib/i18n/server";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <>
      <BrowserBehaviorFix />

      <AppLocaleProvider locale={locale}>
        <div className="flex min-h-screen overflow-hidden bg-[#0F1720] text-white">
          <Sidebar />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-center justify-end gap-3 border-b border-white/10 bg-[#141c26] px-4 py-2">
              <LanguageToggle />
            </header>

            <main className="min-h-0 flex-1 overflow-auto overscroll-x-none p-6">
              {children}
            </main>
          </div>
        </div>
      </AppLocaleProvider>
    </>
  );
}
