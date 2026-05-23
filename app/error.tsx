"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("[listgolf] root error", {
      pathname,
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, pathname]);

  const message = error.message || "Sin mensaje.";

  return (
    <main className="min-h-screen bg-[#08111f] px-4 py-12 text-white">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-lg font-semibold text-white">
          No pudimos cargar esta página
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          Ocurrió un error en el servidor mientras renderizábamos esta vista.
          Puedes reintentar o regresar al inicio.
        </p>

        <dl className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
          {pathname ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-400">Ruta</dt>
              <dd className="break-all font-mono text-slate-200">{pathname}</dd>
            </div>
          ) : null}
          {error.digest ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-slate-400">Digest</dt>
              <dd className="font-mono text-slate-200">{error.digest}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-400">Mensaje</dt>
            <dd className="break-words text-slate-200">{message}</dd>
          </div>
        </dl>

        <details
          className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-400"
          open={showDetails}
          onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-cyan-300">
            Stack técnico
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px]">
            {error.stack ?? "(sin stack)"}
          </pre>
        </details>

        <div className="mt-6 flex flex-wrap gap-3">
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
          <Link
            href="/tournaments"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Ir a torneos
          </Link>
        </div>
      </div>
    </main>
  );
}
