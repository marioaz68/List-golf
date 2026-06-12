/**
 * /captura/calibrar — Mini App de calibración del campo (solo personal
 * autorizado). Captura GPS en sitio para mover entrada/centro/atrás del green
 * y marcar trampas/obstáculos. Se abre desde el comando /CALIBRAR en Telegram.
 */
import { Suspense } from "react";
import Link from "next/link";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import CalibrarClient from "./CalibrarClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

export default async function CalibrarPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tg = typeof sp.tg === "string" ? sp.tg.trim() : "";

  if (!isCalibrationAllowed(tg)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-3 text-lg font-bold text-amber-200">
          Acceso restringido
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          La calibración del campo es solo para personal autorizado. Ábrela
          desde el comando <strong>/CALIBRAR</strong> en el bot de Telegram con
          tu cuenta autorizada.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
        >
          Volver
        </Link>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
          Cargando…
        </div>
      }
    >
      <CalibrarClient tg={tg} />
    </Suspense>
  );
}
