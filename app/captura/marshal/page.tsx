/**
 * /captura/marshal — Mini app para marshals: capturas retrasadas + resultados en vivo.
 *
 * Acceso: perfil con rol marshal vinculado por /soy_marshal (telegram_chat_id en ?tg=).
 */
import { Suspense } from "react";
import Link from "next/link";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { resolveMarshal } from "@/lib/marshal/resolveMarshal";
import { loadMarshalOpsData } from "@/lib/marshal/loadMarshalOpsData";
import MarshalOpsClient from "./MarshalOpsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

function getParam(sp: SP, key: string): string {
  const value = sp[key];
  return String(Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default async function MarshalPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tg = getParam(sp, "tg");
  const tournamentId = getParam(sp, "tournament_id");
  const tabParam = getParam(sp, "tab");
  const initialTab =
    tabParam === "ritmo" || tabParam === "resultados" || tabParam === "capturas"
      ? tabParam
      : "capturas";

  const admin = tryCreateAdminClient();
  const marshal = admin && tg ? await resolveMarshal(admin, tg) : null;

  if (!marshal || !admin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
        <div className="text-5xl">🧑‍⚖️</div>
        <h1 className="mt-3 text-lg font-bold text-amber-200">
          Acceso restringido
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          El panel marshal es solo para jueces de campo autorizados. Vincula tu
          cuenta con <strong>/soy_marshal tu_email</strong> en el bot de Telegram
          y abre con <strong>/MARSHAL</strong>.
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

  const initial = await loadMarshalOpsData(admin, marshal, tournamentId || null);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-400">
          Cargando…
        </div>
      }
    >
      <MarshalOpsClient
        tg={tg}
        initial={initial}
        initialTournamentId={tournamentId || initial.selectedTournamentId}
        initialTab={initialTab as "capturas" | "ritmo" | "resultados"}
      />
    </Suspense>
  );
}
