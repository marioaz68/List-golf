"use client";

import { useMemo } from "react";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import { fmt } from "@/lib/i18n/fmt";

type Entry = {
  id: string;
  players: {
    first_name: string | null;
    last_name: string | null;
    club_label: string | null;
  } | null;
  categories: {
    code: string | null;
    name: string | null;
    max_players?: number | null;
  } | null;
};

type CategorySummaryRow = {
  code: string;
  name: string;
  count: number;
  maxPlayers: number | null;
};

export default function EntriesSummaryPanel({
  entries,
}: {
  entries: Entry[];
}) {
  const { t } = useAppLocale();
  const tsu = t.entries.summary;
  const noCat = t.common.noCategory;
  const noClub = tsu.noClub;

  const categorySummary = useMemo(() => {
    const map: Record<string, CategorySummaryRow> = {};

    entries.forEach((e) => {
      const code = e.categories?.code ?? noCat;
      const name = e.categories?.name ?? "";
      const maxPlayers =
        e.categories?.max_players === undefined ||
        e.categories?.max_players === null
          ? null
          : Number(e.categories.max_players);

      if (!map[code]) {
        map[code] = {
          code,
          name,
          count: 0,
          maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : null,
        };
      }

      map[code].count += 1;

      if (map[code].maxPlayers === null && Number.isFinite(maxPlayers)) {
        map[code].maxPlayers = maxPlayers;
      }
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [entries, noCat]);

  const clubSummary = useMemo(() => {
    const map: Record<string, number> = {};

    entries.forEach((e) => {
      const club = e.players?.club_label ?? noClub;
      map[club] = (map[club] ?? 0) + 1;
    });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries, noClub]);

  const totalPlayers = entries.length;
  const totalCategories = categorySummary.length;
  const totalClubs = clubSummary.length;

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
          {tsu.title}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tsu.players} {totalPlayers}
          </div>
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tsu.categories} {totalCategories}
          </div>
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tsu.clubs} {totalClubs}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <div className="space-y-1 rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            {tsu.byCategory}
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[11px] text-black">
              <thead className="sticky top-0 z-10 bg-gray-200 text-black">
                <tr>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    {tsu.thCategory}
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                    {tsu.thEnrolled}
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                    {tsu.thQuota}
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                    {tsu.thState}
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white text-black">
                {categorySummary.map((row) => {
                  const hasLimit = row.maxPlayers !== null;
                  const isFull = hasLimit && row.count >= row.maxPlayers!;
                  const remaining = hasLimit ? Math.max(row.maxPlayers! - row.count, 0) : null;

                  return (
                    <tr
                      key={row.code}
                      className={isFull ? "bg-red-50" : "bg-white"}
                    >
                      <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                        <div className="font-semibold">{row.code}</div>
                        {row.name ? (
                          <div className="mt-0.5 text-[10px] text-gray-500">
                            {row.name}
                          </div>
                        ) : null}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                        {row.count}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                        {hasLimit ? `${row.count} / ${row.maxPlayers}` : `${row.count} / ∞`}
                      </td>

                      <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                        {isFull ? (
                          <span className="inline-flex rounded border border-red-300 bg-red-100 px-1.5 py-[3px] text-[10px] font-semibold text-red-800">
                            {tsu.full}
                          </span>
                        ) : hasLimit ? (
                          <span className="inline-flex rounded border border-green-300 bg-green-50 px-1.5 py-[3px] text-[10px] font-semibold text-green-800">
                            {fmt(tsu.spotsFree, { n: remaining ?? 0 })}
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-gray-300 bg-gray-50 px-1.5 py-[3px] text-[10px] font-semibold text-gray-600">
                            {tsu.noLimit}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {categorySummary.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-gray-300 px-2 py-2 text-[11px] text-gray-700"
                    >
                      {tsu.noData}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-1 rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            {tsu.byClub}
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[11px] text-black">
              <thead className="sticky top-0 z-10 bg-gray-200 text-black">
                <tr>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    {tsu.thClub}
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    {tsu.thPlayers}
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white text-black">
                {clubSummary.map(([club, count]) => (
                  <tr key={club} className="bg-white">
                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {club}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {count}
                    </td>
                  </tr>
                ))}

                {clubSummary.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="border border-gray-300 px-2 py-2 text-[11px] text-gray-700"
                    >
                      {tsu.noData}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}