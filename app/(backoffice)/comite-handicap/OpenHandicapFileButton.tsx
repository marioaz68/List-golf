"use client";

import { useState, useTransition } from "react";
import { getPlayerHandicapFileSignedUrl } from "../players/handicap-files/actions";

type Props = {
  playerId: string;
  hasFile: boolean;
  compact?: boolean;
};

export default function OpenHandicapFileButton({
  playerId,
  hasFile,
  compact = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!hasFile) return null;

  function open() {
    setErr(null);
    startTransition(async () => {
      const res = await getPlayerHandicapFileSignedUrl(playerId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className={compact ? "shrink-0" : "w-full"}>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className={
          compact
            ? "inline-flex h-8 shrink-0 items-center justify-center rounded border border-indigo-700 bg-indigo-600 px-2 text-[10px] font-bold text-white disabled:opacity-50"
            : "w-full rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        }
      >
        {pending ? "Abriendo…" : "📄 Ver reporte GHIN"}
      </button>
      {err ? (
        <p className="mt-1 text-[10px] text-rose-700">{err}</p>
      ) : null}
    </div>
  );
}
