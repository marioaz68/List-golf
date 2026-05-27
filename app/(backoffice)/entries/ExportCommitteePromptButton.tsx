"use client";

import { useState, useTransition } from "react";
import { exportCommitteePromptMarkdown } from "./actions";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Empaqueta el prompt (texto plano / markdown) como un .doc compatible con
 * Microsoft Word. macOS asocia .doc con Word, así que al hacer doble click
 * en el archivo descargado se abre en Word listo para Cmd+A → Cmd+C y pegar
 * en el chat de Claude.
 */
function buildWordDocumentHtml(title: string, content: string): string {
  const safeTitle = escapeHtml(title);
  const safeContent = escapeHtml(content);
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: Letter; margin: 1.5cm; }
  body { font-family: "Consolas", "Menlo", "Courier New", monospace; font-size: 10pt; color: #111; }
  pre  { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: inherit; margin: 0; }
  h1   { font-family: Calibri, Arial, sans-serif; font-size: 16pt; color: #1f2d5a; margin: 0 0 12pt; }
  .meta { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #555; margin: 0 0 18pt; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
<p class="meta">Generado por List.golf · pega este contenido completo en Claude (Cmd+A, Cmd+C).</p>
<pre>${safeContent}</pre>
</body>
</html>`;
}

function downloadWordDoc(filename: string, content: string) {
  const html = buildWordDocumentHtml(filename.replace(/\.doc$/i, ""), content);
  const blob = new Blob(["\uFEFF", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        const wordFilename = filename.replace(/\.md$/i, ".doc");
        downloadWordDoc(wordFilename, markdown);
        try {
          await navigator.clipboard.writeText(markdown);
          setFeedback(
            "Word descargado · prompt también copiado al portapapeles."
          );
        } catch {
          setFeedback(
            "Word descargado (no se pudo copiar al portapapeles)."
          );
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
        title="Descarga el prompt como archivo Word (.doc). Ábrelo desde Descargas con doble clic, selecciona todo (Cmd+A) y pega en Claude."
        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-indigo-700 bg-indigo-600 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
      >
        <span aria-hidden>📝</span>
        {pending
          ? "Generando Word…"
          : `Exportar prompt Word (${flaggedCount})`}
      </button>
      {feedback ? (
        <span className="text-[10px] font-medium text-indigo-800">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
