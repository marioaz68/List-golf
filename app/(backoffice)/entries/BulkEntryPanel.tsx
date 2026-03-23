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

export default function BulkEntryPanel({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: Player[];
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();

    players.forEach((p) => {
      if (p.club) set.add(p.club);
    });

    return [...set].sort();
  }, [players]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return players.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const matchesName = !q || name.includes(q);
      const matchesClub = !club || p.club === club;

      const cat = categoryFromHandicap(p.handicap_index);
      const matchesCategory = !category || cat === category;

      return matchesName && matchesClub && matchesCategory;
    });
  }, [players, search, club, category]);

  function toggle(id: string) {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function selectVisible() {
    const next = { ...selected };

    filtered.forEach((p) => {
      next[p.id] = true;
    });

    setSelected(next);
  }

  function clearVisible() {
    const next = { ...selected };

    filtered.forEach((p) => {
      next[p.id] = false;
    });

    setSelected(next);
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            Inscripción masiva
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <input
              placeholder="Buscar nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 min-w-[160px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black placeholder:text-gray-400"
            />

            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="h-7 min-w-[130px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
            >
              <option value="">Todos los clubs</option>
              {clubs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-7 min-w-[110px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
            >
              <option value="">Todas cat.</option>
              <option value="SCR">SCR</option>
              <option value="AA">AA</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="E">E</option>
            </select>

            <button
              type="button"
              onClick={selectVisible}
              className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
            >
              Seleccionar visibles
            </button>

            <button
              type="button"
              onClick={clearVisible}
              className="inline-flex min-h-7 items-center justify-center rounded border border-gray-300 bg-white px-2.5 text-[11px] font-medium leading-none text-gray-700 hover:bg-gray-50"
            >
              Limpiar visibles
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            Visibles: {filtered.length}
          </div>

          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            Seleccionados: {selectedCount}
          </div>
        </div>
      </div>

      <form action={addSelectedEntries} className="space-y-1">
        <input type="hidden" name="tournament_id" value={tournamentId} />

        <div className="max-h-[560px] overflow-auto rounded border border-gray-300">
          <table className="w-full border-collapse text-[11px] text-black">
            <thead className="sticky top-0 z-10 bg-gray-200 text-black">
              <tr>
                <th className="w-[46px] border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                  Sel
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  Jugador
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  Club
                </th>
                <th className="w-[64px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  HI
                </th>
                <th className="w-[56px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  Cat
                </th>
              </tr>
            </thead>

            <tbody className="bg-white text-black">
              {filtered.map((p) => {
                const cat = categoryFromHandicap(p.handicap_index);

                return (
                  <tr key={p.id} className="bg-white align-top">
                    <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                      <input
                        type="checkbox"
                        name="player_ids"
                        value={p.id}
                        checked={selected[p.id] === true}
                        onChange={() => toggle(p.id)}
                        className="h-3.5 w-3.5 align-middle"
                      />
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {p.last_name} {p.first_name}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {p.club ?? "-"}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {p.handicap_index ?? "-"}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {cat || "-"}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-gray-300 px-2 py-2 text-center text-[11px] text-gray-700"
                  >
                    Sin jugadores para mostrar
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="submit"
            className="inline-flex min-h-7 items-center justify-center rounded border border-green-700 bg-green-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedCount === 0}
          >
            Inscribir seleccionados ({selectedCount})
          </button>
        </div>
      </form>
    </section>
  );
}