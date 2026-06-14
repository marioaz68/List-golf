/**
 * /captura/distancias/demo — Simulador para probar el medidor de yardas sin
 * estar en el campo. Recorre los 18 hoyos en orden (por vueltas) con una
 * ubicación simulada y verifica que el green quede arriba y tú abajo, además
 * del acercamiento al avanzar del tee al green.
 */
import { Suspense } from "react";
import DistanciasDemoClient from "./DistanciasDemoClient";

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
      <DistanciasDemoClient />
    </Suspense>
  );
}
