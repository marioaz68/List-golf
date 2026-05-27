"use client";

import { useState } from "react";
import type { HandicapCommitteeT } from "./HandicapCommitteeVoter";
import { resetHandicapCommitteeVotes } from "./actions";

type Props = {
  tournamentId: string;
  t: HandicapCommitteeT;
};

export default function ResetCommitteeVotesPanel({ tournamentId, t }: Props) {
  const [expanded, setExpanded] = useState(false);
  const r = t.reset;

  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm font-semibold text-rose-900"
      >
        {expanded ? "▾" : "▸"} {r.toggle}
      </button>

      {expanded ? (
        <form
          action={resetHandicapCommitteeVotes}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">{r.sessionName}</span>
            <input
              type="text"
              name="session_name"
              placeholder={r.sessionNamePh}
              autoComplete="off"
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">{r.notes}</span>
            <input
              type="text"
              name="session_notes"
              placeholder={r.notesPh}
              autoComplete="off"
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">{r.confirmLabel}</span>
            <input
              type="text"
              name="confirm"
              required
              placeholder={r.confirmPh}
              autoComplete="off"
              className="w-40 rounded border border-rose-400 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
          >
            {r.submit}
          </button>

          <p className="basis-full text-[11px] text-rose-900/80">{r.hint}</p>
        </form>
      ) : null}
    </div>
  );
}
