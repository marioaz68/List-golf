"use client";

import { useMemo, useState } from "react";
import { addSelectedEntries } from "./actions";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  club: string | null;
};

function categoryFromHandicap(h: number | null) {
  if (h === null) return "";

  if (h <= 3) return "SCR";
  if (h <= 7) return "AA";
  if (h <= 11) return "A";
  if (h <= 15) return "B";
  if (h <= 20) return "C";
  if (h <= 25) return "D";
  return "E";
}

export default function PlayersBulkSelector({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: Player[];
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();

    players.forEach((p) => {
      if (p.club) set.add(p.club);
    });

    return [...set].sort();
  }, [players]);

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const club = (p.club ?? "").toLowerCase();

      const matchesName =
        !search || name.includes(search.toLowerCase());

      const matchesClub =
        !clubFilter || club === clubFilter.toLowerCase();

      const cat = categoryFromHandicap(p.handicap_index);

      const matchesCategory =
        !categoryFilter || cat === categoryFilter;

      return matchesName && matchesClub && matchesCategory;
    });
  }, [players, search, clubFilter, categoryFilter]);

  const toggle = (id: string) => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleAll = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((p) => selected[p.id]);

    const next: Record<string, boolean> = { ...selected };

    filtered.forEach((p) => {
      next[p.id] = !allSelected;
    });

    setSelected(next);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <section className="rounded-lg border border-gray-300 bg-white/95 p-4 space-y-4">

      <h2 className="font-semibold text-black">
        Inscripción masiva de jugadores
      </h2>

      <div className="flex flex-wrap gap-3">

        <input
          placeholder="Buscar jugador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">Todas categorías</option>
          <option value="SCR">SCR</option>
          <option value="AA">AA</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
        </select>

        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">Todos los clubes</option>

          {clubs.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <button
          type="button"
          className="btn3d"
          onClick={toggleAll}
        >
          Seleccionar visibles
        </button>
      </div>

      <form action={addSelectedEntries}>
        <input type="hidden" name="tournament_id" value={tournamentId} />

        <div className="max-h-[420px] overflow-auto border border-gray-300">

          <table className="w-full border-collapse">

            <thead className="bg-gray-200 text-black">
              <tr>
                <th className="border p-2">Sel</th>
                <th className="border p-2">Jugador</th>
                <th className="border p-2">Club</th>
                <th className="border p-2">HI</th>
                <th className="border p-2">Categoría</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((p) => {
                const cat = categoryFromHandicap(p.handicap_index);

                return (
                  <tr key={p.id} className="bg-white">

                    <td className="border p-2 text-center">
                      <input
                        type="checkbox"
                        name="player_ids"
                        value={p.id}
                        checked={selected[p.id] === true}
                        onChange={() => toggle(p.id)}
                      />
                    </td>

                    <td className="border p-2 text-black">
                      {p.last_name} {p.first_name}
                    </td>

                    <td className="border p-2 text-black">
                      {p.club ?? "-"}
                    </td>

                    <td className="border p-2 text-black">
                      {p.handicap_index ?? "-"}
                    </td>

                    <td className="border p-2 text-black">
                      {cat}
                    </td>

                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

        <div className="mt-3 flex gap-3">

          <button
            className="btn3d-green"
            disabled={selectedCount === 0}
          >
            Inscribir seleccionados ({selectedCount})
          </button>

        </div>

      </form>
    </section>
  );
}