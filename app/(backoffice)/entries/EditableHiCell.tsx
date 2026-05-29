"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEntryHandicapIndexInline } from "./actions";

type Props = {
  entryId: string;
  tournamentId: string;
  initialHi: number | null;
  compact?: boolean;
};

function parseHi(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function EditableHiCell({
  entryId,
  tournamentId,
  initialHi,
  compact = false,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<string>(
    initialHi == null ? "" : String(initialHi)
  );
  const [savedHi, setSavedHi] = useState<number | null>(initialHi);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = parseHi(value);
    if (next === null) {
      setValue(savedHi == null ? "" : String(savedHi));
      setError(null);
      return;
    }
    if (savedHi != null && Math.abs(next - savedHi) < 1e-9) {
      setError(null);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", entryId);
        fd.set("tournament_id", tournamentId);
        fd.set("handicap_index", String(next));
        await updateEntryHandicapIndexInline(fd);
        setSavedHi(next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        setValue(savedHi == null ? "" : String(savedHi));
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue(savedHi == null ? "" : String(savedHi));
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={pending}
        className={
          compact
            ? "h-6 w-14 rounded border border-gray-300 bg-white px-1 text-right font-mono text-[11px] tabular-nums text-gray-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            : "h-6 w-14 rounded border border-gray-300 bg-white px-1 text-right font-mono text-[11px] tabular-nums text-gray-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
        }
        title={
          error
            ? error
            : "HI editable — al guardar, CH y PH del torneo se recalculan automáticamente."
        }
      />
      {pending ? (
        <span className="text-[9px] text-slate-500">…</span>
      ) : error ? (
        <span
          className="text-[9px] font-semibold text-red-600"
          title={error}
        >
          !
        </span>
      ) : null}
    </span>
  );
}
