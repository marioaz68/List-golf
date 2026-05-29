/**
 * Captura rápida del grupo (4 jugadores) en formato tabla horizontal
 * — mismo estilo que la EditableScorecard del backoffice (VENT / HOYO /
 * PAR / SCORE) pero con 4 filas (una por jugador) más una sección de
 * desempate (P1-P9) cuando el torneo es match play y el match queda
 * empatado al 18.
 *
 * Es público (no requiere login) para que el flujo desde el bot de
 * Telegram también pueda apuntar aquí.
 */
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { loadGroupCapture } from "@/lib/captura/loadGroupCapture";
import GrupoCaptureClient from "./GrupoCaptureClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GrupoCapturaPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const rawGroupId = params.group_id;
  const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId ?? "";
  const rawMe = params.me;
  const meEntryId = Array.isArray(rawMe) ? rawMe[0] : rawMe ?? "";
  const rawCaddie = params.caddie;
  const caddieId = Array.isArray(rawCaddie) ? rawCaddie[0] : rawCaddie ?? "";

  if (!groupId.trim()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-sm text-slate-600">
        Falta <code className="mx-1 rounded bg-white px-1">group_id</code> en la
        URL.
      </div>
    );
  }

  const admin = tryCreateAdminClient();
  const supabase = admin ?? (await createClient());
  const data = await loadGroupCapture(supabase, groupId, {
    meEntryId: meEntryId.trim() || null,
    caddieId: caddieId.trim() || null,
  });

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-sm text-slate-600">
        No encontré el grupo indicado.
      </div>
    );
  }

  return <GrupoCaptureClient initial={data} />;
}
