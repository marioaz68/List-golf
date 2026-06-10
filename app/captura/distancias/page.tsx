/**
 * /captura/distancias — Mini App pública (sin auth) con mapa satélite del CCQ,
 * yardas al green (frente/centro/fondo), puntos de referencia y medición al tocar.
 */
import { Suspense } from "react";
import DistanciasClient from "./DistanciasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DistanciasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
          Cargando…
        </div>
      }
    >
      <DistanciasClient />
    </Suspense>
  );
}
