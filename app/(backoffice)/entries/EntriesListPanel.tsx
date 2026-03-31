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
    club_label: string | null;
    email?: string | null;
    gender?: "M" | "F" | "X" | null;
    handicap_index?: number | null;
    handicap_torneo?: number | null;
    phone?: string | null;
    club?: string | null;
    club_id?: string | null;
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
      if (e.players?.club_label) set.add(e.players.club_label);
    });

    return [...set].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [entries]);

  const categories = useMemo(() => {
    const set = new Set<string>();

    entries.forEach((e) => {
      if (e.categories?.code) set.add(e.categories.code);
    });

    return [...set].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return entries.filter((e) => {
      const name =
        `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.toLowerCase();

      const clubText = (e.players?.club_label ?? "").toLowerCase();

      const matchesSearch = !q || name.includes(q) || clubText.includes(q);
      const matchesClub = !club || e.players?.club_label === club;
      const matchesCategory = !category || e.categories?.code === category;

      return matchesSearch && matchesClub && matchesCategory;
    });
  }, [entries, search, club, category]);

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            Jugadores inscritos
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <input
              placeholder="Buscar jugador o club..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 min-w-[180px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black placeholder:text-gray-400"
            />

            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="h-7 min-w-[130px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
            >
              <option value="">Todos los clubs</option>
              {clubs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-7 min-w-[110px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
            >
              <option value="">Todas cat.</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
              {filtered.length} / {entries.length}
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded border border-gray-300">
        <table className="w-full min-w-[720px] border-collapse text-[11px] text-black">
          <thead className="sticky top-0 z-10 bg-gray-200 text-black">
            <tr>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Jugador
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Club
              </th>
              <th className="w-[72px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Hcp torneo
              </th>
              <th className="w-[58px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                Cat
              </th>
              <th className="w-[220px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
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
                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {fullName}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {e.players?.club_label ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {e.handicap_index ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                    {e.categories?.code ?? "-"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px]">
                    <div className="flex flex-wrap items-center gap-1">
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
                          className="inline-flex min-h-6 items-center justify-center rounded border border-red-700 bg-red-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-red-800"
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
                                first_name: e.players.first_name ?? null,
                                last_name: e.players.last_name ?? null,
                                gender: e.players.gender ?? null,
                                handicap_index: e.players.handicap_index ?? null,
                                handicap_torneo: e.players.handicap_torneo ?? null,
                                phone: e.players.phone ?? null,
                                email: e.players.email ?? null,
                                club: e.players.club ?? null,
                                club_id: e.players.club_id ?? null,
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
                  className="border border-gray-300 px-2 py-2 text-[11px] text-gray-700"
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