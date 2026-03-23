"use client";

import { useMemo, useState } from "react";
import { deleteEntry } from "./actions";
import PlayerRowActions from "@/components/PlayerRowActions";

type Entry = {
  id: string;
  player_id: string;
  handicap_index: number | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    club: string | null;
    email?: string | null;
  } | null;
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

export default function EntriesListPanel({
  entries,
  tournamentId,
}: {
  entries: Entry[];
  tournamentId: string;
}) {
  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();

    entries.forEach((e) => {
      if (e.players?.club) set.add(e.players.club);
    });

    return [...set].sort();
  }, [entries]);

  const categories = useMemo(() => {
    const set = new Set<string>();

    entries.forEach((e) => {
      if (e.categories?.code) set.add(e.categories.code);
    });

    return [...set].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const name =
        `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.toLowerCase();

      const matchesName = !search || name.includes(search.toLowerCase());
      const matchesClub = !club || e.players?.club === club;
      const matchesCategory = !category || e.categories?.code === category;

      return matchesName && matchesClub && matchesCategory;
    });
  }, [entries, search, club, category]);

  return (
    <section className="space-y-3 rounded-lg border border-gray-300 bg-white p-3 text-black shadow-sm">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
        <div className="grid gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-700">
            Jugadores inscritos
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_minmax(180px,1fr)_minmax(170px,1fr)_110px] xl:items-end">
            <div className="grid gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                Buscar jugador
              </label>
              <input
                placeholder="Nombre del jugador..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-[12px] text-black placeholder:text-gray-400"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                Club
              </label>
              <select
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-[12px] text-black"
              >
                <option value="">Todos los clubs</option>
                {clubs.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-[12px] text-black"
              >
                <option value="">Todas categorías</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <div className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-[11px] font-medium text-gray-700">
                {filtered.length} / {entries.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-lg border border-gray-300">
        <table className="w-full min-w-[780px] border-collapse text-[12px] text-black">
          <thead className="sticky top-0 z-10 bg-gray-200 text-black">
            <tr>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                Jugador
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                Club
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold whitespace-nowrap">
                Hcp torneo
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                Cat
              </th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody className="bg-white text-black">
            {filtered.map((e) => {
              const fullName =
                `${e.players?.last_name ?? ""} ${e.players?.first_name ?? ""}`.trim() ||
                "Jugador no disponible";

              return (
                <tr key={e.id} className="bg-white align-top">
                  <td className="border border-gray-300 px-3 py-3 leading-snug">
                    <div className="font-medium leading-snug">{fullName}</div>
                  </td>

                  <td className="border border-gray-300 px-3 py-3 leading-snug">
                    {e.players?.club ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-3 py-3 leading-snug">
                    {e.handicap_index ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-3 py-3 leading-snug">
                    {e.categories?.code ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <form
                        action={deleteEntry}
                        onSubmit={(ev) => {
                          const ok = window.confirm(
                            `¿Quitar a ${fullName} solo de este torneo?\n\nNo se eliminará del catálogo general.`
                          );
                          if (!ok) ev.preventDefault();
                        }}
                        className="m-0"
                      >
                        <input type="hidden" name="id" value={e.id} />
                        <input
                          type="hidden"
                          name="tournament_id"
                          value={tournamentId}
                        />

                        <button
                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-red-700 bg-red-700 px-3 text-[11px] font-medium text-white hover:bg-red-800"
                          type="submit"
                        >
                          Quitar
                        </button>
                      </form>

                      <PlayerRowActions
                        player={
                          e.players
                            ? {
                                id: e.player_id,
                                first_name: e.players.first_name,
                                last_name: e.players.last_name,
                                email: e.players.email ?? null,
                              }
                            : null
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td
                  className="border border-gray-300 px-3 py-4 text-[12px] text-gray-700"
                  colSpan={5}
                >
                  Sin resultados
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}