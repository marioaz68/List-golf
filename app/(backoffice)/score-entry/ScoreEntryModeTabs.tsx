"use client";

import Link from "next/link";
import type { ScoreEntryMode } from "@/lib/score-entry/scoreEntryUrl";

type Props = {
  active: ScoreEntryMode;
  captureHref: string;
  modifyHref: string;
  labels: {
    capture: string;
    modify: string;
    aria: string;
  };
};

export default function ScoreEntryModeTabs({
  active,
  captureHref,
  modifyHref,
  labels,
}: Props) {
  return (
    <nav
      className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 pb-0"
      aria-label={labels.aria}
    >
      {(
        [
          { mode: "capture" as const, href: captureHref, label: labels.capture },
          { mode: "modify" as const, href: modifyHref, label: labels.modify },
        ] as const
      ).map((tab) => {
        const selected = active === tab.mode;
        return (
          <Link
            key={tab.mode}
            href={tab.href}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={`rounded-t-lg border px-4 py-2.5 text-sm font-semibold transition ${
              selected
                ? "border-gray-200 border-b-white bg-white text-gray-900 shadow-sm"
                : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
