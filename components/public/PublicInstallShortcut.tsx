"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import { messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

type BeforeInstallPromptLike = {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

function isPublicPath(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return pathname.startsWith("/torneos/");
}

export function PublicInstallShortcut({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const titleId = useId();
  const t = messages[locale].publicInstall;
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptLike | null>(
    null
  );

  useEffect(() => {
    const onBip = (e: Event) => {
      const ev = e as unknown as BeforeInstallPromptLike;
      ev.preventDefault?.();
      setDeferred(ev);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tryInstall = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setOpen(false);
    }
  }, [deferred]);

  if (!isPublicPath(pathname)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 top-[4.75rem] z-40 flex max-w-[min(100vw-1.5rem,14rem)] items-center gap-1.5 rounded-full border border-white/15 bg-[#0c1728]/95 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm transition hover:border-cyan-400/40 hover:bg-[#0f1d32] sm:top-[5.25rem] sm:text-xs"
        aria-label={t.aria}
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
        <span className="truncate leading-tight">{t.button}</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1526] p-4 text-white shadow-2xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-white">
              {t.title}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{t.intro}</p>

            {deferred ? (
              <button
                type="button"
                onClick={() => void tryInstall()}
                className="mt-4 w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-semibold text-[#08111f] transition hover:bg-cyan-300"
              >
                {t.installNow}
              </button>
            ) : null}

            <div className="mt-4 space-y-4 text-sm text-slate-200">
              <div>
                <p className="font-semibold text-cyan-200">{t.iosTitle}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-300">
                  {t.iosSteps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="font-semibold text-cyan-200">{t.androidTitle}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-300">
                  {t.androidSteps.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              {t.close}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
