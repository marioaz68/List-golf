"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Smartphone } from "lucide-react";
import { messages } from "@/lib/i18n/messages";
import { readLocaleFromDocumentCookie, type Locale } from "@/lib/i18n/locale";
import {
  detectInstallPlatform,
  type InstallPlatform,
} from "@/lib/install/detectInstallPlatform";
import {
  InstallGuideIllustration,
  type InstallVisualId,
} from "./InstallGuideIllustrations";

type BeforeInstallPromptLike = {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

type GuideKey =
  | "ios"
  | "android"
  | "macSafari"
  | "macChrome"
  | "macOther"
  | "desktopChrome"
  | "desktopOther";

const PLATFORM_TO_GUIDE: Record<InstallPlatform, GuideKey> = {
  ios: "ios",
  android: "android",
  "mac-safari": "macSafari",
  "mac-chrome": "macChrome",
  "mac-other": "macOther",
  "desktop-chrome": "desktopChrome",
  "desktop-other": "desktopOther",
};

const ALL_GUIDE_KEYS: GuideKey[] = [
  "ios",
  "android",
  "macSafari",
  "macChrome",
  "macOther",
  "desktopChrome",
  "desktopOther",
];

type GuideStep = {
  text: string;
  visual: InstallVisualId;
  highlight?: string;
};

type GuideBlock = {
  title: string;
  note: string;
  steps: GuideStep[];
};

function InstallGuideSection({
  title,
  note,
  steps,
}: {
  title: string;
  note: string;
  steps: GuideStep[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-cyan-200">{title}</h3>
        <p className="mt-1 text-xs leading-snug text-amber-50/90">{note}</p>
      </div>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={`${step.visual}-${index}`} className="list-none space-y-2">
            <p className="text-sm text-slate-200">
              <span className="mr-1.5 font-bold text-cyan-300">{index + 1}.</span>
              {step.text}
            </p>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/80 p-2">
              <InstallGuideIllustration
                id={step.visual}
                highlightLabel={step.highlight}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function guideForLocale(locale: Locale, key: GuideKey): GuideBlock {
  const g = messages[locale].publicInstall[key];
  return {
    title: g.title,
    note: g.note,
    steps: g.steps.map((s) => ({
      text: s.text,
      visual: s.visual as InstallVisualId,
      highlight: "highlight" in s ? s.highlight : undefined,
    })),
  };
}

export function PublicInstallShortcut({ locale }: { locale: Locale }) {
  const titleId = useId();
  const [uiLocale, setUiLocale] = useState<Locale>(locale);
  const [open, setOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop-other");
  const [deferred, setDeferred] = useState<BeforeInstallPromptLike | null>(null);

  const t = messages[uiLocale].publicInstall;

  const primaryGuideKey = PLATFORM_TO_GUIDE[platform];
  const primaryGuide = useMemo(
    () => guideForLocale(uiLocale, primaryGuideKey),
    [uiLocale, primaryGuideKey]
  );

  const otherGuides = useMemo(
    () =>
      ALL_GUIDE_KEYS.filter((k) => k !== primaryGuideKey).map((k) => ({
        key: k,
        ...guideForLocale(uiLocale, k),
      })),
    [uiLocale, primaryGuideKey]
  );

  useEffect(() => {
    setUiLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setPlatform(detectInstallPlatform(navigator.userAgent));
    }
  }, []);

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

  function handleOpenModal() {
    setUiLocale(readLocaleFromDocumentCookie());
    if (typeof navigator !== "undefined") {
      setPlatform(detectInstallPlatform(navigator.userAgent));
    }
    setShowOthers(false);
    setOpen(true);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 px-1.5 py-1">
        <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:inline">
          {t.rowLabel}
        </span>
        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex max-w-[11rem] items-center gap-1 rounded-md border border-white/15 bg-slate-800/80 px-2 py-1 text-[10px] font-bold leading-none text-slate-200 transition hover:bg-slate-700 sm:max-w-[13rem]"
          aria-label={t.aria}
        >
          <Smartphone className="h-3 w-3 shrink-0 text-cyan-300" aria-hidden />
          <span className="truncate">{t.button}</span>
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1526] p-4 text-white shadow-2xl sm:p-5"
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

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.stepsLead}
            </p>

            <div className="mt-3">
              <InstallGuideSection
                title={primaryGuide.title}
                note={primaryGuide.note}
                steps={primaryGuide.steps}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-left text-xs font-semibold text-slate-300 transition hover:bg-slate-800/80"
            >
              {t.otherDevices}
              <span aria-hidden>{showOthers ? "▴" : "▾"}</span>
            </button>

            {showOthers ? (
              <div className="mt-4 space-y-6 border-t border-white/10 pt-4">
                {otherGuides.map((g) => (
                  <InstallGuideSection
                    key={g.key}
                    title={g.title}
                    note={g.note}
                    steps={g.steps}
                  />
                ))}
              </div>
            ) : null}

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