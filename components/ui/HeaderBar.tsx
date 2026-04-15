"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

type HeaderBarProps = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
};

export default function HeaderBar({
  title,
  subtitle,
  backHref = "/tournaments",
  backLabel = "Volver",
  actions,
}: HeaderBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tournamentId = searchParams.get("tournament_id");

  const publicHref = useMemo(() => {
    if (!tournamentId) return null;
    return `/torneos/${tournamentId}`;
  }, [tournamentId]);

  const showPublicButton =
    !!tournamentId &&
    pathname !== "/tournaments" &&
    !pathname.startsWith("/torneos/");

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </Link>

            {showPublicButton && publicHref ? (
              <Link
                href={publicHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-[#63BC46] bg-[#63BC46] px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90"
              >
                <ExternalLink size={16} />
                Página pública
              </Link>
            ) : null}
          </div>

          <div className="mt-3">
            <h1 className="truncate text-xl font-semibold text-gray-900">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}