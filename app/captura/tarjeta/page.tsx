import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { loadGroupCapture } from "@/lib/captura/loadGroupCapture";
import TarjetaCaptureClient from "./TarjetaCaptureClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TarjetaPage({
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

  return <TarjetaCaptureClient initial={data} />;
}
