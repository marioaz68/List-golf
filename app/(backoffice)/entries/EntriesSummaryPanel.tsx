"use client";

import { useMemo } from "react";

type Entry = {
  id: string;
  players: {
    first_name: string | null;
    last_name: string | null;
    club: string | null;
  };
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

export default function EntriesSummaryPanel({
  entries,
}: {
  entries: Entry[];
}) {
  const categorySummary = useMemo(() => {
    const map: Record<string, number> = {};

    entries.forEach((e) => {
      const cat = e.categories?.code ?? "Sin categoría";
      map[cat] = (map[cat] ?? 0) + 1;
    });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const clubSummary = useMemo(() => {
    const map: Record<string, number> = {};

    entries.forEach((e) => {
      const club = e.players?.club ?? "Sin club";
      map[club] = (map[club] ?? 0) + 1;
    });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const totalPlayers = entries.length;
  const totalCategories = categorySummary.length;
  const totalClubs = clubSummary.length;

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
          Resumen del torneo
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            Jugadores: {totalPlayers}
          </div>
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            Categorías: {totalCategories}
          </div>
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            Clubs: {totalClubs}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <div className="space-y-1 rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            Jugadores por categoría
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[11px] text-black">
              <thead className="sticky top-0 z-10 bg-gray-200 text-black">
                <tr>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Categoría
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Jugadores
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white text-black">
                {categorySummary.map(([cat, count]) => (
                  <tr key={cat} className="bg-white">
                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {cat}
                    </td>
                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {count}
                    </td>
                  </tr>
                ))}

                {categorySummary.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="border border-gray-300 px-2 py-2 text-[11px] text-gray-700"
                    >
                      Sin datos
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-1 rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            Jugadores por club
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[11px] text-black">
              <thead className="sticky top-0 z-10 bg-gray-200 text-black">
                <tr>
                  <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Club
                  </th>
                  <th className="w-[90px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                    Jugadores
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
                      Sin datos
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