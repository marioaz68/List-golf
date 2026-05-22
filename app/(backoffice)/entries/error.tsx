"use client";

import { useEffect } from "react";

export default function EntriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[entries]", error);
  }, [error]);

  return (
    <main className="space-y-3 p-4">
      <h1 className="text-lg font-bold text-white">No se pudo cargar inscritos</h1>
      <p className="text-sm text-slate-300">
        Hubo un error al leer datos del torneo. Recarga la página o vuelve al listado
        de torneos.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-slate-500">Referencia: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          Reintentar
        </button>
        <a
          href="/tournaments"
          className="rounded border border-gray-400 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
        >
          Torneos
        </a>
      </div>
    </main>
  );
}
