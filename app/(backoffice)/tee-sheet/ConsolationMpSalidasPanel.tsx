"use client";

import Link from "next/link";
import CapturaTelegramPanel, {
  type GroupRow,
} from "@/app/(backoffice)/captura-telegram/CapturaTelegramPanel";

export default function ConsolationMpSalidasPanel({
  tournamentId,
  roundDate,
  groups,
}: {
  tournamentId: string;
  roundDate: string | null;
  groups: GroupRow[];
}) {
  if (groups.length === 0) return null;

  const capturaHref = `/captura-telegram?tournament_id=${encodeURIComponent(
    tournamentId
  )}${groups[0]?.roundId ? `&round_id=${encodeURIComponent(groups[0].roundId)}` : ""}`;

  return (
    <section className="rounded-lg border-2 border-violet-400 bg-violet-50 p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-violet-950">
            Consolación Match Play · salidas
            {roundDate ? ` · ${roundDate}` : ""}
          </h2>
          <p className="mt-1 text-sm text-violet-900">
            Perdedores del cuadro principal que juegan match play de
            consolación. Envía el link de captura electrónica a jugadores y
            caddies desde aquí.
          </p>
        </div>
        <Link
          href={capturaHref}
          className="shrink-0 rounded-md border border-violet-500 bg-white px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
        >
          Modo Telegram →
        </Link>
      </header>

      <div className="mt-4 rounded-lg border border-violet-300 bg-white p-2">
        <CapturaTelegramPanel tournamentId={tournamentId} groups={groups} />
      </div>
    </section>
  );
}
