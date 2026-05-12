"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { addSelectedEntries } from "./actions";
import StealthTextInput from "@/components/ui/StealthTextInput";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import { fmt } from "@/lib/i18n/fmt";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  club_label: string | null;
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


function InlineSpinner() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      className="mr-1.5 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        fill="currentColor"
        d="M22 12a10 10 0 0 1-10 10v-4a6 6 0 0 0 6-6h4z"
      />
    </svg>
  );
}

function SubmitEntriesButton({ selectedCount }: { selectedCount: number }) {
  const { pending } = useFormStatus();
  const { t } = useAppLocale();
  const tb = t.entries.bulk;

  return (
    <button
      type="submit"
      className="inline-flex min-h-7 items-center justify-center rounded border border-green-700 bg-green-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={selectedCount === 0 || pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <InlineSpinner />
          {tb.enrolling}
        </>
      ) : (
        fmt(tb.enrollSelected, { n: selectedCount })
      )}
    </button>
  );
}

export default function BulkEntryPanel({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: Player[];
}) {
  const { t, locale } = useAppLocale();
  const tb = t.entries.bulk;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");
  const [isSelectingVisible, startSelectingVisible] = useTransition();
  const [isClearingVisible, startClearingVisible] = useTransition();

  const clubs = useMemo(() => {
    const set = new Set<string>();

    players.forEach((p) => {
      if (p.club_label) set.add(p.club_label);
    });

    return [...set].sort((a, b) =>
      a.localeCompare(b, locale === "en" ? "en" : "es", { sensitivity: "base" })
    );
  }, [players, locale]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return players.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const clubText = (p.club_label ?? "").toLowerCase();

      const matchesSearch = !q || name.includes(q) || clubText.includes(q);
      const matchesClub = !club || p.club_label === club;

      const cat = categoryFromHandicap(p.handicap_index);
      const matchesCategory = !category || cat === category;

      return matchesSearch && matchesClub && matchesCategory;
    });
  }, [players, search, club, category]);

  function toggle(id: string) {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function selectVisible() {
    startSelectingVisible(() => {
      const next = { ...selected };

      filtered.forEach((p) => {
        next[p.id] = true;
      });

      setSelected(next);
    });
  }

  function clearVisible() {
    startClearingVisible(() => {
      const next = { ...selected };

      filtered.forEach((p) => {
        next[p.id] = false;
      });

      setSelected(next);
    });
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const selectedVisibleCount = filtered.filter((p) => selected[p.id] === true).length;

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
            {tb.title}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <StealthTextInput
              value={search}
              onChange={setSearch}
              placeholder={tb.searchPlaceholder}
              style={{
                minWidth: 160,
                height: 28,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#000000",
                fontSize: 11,
                padding: "0 8px",
              }}
            />

            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="h-7 min-w-[130px] rounded border border-gray-300 bg-white px-2 text-[11px] leading-none text-black"
            >
              <option value="">{tb.allClubs}</option>
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
              <option value="">{tb.allCats}</option>
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
              disabled={isSelectingVisible || filtered.length === 0}
              aria-busy={isSelectingVisible}
              className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSelectingVisible ? (
                <>
                  <InlineSpinner />
                  {tb.selectVisibleBusy}
                </>
              ) : (
                tb.selectVisible
              )}
            </button>

            <button
              type="button"
              onClick={clearVisible}
              disabled={isClearingVisible || selectedVisibleCount === 0}
              aria-busy={isClearingVisible}
              className="inline-flex min-h-7 items-center justify-center rounded border border-gray-300 bg-white px-2.5 text-[11px] font-medium leading-none text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClearingVisible ? (
                <>
                  <InlineSpinner />
                  {tb.clearVisibleBusy}
                </>
              ) : (
                tb.clearVisible
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tb.visibleCount} {filtered.length}
          </div>

          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tb.selectedCount} {selectedCount}
          </div>

          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {tb.selectedVisibleCount} {selectedVisibleCount}
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
                  {tb.thSel}
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  {tb.thPlayer}
                </th>
                <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  {tb.thClub}
                </th>
                <th className="w-[64px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  {tb.thHi}
                </th>
                <th className="w-[56px] border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  {tb.thCat}
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
                      {`${p.last_name ?? ""} ${p.first_name ?? ""}`.trim()}
                    </td>

                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      {p.club_label ?? "-"}
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
                    {tb.emptyPlayers}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <SubmitEntriesButton selectedCount={selectedCount} />
        </div>
      </form>
    </section>
  );
}