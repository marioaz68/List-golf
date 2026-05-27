"use client";

import { useState, useTransition } from "react";
import { exportCommitteePromptMarkdown } from "./actions";

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportCommitteePromptButton({
  tournamentId,
  flaggedCount,
}: {
  tournamentId: string;
  flaggedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleExport() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const { markdown, filename, count } =
          await exportCommitteePromptMarkdown(tournamentId);
        if (count === 0) {
          alert(
            "No hay jugadores marcados para revisión en este torneo.\n\nUsa «→ Comité HI» en cada inscrito primero."
          );
          return;
        }
        downloadMarkdown(filename, markdown);
        try {
          await navigator.clipboard.writeText(markdown);
          setFeedback("Descargado y copiado al portapapeles.");
        } catch {
          setFeedback("Descargado (no se pudo copiar al portapapeles).");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al generar el archivo";
        alert(msg);
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-0.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        title="Genera el instructivo .md con GHIN y nombre de cada jugador marcado, para pegar en Claude"
        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-indigo-700 bg-indigo-600 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
      >
        <span aria-hidden>📋</span>
        {pending
          ? "Generando…"
          : `Exportar prompt comité (${flaggedCount})`}
      </button>
      {feedback ? (
        <span className="text-[10px] font-medium text-indigo-800">{feedback}</span>
      ) : null}
    </div>
  );
}
