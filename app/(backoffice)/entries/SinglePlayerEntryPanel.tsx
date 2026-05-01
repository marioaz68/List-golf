"use client";

import { useMemo, useState } from "react";
import { addEntry } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";
import SearchInput from "@/components/ui/SearchInput";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  handicap_index: number | null;
  club_label: string | null;
  birth_year: number | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  min_age?: number | null;
};

export default function SinglePlayerEntryPanel({
  players,
  tournamentId,
  categories,
}: {
  players: Player[];
  tournamentId: string;
  categories: Category[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Record<string, string>>({});

  const currentYear = new Date().getFullYear();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return players.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const club = (p.club_label ?? "").toLowerCase();

      return name.includes(q) || club.includes(q);
    });
  }, [players, search]);

  function getAge(p: Player) {
    if (!p.birth_year) return null;
    return currentYear - p.birth_year;
  }

  function getEligibleAgeCategories(p: Player) {
    const age = getAge(p);
    if (age === null) return [];

    return categories.filter((c) => {
      if (c.min_age === null || c.min_age === undefined) return false;
      return age >= c.min_age;
    });
  }

  function needsCategorySelection(p: Player) {
    return getEligibleAgeCategories(p).length > 0;
  }

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
          Inscribir jugador
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar nombre o club..."
            className="h-7 min-w-[220px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black placeholder:text-gray-400"
          />

          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {filtered.length} / {players.length}
          </div>

          <a
            href={`/players/new?returnTournament=${tournamentId}`}
            className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
          >
            Nuevo jugador
          </a>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded border border-gray-300">
        <table className="w-full border-collapse text-[11px] text-black">
          <thead className="sticky top-0 z-10 bg-gray-200 text-black">
            <tr>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Jugador
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Club
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                HI
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Edad
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Categoría
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                Acción
              </th>
            </tr>
          </thead>

          <tbody className="bg-white text-black">
            {filtered.map((p) => {
              const hasHandicap =
                p.handicap_index !== null && p.handicap_index !== undefined;
              const age = getAge(p);
              const ageCategories = getEligibleAgeCategories(p);
              const needsSelection = needsCategorySelection(p);
              const selected = selectedCategory[p.id] ?? "";

              return (
                <tr key={p.id} className="bg-white align-top">
                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {`${p.last_name ?? ""} ${p.first_name ?? ""}`.trim()}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {p.club_label ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {p.handicap_index ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {age ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {needsSelection ? (
                      <select
                        value={selected}
                        onChange={(e) =>
                          setSelectedCategory((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        className="h-7 min-w-[180px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black"
                      >
                        <option value="">Categoría normal</option>
                        {ageCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code ?? "-"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-500">Auto</span>
                    )}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                    {!hasHandicap ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex min-h-6 cursor-not-allowed items-center justify-center rounded border border-gray-300 bg-gray-200 px-2 text-[10px] font-medium leading-none text-gray-400"
                      >
                        Sin HI
                      </button>
                    ) : (
                      <form action={addEntry} className="inline">
                        <input type="hidden" name="tournament_id" value={tournamentId} />
                        {needsSelection && selected ? (
                          <input type="hidden" name="category_id" value={selected} />
                        ) : null}

                        <SubmitButton
                          name="player_id"
                          value={p.id}
                          pendingText="..."
                        >
                          Inscribir
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-gray-300 px-2 py-2 text-center text-[11px] text-gray-700"
                >
                  No se encontró jugador en la lista general.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
