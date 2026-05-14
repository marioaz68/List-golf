"use client";

import { useMemo, useState } from "react";
import { addSelectedEntries } from "./actions";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import { fmt } from "@/lib/i18n/fmt";
import {
  backofficeTableStickyScroll,
  twStickyTheadGray50,
} from "@/lib/ui/backofficeTableSticky";

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
  const { t, locale } = useAppLocale();
  const bs = t.entries.bulkSelector;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();

    players.forEach((p) => {
      if (p.club) set.add(p.club);
    });

    return [...set].sort((a, b) =>
      a.localeCompare(b, locale === "en" ? "en" : "es", { sensitivity: "base" })
    );
  }, [players, locale]);

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
        {bs.title}
      </h2>

      <div className="flex flex-wrap gap-3">

        <input
          placeholder={bs.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="">{bs.allCategories}</option>
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
          <option value="">{bs.allClubs}</option>

          {clubs.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <button
          type="button"
          className="btn3d"
          onClick={toggleAll}
        >
          {bs.selectVisible}
        </button>
      </div>

      <form action={addSelectedEntries}>
        <input type="hidden" name="tournament_id" value={tournamentId} />

        <div
          className="border border-gray-300"
          style={backofficeTableStickyScroll}
        >
          <table className="w-full border-collapse">
            <thead className={twStickyTheadGray50}>
              <tr>
                <th className="border p-2">{bs.thSel}</th>
                <th className="border p-2">{bs.thPlayer}</th>
                <th className="border p-2">{bs.thClub}</th>
                <th className="border p-2">{bs.thHi}</th>
                <th className="border p-2">{bs.thCategory}</th>
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
            {fmt(bs.enrollSelected, { n: selectedCount })}
          </button>

        </div>

      </form>
    </section>
  );
}