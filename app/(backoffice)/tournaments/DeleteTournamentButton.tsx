"use client";

import { useState, useTransition } from "react";

type Props = {
  tournamentId: string;
  tournamentName: string;
  action: (tournamentId: string) => Promise<void>;
};

export default function DeleteTournamentButton({
  tournamentId,
  tournamentName,
  action,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const ok = window.confirm(
      `¿Borrar definitivamente el torneo "${tournamentName}"?\n\n` +
        "Se eliminarán todas las categorías, rondas, reglas, póster y datos asociados.\n" +
        "Solo se puede borrar si no tiene inscritos. Esta acción no se puede deshacer."
    );
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      try {
        await action(tournamentId);
      } catch (err) {
        const digest =
          typeof err === "object" &&
          err !== null &&
          "digest" in err &&
          typeof (err as { digest?: string }).digest === "string"
            ? (err as { digest: string }).digest
            : "";
        if (digest.startsWith("NEXT_REDIRECT")) {
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Error borrando torneo.";
        setError(msg);
        window.alert(msg);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={error ?? "Borrar torneo (solo si no tiene inscritos)"}
      style={{
        height: 28,
        padding: "0 10px",
        border: "1px solid #991b1b",
        borderRadius: 8,
        background: isPending ? "#fca5a5" : "#dc2626",
        color: "#fff",
        fontSize: 11,
        fontWeight: 800,
        cursor: isPending ? "wait" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {isPending ? "Borrando…" : "Borrar"}
    </button>
  );
}
