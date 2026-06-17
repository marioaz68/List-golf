/**
 * /captura/distancias/demo — Yardas en modo demo (sin GPS ni límite de 300 m).
 * Misma UI que en campo: bolsa, tap en mapa, sugerencia de bastón.
 */
import { Suspense } from "react";
import DistanciasClient from "../DistanciasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DistanciasDemoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
          Cargando…
        </div>
      }
    >
      <DistanciasClient demoMode />
    </Suspense>
  );
}
