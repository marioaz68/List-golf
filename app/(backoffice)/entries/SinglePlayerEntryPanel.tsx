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
};

export default function SinglePlayerEntryPanel({
  players,
  tournamentId,
}: {
  players: Player[];
  tournamentId: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return players.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const club = (p.club_label ?? "").toLowerCase();

      return name.includes(q) || club.includes(q);
    });
  }, [players, search]);

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

      <form action={addEntry} className="space-y-1">
        <input type="hidden" name="tournament_id" value={tournamentId} />

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
                <th className="border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                  Acción
                </th>
              </tr>
            </thead>

            <tbody className="bg-white text-black">
              {filtered.map((p) => {
                const hasHandicap =
                  p.handicap_index !== null && p.handicap_index !== undefined;

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
                        <SubmitButton
                          name="player_id"
                          value={p.id}
                          pendingText="..."
                        >
                          Inscribir
                        </SubmitButton>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-gray-300 px-2 py-2 text-center text-[11px] text-gray-700"
                  >
                    No se encontró jugador en la lista general.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </form>
    </section>
  );
}