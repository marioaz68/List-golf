"use client";

import Link from "next/link";
import { useState } from "react";
import type { CategoryRoundCloseCard } from "../lib/categoryRoundCloseStatus";

export type OfficialCategoryCloseLabels = {
  closed: string;
  pending: string;
  complete: string;
  showPendingList: string;
  hidePendingList: string;
  pendingHeading: string;
  captureCta: string;
};

export default function OfficialCategoryClosePanel({
  cards,
  labels,
}: {
  cards: CategoryRoundCloseCard[];
  labels: OfficialCategoryCloseLabels;
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  if (cards.length === 0) return null;

  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const isComplete = card.pending === 0;
        // Permitimos expandir la lista siempre que existan jugadores
        // pendientes — sin tope artificial.
        const canListPending =
          card.pending > 0 && card.pendingPlayers.length > 0;
        const isExpanded = expandedCode === card.categoryCode;

        const pillText = isComplete
          ? `${card.categoryCode}: ${card.closed}/${card.total} ${labels.closed} • ${labels.complete}`
          : `${card.categoryCode}: ${card.closed}/${card.total} ${labels.closed} • ${labels.pending} ${card.pending}`;

        return (
          <div key={card.categoryCode} className="min-w-0">
            {canListPending ? (
              <button
                type="button"
                onClick={() =>
                  setExpandedCode(isExpanded ? null : card.categoryCode)
                }
                className="w-full rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-center text-[11px] font-semibold leading-snug text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/15"
                aria-expanded={isExpanded}
              >
                {pillText}
              </button>
            ) : (
              <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-center text-[11px] font-semibold leading-snug text-cyan-200">
                {pillText}
              </div>
            )}

            {canListPending && isExpanded ? (
              <ul className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-1.5">
                <li className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/40">
                  {labels.pendingHeading}
                </li>
                {card.pendingPlayers.map((p) => (
                  <li key={p.entryId}>
                    <Link
                      href={p.scoreEntryHref}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10px] text-white/90 hover:bg-white/10"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {p.playerNumber != null ? (
                          <span className="mr-1 tabular-nums text-cyan-300">
                            #{p.playerNumber}
                          </span>
                        ) : null}
                        {p.name}
                      </span>
                      <span className="shrink-0 font-semibold text-cyan-300">
                        {labels.captureCta} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
