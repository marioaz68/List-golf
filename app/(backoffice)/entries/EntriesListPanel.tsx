"use client";

import { useMemo, useState } from "react";
import {
  deleteEntry,
  disqualifyEntry,
  restoreEntry,
  withdrawEntry,
} from "./actions";
import PlayerRowActions from "@/components/PlayerRowActions";
import SubmitButton from "@/components/ui/SubmitButton";
import StealthTextInput from "@/components/ui/StealthTextInput";
import { createScorecardWithTokensAction } from "@/app/(backoffice)/scorecards/actions";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import { fmt } from "@/lib/i18n/fmt";
import {
  backofficeTableStickyScroll,
  twStickyTheadGray50,
} from "@/lib/ui/backofficeTableSticky";

type RoundSignature = {
  round_no: number;
  player_signed?: boolean | null;
  marker_signed?: boolean | null;
  witness_signed?: boolean | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
  min_age: number | null;
};

type Entry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  round_signatures?: RoundSignature[] | null;
  players: {
    id: string;
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
    initials?: string | null;
    ghin_number?: string | null;
    shirt_size?: string | null;
    shoe_size?: string | null;
    birth_year?: number | null;
  } | null;
  categories: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
};

function badgeClass(status: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "confirmed":
      return "border-green-300 bg-green-50 text-green-700";
    case "withdrawn":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "dq":
      return "border-red-300 bg-red-50 text-red-700";
    default:
      return "border-gray-300 bg-gray-50 text-gray-700";
  }
}

function badgeLabel(
  status: string | null,
  te: ReturnType<typeof useAppLocale>["t"]["entries"]["list"]
) {
  switch ((status ?? "").toLowerCase()) {
    case "confirmed":
      return te.statusActive;
    case "withdrawn":
      return te.statusWithdrawn;
    case "dq":
      return te.statusDQ;
    default:
      return status ?? "-";
  }
}

function getSignatureCount(sig?: RoundSignature | null) {
  return (
    (sig?.player_signed ? 1 : 0) +
    (sig?.marker_signed ? 1 : 0) +
    (sig?.witness_signed ? 1 : 0)
  );
}

function getBallClass(sig?: RoundSignature | null) {
  const count = getSignatureCount(sig);

  if (count >= 3) {
    return "bg-green-600";
  }

  if (count === 2) {
    return "bg-blue-600";
  }

  return "bg-red-600";
}


const BTN_BASE =
  "inline-flex h-6 items-center justify-center rounded border px-2 text-[10px] font-medium text-white disabled:opacity-50";

const SLOT_SM = "w-[72px] shrink-0";
const SLOT_MD = "w-[84px] shrink-0";
const SLOT_EDIT = "w-[110px] shrink-0";
const ACTIONS_COL = "min-w-[560px] w-[560px]";

export default function EntriesListPanel({
  entries,
  tournamentId,
  categories,
}: {
  entries: Entry[];
  tournamentId: string;
  categories: Category[];
}) {
  const { t, locale } = useAppLocale();
  const te = t.entries.list;
  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const [category, setCategory] = useState("");

  const clubs = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.players?.club_label) set.add(e.players.club_label);
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, locale === "en" ? "en" : "es", { sensitivity: "base" })
    );
  }, [entries, locale]);

  const categoryCodes = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.categories?.code) set.add(e.categories.code);
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, locale === "en" ? "en" : "es", { sensitivity: "base" })
    );
  }, [entries, locale]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return entries.filter((e) => {
      const name =
        `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.toLowerCase();

      const clubText = (e.players?.club_label ?? "").toLowerCase();
      const numberText = String(e.player_number ?? "");
      const statusText = String(e.status ?? "").toLowerCase();

      const roundsText = [1, 2, 3]
        .map((roundNo) => {
          const sig =
            e.round_signatures?.find((r) => r.round_no === roundNo) ?? null;
          const count = getSignatureCount(sig);
          return fmt(te.roundSigTitle, { round: roundNo, count }).toLowerCase();
        })
        .join(" ")
        .toLowerCase();

      return (
        (!q ||
          name.includes(q) ||
          clubText.includes(q) ||
          numberText.includes(q) ||
          statusText.includes(q) ||
          roundsText.includes(q)) &&
        (!club || e.players?.club_label === club) &&
        (!category || e.categories?.code === category)
      );
    });
  }, [entries, search, club, category, te.roundSigTitle]);

  async function handleGenerateLinks(entryId: string) {
    try {
      const roundId =
        new URLSearchParams(window.location.search).get("round_id") ?? "";

      if (!roundId) {
        alert(te.alertNoRoundId);
        return;
      }

      const res = await createScorecardWithTokensAction({
        tournament_id: tournamentId,
        round_id: roundId,
        entry_id: entryId,
      });

      const msg = `${te.linksPlayer}
${res.player_url}

${te.linksMarker}
${res.marker_url}

${te.linksWitness}
${res.witness_url}`;

      await navigator.clipboard.writeText(msg);
      alert(te.linksCopied);
    } catch (err: any) {
      alert(err?.message ?? te.linksError);
    }
  }

  return (
    <section className="space-y-1 rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <div className="font-semibold uppercase text-gray-700">
          {te.heading}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <StealthTextInput
            value={search}
            onChange={setSearch}
            placeholder={te.searchPlaceholder}
            style={{
              minWidth: 180,
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
            className="h-7 px-2"
          >
            <option value="">{te.optionClub}</option>
            {clubs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-7 px-2"
          >
            <option value="">{te.optionCat}</option>
            {categoryCodes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <div className="text-[10px] text-gray-600">
            {filtered.length}/{entries.length}
          </div>
        </div>
      </div>

      <div
        style={{
          ...backofficeTableStickyScroll,
          border: "1px solid rgb(209 213 219)",
        }}
      >
        <table className="min-w-[1320px] w-max whitespace-nowrap text-[11px]">
          <thead className={twStickyTheadGray50}>
            <tr>
              <th className="px-1 py-1 text-left">{te.thNumber}</th>
              <th className="px-1 py-1 text-left">{te.thPlayer}</th>
              <th className="px-1 py-1 text-left">{te.thClub}</th>
              <th className="px-1 py-1 text-left">{te.thHcp}</th>
              <th className="px-1 py-1 text-left">{te.thCat}</th>
              <th className="px-1 py-1 text-left">{te.thStatus}</th>
              <th className="px-1 py-1 text-left">{te.thSignatures}</th>
              <th className={`${ACTIONS_COL} px-1 py-1 text-left`}>
                {te.thActions}
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((e) => {
              const fullName =
                `${e.players?.last_name ?? ""} ${e.players?.first_name ?? ""}`.trim() ||
                "-";

              const status = (e.status ?? "").toLowerCase();
              const isDQ = status === "dq";
              const isWithdrawn = status === "withdrawn";

              return (
                <tr key={e.id} className="border-t align-middle">
                  <td className="px-1 py-1 font-semibold">
                    {e.player_number ?? "-"}
                  </td>

                  <td className="px-1 py-1">{fullName}</td>

                  <td className="px-1 py-1">{e.players?.club_label ?? "-"}</td>

                  <td className="px-1 py-1">{e.handicap_index ?? "-"}</td>

                  <td className="px-1 py-1">
                    <span className="inline-flex h-6 max-w-[190px] items-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium text-gray-800">
                      <span className="truncate">
                        {e.categories?.code ? `${e.categories.code} - ` : ""}
                        {e.categories?.name ?? "-"}
                      </span>
                    </span>
                  </td>

                  <td className="px-1 py-1">
                    <span
                      className={`inline-flex h-6 items-center rounded border px-2 text-[10px] font-semibold ${badgeClass(
                        e.status
                      )}`}
                    >
                      {badgeLabel(e.status, te)}
                    </span>
                  </td>

                  <td className="px-1 py-1">
                    <div className="flex min-w-[114px] items-center justify-center gap-3">
                      {[1, 2, 3].map((roundNo) => {
                        const sig =
                          e.round_signatures?.find(
                            (r) => r.round_no === roundNo
                          ) ?? null;

                        return (
                          <div
                            key={roundNo}
                            className="flex flex-col items-center gap-1"
                            title={fmt(te.roundSigTitle, {
                              round: roundNo,
                              count: getSignatureCount(sig),
                            })}
                          >
                            <span className="text-[9px] font-semibold text-gray-700">
                              R{roundNo}
                            </span>
                            <span
                              className={`block h-3 w-3 rounded-full ${getBallClass(
                                sig
                              )}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </td>

                  <td className={`${ACTIONS_COL} px-1 py-1`}>
                    <div className="flex min-w-[560px] items-center gap-2 overflow-x-auto whitespace-nowrap">
                      <div className={SLOT_MD}>
                        <button
                          type="button"
                          onClick={() => handleGenerateLinks(e.id)}
                          className="h-7 w-full rounded border border-blue-800 bg-blue-700 text-[11px] font-bold text-white"
                        >
                          {te.btnSignatures}
                        </button>
                      </div>

                      <div
                        className={`${SLOT_MD} sticky left-0 z-20 bg-white pr-1 shadow-[2px_0_0_0_rgba(255,255,255,1)]`}
                      >
                        <form
                          action={deleteEntry}
                          className="w-full"
                          onSubmit={(event) => {
                            if (
                              !window.confirm(te.confirmDelete)
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="id" value={e.id} />
                          <input
                            type="hidden"
                            name="tournament_id"
                            value={tournamentId}
                          />

                          <SubmitButton
                            pendingText={te.deletePending}
                            className="h-7 w-full rounded border border-red-800 bg-red-700 text-[11px] font-bold text-white"
                            pendingClassName="h-7 w-full cursor-wait rounded border border-red-400 bg-red-400 text-[11px] font-bold text-white"
                          >
                            {te.btnDelete}
                          </SubmitButton>
                        </form>
                      </div>

                      <div className={SLOT_SM}>
                        {isWithdrawn ? (
                          <form
                            action={restoreEntry}
                            className="w-full"
                            onSubmit={(event) => {
                              if (!window.confirm(te.confirmRestoreWithdrawn)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="id" value={e.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />

                            <SubmitButton
                              pendingText={te.restorePending}
                              className={`${BTN_BASE} w-full border-green-700 bg-green-700`}
                              pendingClassName={`${BTN_BASE} w-full cursor-wait border-green-400 bg-green-400`}
                            >
                              {te.btnRea}
                            </SubmitButton>
                          </form>
                        ) : (
                          <form
                            action={withdrawEntry}
                            className="w-full"
                            onSubmit={(event) => {
                              if (!window.confirm(te.confirmWithdraw)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="id" value={e.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />

                            <SubmitButton
                              pendingText={te.withdrawPending}
                              className={`${BTN_BASE} w-full border-amber-600 bg-amber-600`}
                              pendingClassName={`${BTN_BASE} w-full cursor-wait border-amber-400 bg-amber-400`}
                            >
                              {te.btnWithdraw}
                            </SubmitButton>
                          </form>
                        )}
                      </div>

                      <div className={SLOT_SM}>
                        {isDQ ? (
                          <form
                            action={restoreEntry}
                            className="w-full"
                            onSubmit={(event) => {
                              if (!window.confirm(te.confirmRestoreDq)) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="id" value={e.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />

                            <SubmitButton
                              pendingText={te.restorePending}
                              className={`${BTN_BASE} w-full border-sky-700 bg-sky-700`}
                              pendingClassName={`${BTN_BASE} w-full cursor-wait border-sky-400 bg-sky-400`}
                            >
                              {te.btnRea}
                            </SubmitButton>
                          </form>
                        ) : (
                          <form
                            action={disqualifyEntry}
                            className="w-full"
                            onSubmit={(event) => {
                              if (
                                !window.confirm(te.confirmDq)
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="id" value={e.id} />
                            <input
                              type="hidden"
                              name="tournament_id"
                              value={tournamentId}
                            />

                            <SubmitButton
                              pendingText={te.dqPending}
                              className={`${BTN_BASE} w-full border-red-700 bg-red-700`}
                              pendingClassName={`${BTN_BASE} w-full cursor-wait border-red-400 bg-red-400`}
                            >
                              {te.btnDq}
                            </SubmitButton>
                          </form>
                        )}
                      </div>

                      <div className={SLOT_EDIT}>
                        <PlayerRowActions
                          tournamentId={tournamentId}
                          entryId={e.id}
                          currentCategoryId={e.categories?.id ?? null}
                          categories={categories}
                          player={
                            e.players
                              ? {
                                  id: e.players.id,
                                  first_name: e.players.first_name,
                                  last_name: e.players.last_name,
                                  initials: e.players.initials ?? null,
                                  gender: e.players.gender ?? null,
                                  handicap_index:
                                    e.players.handicap_index ?? null,
                                  handicap_torneo:
                                    e.handicap_index ??
                                    e.players.handicap_torneo ??
                                    null,
                                  phone: e.players.phone ?? null,
                                  email: e.players.email ?? null,
                                  club: e.players.club ?? null,
                                  club_id: e.players.club_id ?? null,
                                  ghin_number: e.players.ghin_number ?? null,
                                  shirt_size: e.players.shirt_size ?? null,
                                  shoe_size: e.players.shoe_size ?? null,
                                  birth_year: e.players.birth_year ?? null,
                                }
                              : null
                          }
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-2 text-gray-600">
                  {te.noResults}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}