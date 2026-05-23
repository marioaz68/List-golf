"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[listgolf] root error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#08111f] px-4 py-12 text-white">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <h1 className="text-lg font-semibold">No pudimos cargar esta página</h1>
        <p className="mt-3 text-sm text-slate-300">
          Ocurrió un error en el servidor. Si acabas de desplegar, revisa las
          variables de entorno en Vercel y que las migraciones de Supabase estén
          aplicadas.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-slate-500">
            Digest: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#08111f]"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
