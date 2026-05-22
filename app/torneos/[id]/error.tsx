"use client";

import { useEffect } from "react";

export default function PublicTournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[torneo público]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#08111f] px-4 text-center text-white">
      <h1 className="text-xl font-bold">No se pudo cargar el torneo</h1>
      <p className="mt-3 max-w-md text-sm text-slate-300">
        Hubo un error al mostrar esta página. Recarga o vuelve al inicio.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-slate-500">
          Referencia: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#08111f]"
        >
          Reintentar
        </button>
        <a
          href="/"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Inicio
        </a>
      </div>
    </div>
  );
}
