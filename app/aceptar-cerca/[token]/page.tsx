import type { Metadata } from "next";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadPlayerAcceptByToken } from "@/lib/cercanos/loadPlayerAccept";
import AcceptNearClient from "./AcceptNearClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { token: string };

export async function generateMetadata(props: {
  params: Promise<Params> | Params;
}): Promise<Metadata> {
  return {
    title: "Aceptar distancia · Más cerca",
    description: "Confirma la distancia en el par 3 (más cerca de la bandera).",
    robots: { index: false, follow: false },
  };
}

export default async function AcceptNearPage(props: {
  params: Promise<Params> | Params;
}) {
  const params = await Promise.resolve(props.params);
  const token = String(params.token ?? "").trim();
  const admin = createAdminClient();
  const view = token ? await loadPlayerAcceptByToken(admin, token) : null;

  return (
    <div className="min-h-screen bg-[#08111f] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        {!view ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <h1 className="text-xl font-black">Enlace no válido</h1>
            <p className="mt-2 text-sm text-slate-400">
              Pide al capturista el QR o link actualizado de tu distancia.
            </p>
          </div>
        ) : (
          <AcceptNearClient view={view} />
        )}
      </div>
    </div>
  );
}
