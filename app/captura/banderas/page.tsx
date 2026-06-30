/**
 * /captura/banderas — Mini app del encargado de banderas (respaldo / ajuste).
 *
 * Captura principal es por GPS desde Telegram (/BANDERA N + compartir
 * ubicación). Esta pantalla es para AJUSTAR el pin en el mapa satélite si la
 * posición del GPS no quedó bien, o para capturar manualmente.
 *
 * Acceso: solo perfiles con rol flag_keeper, identificados por ?tg= (su
 * telegram_user_id, que el bot guardó en profiles.telegram_chat_id).
 */
import { Suspense } from "react";
import Link from "next/link";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { resolveFlagKeeper } from "@/lib/flags/flagStore";
import BanderasClient from "./BanderasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

export default async function BanderasPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tg = typeof sp.tg === "string" ? sp.tg.trim() : "";
  const holeParam = typeof sp.hole === "string" ? Number(sp.hole) : NaN;
  const initialHole =
    Number.isInteger(holeParam) && holeParam >= 1 && holeParam <= 18
      ? holeParam
      : 1;

  const admin = tryCreateAdminClient();
  const keeper = admin && tg ? await resolveFlagKeeper(admin, tg) : null;

  if (!keeper) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
        <div className="text-5xl">🚩</div>
        <h1 className="mt-3 text-lg font-bold text-amber-200">
          Acceso restringido
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          El registro de banderas es solo para el encargado autorizado. Ábrelo
          desde el comando <strong>/BANDERAS</strong> en el bot de Telegram con
          tu cuenta vinculada (<strong>/soy_banderas tu_email</strong>).
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
      <BanderasClient tg={tg} keeperName={keeper.name} initialHole={initialHole} />
    </Suspense>
  );
}
