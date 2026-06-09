/**
 * /captura/mis-rondas?u=<telegram_user_id>
 *
 * Mini App pública (sin auth de backoffice) que muestra al socio:
 *   - Su HI del club calculado con WHS (mejores 8 de últimos 20 diferenciales)
 *   - Lista de rondas pasadas: fecha, torneo, score, diferencial
 *   - Detalle hoyo por hoyo al expandir
 *
 * Se accede vía link desde el bot Telegram (comando /RONDAS).
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadPlayerRoundsByTelegram } from "@/lib/handicap/loadPlayerRounds";
import { computeHandicapIndex } from "@/lib/handicap/whsDifferential";
import MisRondasClient from "./MisRondasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ u?: string; player?: string }>;
}

export default async function MisRondasPage({ searchParams }: Props) {
  const sp = await searchParams;
  const telegramUserId = sp.u?.trim() ?? null;

  if (!telegramUserId) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
        <h1 className="text-xl font-bold">⛳ Mis rondas</h1>
        <p className="mt-2 text-sm text-slate-400">
          Esta pantalla se abre desde el bot de Telegram con el comando{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">/RONDAS</code>.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          Si llegaste aquí por accidente, escríbele /RONDAS al bot{" "}
          <code>@ListGolfBot</code>.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  const data = await loadPlayerRoundsByTelegram(admin, telegramUserId, {
    limit: 40,
  });

  if (!data.player) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
        <h1 className="text-xl font-bold">⛳ Mis rondas</h1>
        <p className="mt-2 text-sm text-amber-300">
          Tu Telegram no está vinculado a un jugador. Pide al comité que te
          asocie tu ID en la pantalla de jugadores.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          ID Telegram detectado:{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">
            {telegramUserId}
          </code>
        </p>
      </div>
    );
  }

  // HI estilo WHS — usa los diferenciales válidos disponibles
  const diffs = data.rounds
    .filter(
      (r) =>
        r.differential != null &&
        r.isLocked && // solo tarjetas cerradas
        r.thru === 18 // solo 18 hoyos
    )
    .map((r) => r.differential!) as number[];
  const hiInfo = computeHandicapIndex(diffs);

  return (
    <MisRondasClient
      player={data.player}
      rounds={data.rounds}
      hiInfo={hiInfo}
    />
  );
}
