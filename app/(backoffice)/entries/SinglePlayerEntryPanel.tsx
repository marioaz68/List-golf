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
  const [selectedCategory, setSelectedCategory] = useState<
    Record<string, string>
  >({});

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

  function isSenior(p: Player) {
    const age = getAge(p);
    return age !== null && age >= 50;
  }

  function isSuperSenior(p: Player) {
    const age = getAge(p);
    return age !== null && age >= 60;
  }

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-gray-700">
          Inscribir jugador
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar nombre o club..."
            className="h-7 min-w-[220px]"
          />
        </div>
      </div>

      <form action={addEntry}>
        <input type="hidden" name="tournament_id" value={tournamentId} />

        <table className="w-full text-[11px]">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>HI</th>
              <th>Edad</th>
              <th>Categoría</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((p) => {
              const age = getAge(p);
              const needsSelection = isSenior(p);

              return (
                <tr key={p.id}>
                  <td>
                    {p.last_name} {p.first_name}
                  </td>

                  <td>{p.handicap_index ?? "-"}</td>

                  <td>{age ?? "-"}</td>

                  <td>
                    {needsSelection ? (
                      <select
                        value={selectedCategory[p.id] ?? ""}
                        onChange={(e) =>
                          setSelectedCategory((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccionar</option>

                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td>
                    <button
                      type="submit"
                      name="player_id"
                      value={p.id}
                      className="px-2 py-1 bg-black text-white"
                    >
                      Inscribir
                    </button>

                    {needsSelection && selectedCategory[p.id] && (
                      <input
                        type="hidden"
                        name="category_id"
                        value={selectedCategory[p.id]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </form>
    </section>
  );
}