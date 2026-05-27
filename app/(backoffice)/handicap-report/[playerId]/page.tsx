import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

type Props = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ return?: string }>;
};

function safeReturnUrl(raw: string | undefined): string {
  const fallback = "/comite-handicap";
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export const dynamic = "force-dynamic";

export default async function HandicapReportViewerPage({
  params,
  searchParams,
}: Props) {
  const { playerId } = await params;
  const { return: returnParam } = await searchParams;
  const back = safeReturnUrl(returnParam);

  const supabase = await createClient();
  const { data: player } = await supabase
    .from("players")
    .select("first_name, last_name, ghin_number")
    .eq("id", playerId)
    .maybeSingle();

  const fullName =
    [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim() ||
    "Jugador";
  const ghin = (player?.ghin_number ?? null) as string | null;

  const reportSrc = `/api/players/${encodeURIComponent(playerId)}/handicap-report`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{fullName}</p>
          {ghin ? (
            <p className="text-[10px] leading-tight text-slate-300">
              GHIN {ghin}
            </p>
          ) : null}
        </div>
        <Link
          href={back}
          aria-label="Cerrar y volver"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-bold text-white no-underline hover:bg-white/20 active:bg-white/30"
        >
          <span aria-hidden>✕</span>
          <span className="hidden sm:inline">Cerrar</span>
        </Link>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-white">
        <iframe
          src={reportSrc}
          title={`Reporte GHIN ${fullName}`}
          className="block h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </main>

      <footer
        className="border-t border-slate-700 bg-slate-800 px-3 py-2 text-white"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href={back}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-emerald-600 px-4 text-sm font-bold text-white no-underline shadow-sm hover:bg-emerald-700 active:bg-emerald-800"
        >
          <span aria-hidden>✕</span>
          Cerrar y volver a votar
        </Link>
      </footer>
    </div>
  );
}
