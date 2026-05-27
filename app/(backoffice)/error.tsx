"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function BackofficeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[backoffice] error boundary", {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  const message = error.message || "Sin mensaje.";

  return (
    <div className="space-y-4 p-4 text-white md:p-6">
      <h1 className="text-xl font-semibold text-red-300">
        Error en esta sección del backoffice
      </h1>
      <p className="text-sm text-slate-300">
        La barra lateral sigue disponible. Puedes reintentar o ir a otra pantalla.
      </p>
      <dl className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
        {error.digest ? (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-400">Digest</dt>
            <dd className="font-mono text-slate-200">{error.digest}</dd>
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <dt className="w-20 shrink-0 text-slate-400">Mensaje</dt>
          <dd className="break-words text-slate-200">{message}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#08111f]"
        >
          Reintentar
        </button>
        <Link
          href="/tournaments"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
        >
          Ir a torneos
        </Link>
      </div>
    </div>
  );
}
