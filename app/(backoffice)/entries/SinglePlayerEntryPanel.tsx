"use client";

import { useMemo, useState } from "react";
import { addEntry } from "./actions";
import StealthTextInput from "@/components/ui/StealthTextInput";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import {
  backofficeTableStickyScroll,
  twStickyTheadGray50,
} from "@/lib/ui/backofficeTableSticky";
import PartnerPicker, { type PartnerCandidate } from "./PartnerPicker";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  handicap_index: number | null;
  club_label: string | null;
  birth_year: number | null;
  gender?: "M" | "F" | "X" | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  min_age?: number | null;
};

export default function SinglePlayerEntryPanel({
  players,
  allPlayers,
  enrolledPlayerIds,
  playersOnTeams,
  tournamentId,
  categories,
  matchPlayPairs = false,
}: {
  players: Player[];
  allPlayers?: Player[];
  enrolledPlayerIds?: string[];
  playersOnTeams?: string[];
  tournamentId: string;
  categories: Category[];
  matchPlayPairs?: boolean;
}) {
  const { t } = useAppLocale();
  const ts = t.entries.single;
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Record<string, string>>({});
  const [selectedPartner, setSelectedPartner] = useState<Record<string, string>>({});
  const [submittingPlayerId, setSubmittingPlayerId] = useState<string | null>(null);

  const enrolledSet = useMemo(
    () => new Set(enrolledPlayerIds ?? []),
    [enrolledPlayerIds]
  );
  const teamedSet = useMemo(
    () => new Set(playersOnTeams ?? []),
    [playersOnTeams]
  );

  const partnerPool: PartnerCandidate[] = useMemo(() => {
    if (!matchPlayPairs) return [];
    const pool = (allPlayers ?? players)
      .filter((p) => !teamedSet.has(p.id) && p.handicap_index !== null)
      .map<PartnerCandidate>((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        gender: p.gender ?? null,
        handicap_index: p.handicap_index,
        club_label: p.club_label,
        enrolled: enrolledSet.has(p.id),
      }));
    pool.sort((a, b) => {
      const an = `${a.last_name ?? ""} ${a.first_name ?? ""}`.trim().toLowerCase();
      const bn = `${b.last_name ?? ""} ${b.first_name ?? ""}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });
    return pool;
  }, [matchPlayPairs, allPlayers, players, teamedSet, enrolledSet]);

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
      return age >= Number(c.min_age);
    });
  }

  function needsCategorySelection(p: Player) {
    return getEligibleAgeCategories(p).length > 0;
  }

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.03em] text-gray-700">
          {ts.title}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <StealthTextInput
            value={search}
            onChange={setSearch}
            placeholder={ts.searchPlaceholder}
            style={{
              minWidth: 220,
              height: 36,
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#000000",
              fontSize: 16,
              padding: "0 8px",
            }}
          />

          <div className="rounded border border-gray-300 bg-white px-2 py-[5px] text-[10px] font-medium leading-none text-gray-600">
            {filtered.length} / {players.length}
          </div>

          <a
            href={`/players/new?returnTournament=${tournamentId}`}
            className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
          >
            {ts.newPlayer}
          </a>
        </div>
      </div>

      {matchPlayPairs ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
          Torneo match play por parejas: al inscribir puedes asignar de una vez la pareja del jugador.
          Si la pareja aún no estaba inscrita, también se inscribe.
        </div>
      ) : null}

      <div
        className="rounded border border-gray-300"
        style={backofficeTableStickyScroll}
      >
        <table className="w-full border-collapse text-[11px] text-black">
          <thead className={twStickyTheadGray50}>
            <tr>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                {ts.thPlayer}
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                {ts.thClub}
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                {ts.thHi}
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                {ts.thAge}
              </th>
              <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                {ts.thCategory}
              </th>
              {matchPlayPairs ? (
                <th className="border border-gray-300 px-1.5 py-[3px] text-left font-semibold leading-none">
                  Pareja
                </th>
              ) : null}
              <th className="border border-gray-300 px-1.5 py-[3px] text-center font-semibold leading-none">
                {ts.thAction}
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
              const isSubmittingThisPlayer = submittingPlayerId === p.id;

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
                        disabled={isSubmittingThisPlayer}
                        className="h-7 min-w-[180px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black disabled:cursor-wait disabled:bg-gray-100"
                      >
                        <option value="">{ts.categoryNormal}</option>
                        {ageCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code ? `${c.code} - ` : ""}
                            {c.name ?? ts.unnamed}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-500">{ts.auto}</span>
                    )}
                  </td>

                  {matchPlayPairs ? (
                    <td className="border border-gray-300 px-1.5 py-[3px] leading-none">
                      <PartnerPicker
                        candidates={partnerPool.filter(
                          (c) => c.id !== p.id
                        )}
                        value={selectedPartner[p.id] ?? ""}
                        onSelect={(id) =>
                          setSelectedPartner((prev) => ({
                            ...prev,
                            [p.id]: id,
                          }))
                        }
                        disabled={isSubmittingThisPlayer}
                        placeholder="Buscar pareja por nombre..."
                      />
                    </td>
                  ) : null}

                  <td className="border border-gray-300 px-1.5 py-[3px] text-center leading-none">
                    {!hasHandicap ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex min-h-6 cursor-not-allowed items-center justify-center rounded border border-gray-300 bg-gray-200 px-2 text-[10px] font-medium leading-none text-gray-400"
                      >
                        {ts.noHi}
                      </button>
                    ) : (
                      <form
                        action={addEntry}
                        className="inline"
                        onSubmit={() => setSubmittingPlayerId(p.id)}
                      >
                        <input type="hidden" name="tournament_id" value={tournamentId} />
                        {needsSelection && selected ? (
                          <input type="hidden" name="category_id" value={selected} />
                        ) : null}
                        {matchPlayPairs && selectedPartner[p.id] ? (
                          <input
                            type="hidden"
                            name="partner_player_id"
                            value={selectedPartner[p.id]}
                          />
                        ) : null}

                        <button
                          type="submit"
                          name="player_id"
                          value={p.id}
                          disabled={isSubmittingThisPlayer}
                          className={
                            isSubmittingThisPlayer
                              ? "inline-flex min-h-6 cursor-wait items-center justify-center rounded border border-gray-400 bg-gray-400 px-2 text-[10px] font-medium leading-none text-white"
                              : "inline-flex min-h-6 items-center justify-center rounded border border-green-700 bg-green-700 px-2 text-[10px] font-medium leading-none text-white hover:bg-green-800"
                          }
                        >
                          {isSubmittingThisPlayer
                            ? ts.enrolling
                            : matchPlayPairs && selectedPartner[p.id]
                            ? "Inscribir + pareja"
                            : ts.enroll}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={matchPlayPairs ? 7 : 6}
                  className="border border-gray-300 px-2 py-2 text-center text-[11px] text-gray-700"
                >
                  {ts.emptySearch}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
