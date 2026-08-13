"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HandicapCommitteeT } from "./HandicapCommitteeVoter";
import {
  resetHandicapCommitteeVotesAction,
  type ResetCommitteeVotesState,
} from "./actions";

type Props = {
  tournamentId: string;
  t: HandicapCommitteeT;
};

const initialState: ResetCommitteeVotesState = {
  error: null,
  archived: false,
  sessionName: null,
  nPlayers: 0,
  nVotes: 0,
};

export default function ResetCommitteeVotesPanel({ tournamentId, t }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState(
    resetHandicapCommitteeVotesAction,
    initialState
  );
  const r = t.reset;

  useEffect(() => {
    if (!state.archived) return;
    router.refresh();
  }, [state.archived, state.sessionName, state.nPlayers, state.nVotes, router]);

  const successMsg =
    state.archived && state.sessionName
      ? r.successArchived
          .replace("{name}", state.sessionName)
          .replace("{n}", String(state.nPlayers))
          .replace("{m}", String(state.nVotes))
      : null;

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
        <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tournament_id" value={tournamentId} />

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">{r.sessionName}</span>
            <input
              type="text"
              name="session_name"
              placeholder={r.sessionNamePh}
              autoComplete="off"
              disabled={pending}
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:opacity-60"
            />
          </label>

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">{r.notes}</span>
            <input
              type="text"
              name="session_notes"
              placeholder={r.notesPh}
              autoComplete="off"
              disabled={pending}
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:opacity-60"
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
              disabled={pending}
              className="w-40 rounded border border-rose-400 bg-white px-2 py-1 text-sm text-slate-900 disabled:opacity-60"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? r.archiving : r.submit}
          </button>

          <p className="basis-full text-[11px] text-rose-900/80">{r.hint}</p>
          {state?.error ? (
            <p
              role="alert"
              className="basis-full rounded border border-rose-600 bg-rose-100 px-2 py-1.5 text-xs font-semibold text-rose-950"
            >
              {state.error}
            </p>
          ) : null}
          {successMsg ? (
            <p
              role="status"
              className="basis-full rounded border border-emerald-600 bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-950"
            >
              {successMsg}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
