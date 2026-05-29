"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  deleteEntry,
  disqualifyEntry,
  restoreEntry,
  toggleEntryCommitteeFlag,
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
import ExportCommitteePromptButton from "./ExportCommitteePromptButton";
import MonthlyDbUpdateButton from "./MonthlyDbUpdateButton";
import CommitteeReviewBadge from "./CommitteeReviewBadge";
import EditableHiCell from "./EditableHiCell";

type RoundSignature = {
  round_no: number;
  player_signed?: boolean | null;
  marker_signed?: boolean | null;
  witness_signed?: boolean | null;
  captured?: boolean;
  closed?: boolean;
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

function kitButtonLabel(
  base: string,
  entry: {
    players?: { telegram_user_id?: string | null } | null;
    telegram_kit_sent_at?: string | null;
    telegram_kit_received_at?: string | null;
  }
) {
  const linked = Boolean(entry.players?.telegram_user_id?.trim());
  const received = Boolean(entry.telegram_kit_received_at?.trim());
  const sent = Boolean(entry.telegram_kit_sent_at?.trim());

  if (received) return `${base} ✓✓`;
  if (sent) return `${base} ◐`;
  if (linked) return `${base} ✓`;
  return base;
}

type Entry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  course_handicap?: number | null;
  playing_handicap?: number | null;
  playing_handicap_override?: number | null;
  playing_handicap_override_reason?: string | null;
  status: string | null;
  flagged_for_committee?: boolean;
  flagged_committee_reason?: string | null;
  telegram_kit_sent_at?: string | null;
  telegram_kit_received_at?: string | null;
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
    telegram_user_id?: string | null;
    telegram_chat_id?: string | null;
  } | null;
  categories: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
};

function playerGhinChip(ghin: string | null | undefined, flagged?: boolean) {
  const v = (ghin ?? "").trim();
  if (v) {
    return (
      <span
        className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[9px] font-bold tabular-nums text-slate-700"
        title="GHIN del jugador"
      >
        {v}
      </span>
    );
  }
  if (flagged) {
    return (
      <span
        className="shrink-0 rounded border border-amber-500 bg-amber-50 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-900"
        title="Falta GHIN en Jugadores → editar jugador"
      >
        Sin GHIN
      </span>
    );
  }
  return null;
}

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
  if (sig?.closed) return "bg-green-600";
  if (sig?.captured) return "bg-amber-500";
  return "bg-red-600";
}

function roundBallTitle(
  sig: RoundSignature | null,
  roundNo: number,
  te: ReturnType<typeof useAppLocale>["t"]["entries"]["list"]
) {
  if (!sig) {
    return fmt(te.roundBallPending, { round: roundNo });
  }
  if (sig.closed) {
    const count = getSignatureCount(sig);
    return `${fmt(te.roundBallClosed, { round: roundNo })} · ${fmt(te.roundSigTitle, { round: roundNo, count })}`;
  }
  if (sig.captured) {
    const count = getSignatureCount(sig);
    return `${fmt(te.roundBallCapturedOpen, { round: roundNo })} · ${fmt(te.roundSigTitle, { round: roundNo, count })}`;
  }
  return fmt(te.roundBallPending, { round: roundNo });
}


const BTN_BASE =
  "inline-flex min-h-9 items-center justify-center rounded border px-2 text-[10px] font-medium text-white disabled:opacity-50 md:min-h-6";

const SLOT_SM = "shrink-0 md:w-[72px]";
const SLOT_MD = "shrink-0 md:w-[84px]";
const SLOT_EDIT = "shrink-0 md:w-[110px]";
const ACTIONS_COL = "min-w-0 md:min-w-[648px] md:w-[648px]";

const MOBILE_ACTION_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center rounded border px-2 text-[10px] font-bold leading-none text-white whitespace-nowrap disabled:opacity-50";

type EntryRowActionsProps = {
  entry: Entry;
  tournamentId: string;
  categories: Category[];
  te: ReturnType<typeof useAppLocale>["t"]["entries"]["list"];
  compact?: boolean;
  onGenerateLinks: (entryId: string) => void;
};

function EntryRoundBalls({
  entry,
  te,
  compact,
}: {
  entry: Entry;
  te: ReturnType<typeof useAppLocale>["t"]["entries"]["list"];
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-2"
          : "flex min-w-[114px] items-center justify-center gap-3"
      }
    >
      {[1, 2, 3].map((roundNo) => {
        const sig =
          entry.round_signatures?.find((r) => r.round_no === roundNo) ?? null;

        return (
          <div
            key={roundNo}
            className={
              compact
                ? "flex items-center gap-1"
                : "flex flex-col items-center gap-1"
            }
            title={roundBallTitle(sig, roundNo, te)}
          >
            <span className="text-[9px] font-semibold text-gray-700">
              R{roundNo}
            </span>
            <span
              className={`block h-3 w-3 rounded-full ${getBallClass(sig)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function EntryRowActions({
  entry,
  tournamentId,
  categories,
  te,
  compact = false,
  onGenerateLinks,
}: EntryRowActionsProps) {
  const status = (entry.status ?? "").toLowerCase();
  const isDQ = status === "dq";
  const isWithdrawn = status === "withdrawn";

  const wrap = (node: ReactNode, slotClass: string) =>
    compact ? node : <div className={slotClass}>{node}</div>;

  const isFlagged = Boolean(entry.flagged_for_committee);

  const committeeFlagForm = (
    <form
      action={toggleEntryCommitteeFlag}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (isFlagged) return;
        const reason = window.prompt(
          "Motivo para enviar al comité (opcional):",
          ""
        );
        if (reason === null) {
          event.preventDefault();
          return;
        }
        const input = event.currentTarget.querySelector(
          'input[name="reason"]'
        ) as HTMLInputElement | null;
        if (input) input.value = reason;
      }}
    >
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="entry_id" value={entry.id} />
      <input
        type="hidden"
        name="flag"
        value={isFlagged ? "false" : "true"}
      />
      <input type="hidden" name="reason" value="" />
      <SubmitButton
        pendingText="…"
        className={
          compact
            ? `${MOBILE_ACTION_BTN} ${isFlagged ? "border-rose-800 bg-rose-700" : "border-violet-800 bg-violet-700"}`
            : `h-7 w-full rounded border text-[11px] font-bold text-white ${isFlagged ? "border-rose-800 bg-rose-700" : "border-violet-800 bg-violet-700"}`
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait opacity-70`
            : "h-7 w-full cursor-wait rounded border opacity-70 text-[11px] font-bold text-white"
        }
      >
        {isFlagged ? "Quitar comité" : "→ Comité HI"}
      </SubmitButton>
    </form>
  );

  const telegramBtn = (
    <Link
      href={`/entries/telegram-kit?tournament_id=${encodeURIComponent(
        tournamentId
      )}&player_id=${encodeURIComponent(entry.player_id)}`}
      title={te.btnTelegramKitTitle}
      className={
        compact
          ? `${MOBILE_ACTION_BTN} border-sky-900 bg-sky-700 hover:bg-sky-800`
          : "inline-flex h-7 w-full items-center justify-center rounded border border-sky-900 bg-sky-700 text-[11px] font-bold text-white hover:bg-sky-800"
      }
    >
      {kitButtonLabel(te.btnTelegramKit, entry)}
    </Link>
  );

  const signaturesBtn = (
    <button
      type="button"
      onClick={() => onGenerateLinks(entry.id)}
      className={
        compact
          ? `${MOBILE_ACTION_BTN} border-blue-800 bg-blue-700`
          : "h-7 w-full rounded border border-blue-800 bg-blue-700 text-[11px] font-bold text-white"
      }
    >
      {te.btnSignatures}
    </button>
  );

  const deleteForm = (
    <form
      action={deleteEntry}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (!window.confirm(te.confirmDelete)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <SubmitButton
        pendingText={te.deletePending}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} border-red-800 bg-red-700`
            : "h-7 w-full rounded border border-red-800 bg-red-700 text-[11px] font-bold text-white"
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait border-red-400 bg-red-400`
            : "h-7 w-full cursor-wait rounded border border-red-400 bg-red-400 text-[11px] font-bold text-white"
        }
      >
        {te.btnDelete}
      </SubmitButton>
    </form>
  );

  const withdrawRestoreForm = isWithdrawn ? (
    <form
      action={restoreEntry}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (!window.confirm(te.confirmRestoreWithdrawn)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <SubmitButton
        pendingText={te.restorePending}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} border-green-700 bg-green-700`
            : `${BTN_BASE} w-full border-green-700 bg-green-700`
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait border-green-400 bg-green-400`
            : `${BTN_BASE} w-full cursor-wait border-green-400 bg-green-400`
        }
      >
        {te.btnRea}
      </SubmitButton>
    </form>
  ) : (
    <form
      action={withdrawEntry}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (!window.confirm(te.confirmWithdraw)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <SubmitButton
        pendingText={te.withdrawPending}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} border-amber-600 bg-amber-600`
            : `${BTN_BASE} w-full border-amber-600 bg-amber-600`
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait border-amber-400 bg-amber-400`
            : `${BTN_BASE} w-full cursor-wait border-amber-400 bg-amber-400`
        }
      >
        {te.btnWithdraw}
      </SubmitButton>
    </form>
  );

  const dqRestoreForm = isDQ ? (
    <form
      action={restoreEntry}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (!window.confirm(te.confirmRestoreDq)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <SubmitButton
        pendingText={te.restorePending}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} border-sky-700 bg-sky-700`
            : `${BTN_BASE} w-full border-sky-700 bg-sky-700`
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait border-sky-400 bg-sky-400`
            : `${BTN_BASE} w-full cursor-wait border-sky-400 bg-sky-400`
        }
      >
        {te.btnRea}
      </SubmitButton>
    </form>
  ) : (
    <form
      action={disqualifyEntry}
      className={compact ? "shrink-0" : "w-full"}
      onSubmit={(event) => {
        if (!window.confirm(te.confirmDq)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <SubmitButton
        pendingText={te.dqPending}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} border-red-700 bg-red-700`
            : `${BTN_BASE} w-full border-red-700 bg-red-700`
        }
        pendingClassName={
          compact
            ? `${MOBILE_ACTION_BTN} cursor-wait border-red-400 bg-red-400`
            : `${BTN_BASE} w-full cursor-wait border-red-400 bg-red-400`
        }
      >
        {te.btnDq}
      </SubmitButton>
    </form>
  );

  const editControl = (
    <PlayerRowActions
      tournamentId={tournamentId}
      entryId={entry.id}
      currentCategoryId={entry.categories?.id ?? null}
      categories={categories}
      player={
        entry.players
          ? {
              id: entry.players.id,
              first_name: entry.players.first_name,
              last_name: entry.players.last_name,
              initials: entry.players.initials ?? null,
              gender: entry.players.gender ?? null,
              handicap_index: entry.players.handicap_index ?? null,
              handicap_torneo:
                entry.handicap_index ?? entry.players.handicap_torneo ?? null,
              phone: entry.players.phone ?? null,
              email: entry.players.email ?? null,
              club: entry.players.club ?? null,
              club_id: entry.players.club_id ?? null,
              ghin_number: entry.players.ghin_number ?? null,
              shirt_size: entry.players.shirt_size ?? null,
              shoe_size: entry.players.shoe_size ?? null,
              birth_year: entry.players.birth_year ?? null,
              telegram_user_id: entry.players.telegram_user_id ?? null,
              telegram_chat_id: entry.players.telegram_chat_id ?? null,
            }
          : null
      }
    />
  );

  return (
    <div
      className={
        compact
          ? "flex max-w-[min(52vw,16.5rem)] shrink-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain"
          : `flex flex-nowrap items-center gap-2 ${ACTIONS_COL}`
      }
    >
      {wrap(telegramBtn, SLOT_MD)}
      {wrap(committeeFlagForm, SLOT_MD)}
      {wrap(signaturesBtn, SLOT_MD)}
      {wrap(deleteForm, SLOT_MD)}
      {wrap(withdrawRestoreForm, SLOT_SM)}
      {wrap(dqRestoreForm, SLOT_SM)}
      {wrap(
        compact ? (
          <div className="shrink-0 [&_button]:h-8 [&_button]:min-w-[3rem]">
            {editControl}
          </div>
        ) : (
          editControl
        ),
        SLOT_EDIT
      )}
    </div>
  );
}

type PartnerInfo = {
  entry_id: string;
  player_id: string | null;
  full_name: string;
};

export default function EntriesListPanel({
  entries,
  tournamentId,
  categories,
  matchPlayPairs = false,
  partnerByEntryId = {},
}: {
  entries: Entry[];
  tournamentId: string;
  categories: Category[];
  matchPlayPairs?: boolean;
  partnerByEntryId?: Record<string, PartnerInfo>;
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

  const flaggedCount = useMemo(
    () => entries.filter((e) => e.flagged_for_committee).length,
    [entries]
  );

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
          return roundBallTitle(sig, roundNo, te).toLowerCase();
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
    <section className="space-y-1 overflow-x-hidden rounded border border-gray-300 bg-white p-1.5 text-black shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <div className="font-semibold uppercase text-gray-700">
          {te.heading}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <StealthTextInput
            value={search}
            onChange={setSearch}
            placeholder={te.searchPlaceholder}
            style={{
              width: "100%",
              minWidth: 0,
              height: 36,
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#000000",
              fontSize: 16,
              padding: "0 8px",
            }}
          />

          <select
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className="h-9 w-full px-2 text-sm sm:w-auto sm:min-w-[8rem] md:h-7"
          >
            <option value="">{te.optionClub}</option>
            {clubs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 w-full px-2 text-sm sm:w-auto sm:min-w-[8rem] md:h-7"
          >
            <option value="">{te.optionCat}</option>
            {categoryCodes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <div className="text-[10px] text-gray-600">
            {filtered.length}/{entries.length}
          </div>

          <ExportCommitteePromptButton
            tournamentId={tournamentId}
            flaggedCount={flaggedCount}
          />

          <MonthlyDbUpdateButton />
        </div>
        <p className="mt-1 w-full text-[10px] leading-snug text-gray-500">
          {te.roundBallLegend}
        </p>
      </div>

      <ul
        className="divide-y border border-gray-200 md:hidden"
        style={{
          maxHeight: backofficeTableStickyScroll.maxHeight,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#ffffff",
        }}
      >
        {filtered.map((e) => {
          const fullName =
            `${e.players?.last_name ?? ""} ${e.players?.first_name ?? ""}`.trim() ||
            "-";
          const categoryLabel = e.categories?.code
            ? `${e.categories.code}${e.categories.name ? ` · ${e.categories.name}` : ""}`
            : (e.categories?.name ?? "—");

          return (
            <li key={e.id} className="px-1 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1 text-[12px] font-semibold leading-snug text-gray-900">
                    <span className="tabular-nums text-gray-700">
                      {e.player_number ?? "—"}
                    </span>
                    <span className="min-w-0 truncate">{fullName}</span>
                    {playerGhinChip(
                      e.players?.ghin_number,
                      e.flagged_for_committee
                    )}
                    {e.flagged_for_committee ? (
                      <CommitteeReviewBadge
                        reason={e.flagged_committee_reason}
                        compact
                      />
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-gray-600">
                    {e.players?.club_label ?? "—"} · HI{" "}
                    <span className="font-mono">{e.handicap_index ?? "—"}</span>
                    {e.course_handicap != null ? (
                      <>
                        {" "}
                        · HC{" "}
                        <span className="font-mono text-slate-700">
                          {Math.round(Number(e.course_handicap))}
                        </span>
                      </>
                    ) : null}
                    {e.playing_handicap != null ? (
                      <>
                        {" "}
                        · PH{" "}
                        <span
                          className={`font-mono font-semibold ${
                            e.playing_handicap_override != null
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {Math.round(Number(e.playing_handicap))}
                        </span>
                        {e.playing_handicap_override != null ? (
                          <span className="ml-0.5 text-[8px] uppercase text-amber-700">
                            ovr
                          </span>
                        ) : null}
                      </>
                    ) : null}
                    {" · "}
                    {categoryLabel}
                  </p>
                  {matchPlayPairs ? (
                    <p className="mt-0.5 truncate text-[10px] text-emerald-700">
                      Pareja:{" "}
                      <span className="font-semibold">
                        {partnerByEntryId[e.id]?.full_name ?? "sin pareja"}
                      </span>
                    </p>
                  ) : null}
                </div>
                <EntryRowActions
                  entry={e}
                  tournamentId={tournamentId}
                  categories={categories}
                  te={te}
                  compact
                  onGenerateLinks={handleGenerateLinks}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-6 items-center rounded border px-2 text-[10px] font-semibold ${badgeClass(
                    e.status
                  )}`}
                >
                  {badgeLabel(e.status, te)}
                </span>
                <EntryRoundBalls entry={e} te={te} compact />
              </div>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="p-3 text-[11px] text-gray-600">{te.noResults}</li>
        ) : null}
      </ul>

      <div
        className="hidden md:block"
        style={{
          ...backofficeTableStickyScroll,
          border: "1px solid rgb(209 213 219)",
        }}
      >
        <table className="min-w-[1400px] w-max whitespace-nowrap text-[11px]">
          <thead className={twStickyTheadGray50}>
            <tr>
              <th className="px-1 py-1 text-left">{te.thNumber}</th>
              <th className="px-1 py-1 text-left">{te.thPlayer}</th>
              <th className="px-1 py-1 text-left">{te.thClub}</th>
              <th
                className="px-1 py-1 text-right"
                title="Handicap Index (editable). Al guardarlo, CH y PH se recalculan automáticamente para este torneo."
              >
                HI ✎
              </th>
              <th
                className="px-1 py-1 text-right"
                title="Course Handicap (informativo): HI × Slope/113 + (CR − Par) usando la salida que la regla salida/categoría asigna en este torneo."
              >
                HC
              </th>
              <th
                className="px-1 py-1 text-right"
                title="Playing Handicap del torneo (regla aplicada): HC × % de reglas de competencia."
              >
                PH
              </th>
              <th className="px-1 py-1 text-left">{te.thCat}</th>
              {matchPlayPairs ? (
                <th className="px-1 py-1 text-left">Pareja</th>
              ) : null}
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

              return (
                <tr key={e.id} className="border-t align-middle">
                  <td className="px-1 py-1 font-semibold">
                    {e.player_number ?? "-"}
                  </td>

                  <td className="px-1 py-1">
                    <span className="inline-flex max-w-[260px] flex-wrap items-center gap-1">
                      <span className="truncate">{fullName}</span>
                      {playerGhinChip(
                        e.players?.ghin_number,
                        e.flagged_for_committee
                      )}
                      {e.flagged_for_committee ? (
                        <CommitteeReviewBadge
                          reason={e.flagged_committee_reason}
                        />
                      ) : null}
                    </span>
                  </td>

                  <td className="px-1 py-1">{e.players?.club_label ?? "-"}</td>

                  <td className="px-1 py-1 text-right">
                    <EditableHiCell
                      entryId={e.id}
                      tournamentId={tournamentId}
                      initialHi={
                        e.handicap_index != null
                          ? Number(e.handicap_index)
                          : null
                      }
                    />
                  </td>

                  <td
                    className="px-1 py-1 text-right tabular-nums font-mono text-slate-700"
                    title="Course Handicap (informativo, HI × Slope/113 + (CR − Par) según la salida asignada)"
                  >
                    {e.course_handicap != null
                      ? Math.round(Number(e.course_handicap))
                      : "—"}
                  </td>

                  <td
                    className={`px-1 py-1 text-right tabular-nums font-mono font-semibold ${
                      e.playing_handicap_override != null
                        ? "text-amber-700"
                        : "text-emerald-700"
                    }`}
                    title={
                      e.playing_handicap_override != null
                        ? `Playing Handicap (override manual${
                            e.playing_handicap_override_reason
                              ? `: ${e.playing_handicap_override_reason}`
                              : ""
                          })`
                        : "Playing Handicap (fijo, HC × % allowance del torneo)"
                    }
                  >
                    {e.playing_handicap != null
                      ? Math.round(Number(e.playing_handicap))
                      : "—"}
                    {e.playing_handicap_override != null ? (
                      <span className="ml-0.5 text-[8px] uppercase text-amber-700">
                        ovr
                      </span>
                    ) : null}
                  </td>

                  <td className="px-1 py-1">
                    <span className="inline-flex h-6 max-w-[190px] items-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium text-gray-800">
                      <span className="truncate">
                        {e.categories?.code ? `${e.categories.code} - ` : ""}
                        {e.categories?.name ?? "-"}
                      </span>
                    </span>
                  </td>

                  {matchPlayPairs ? (
                    <td className="px-1 py-1">
                      {partnerByEntryId[e.id] ? (
                        <span className="inline-flex h-6 max-w-[200px] items-center rounded border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-medium text-emerald-900">
                          <span className="truncate">
                            {partnerByEntryId[e.id].full_name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10px] italic text-gray-500">
                          sin pareja
                        </span>
                      )}
                    </td>
                  ) : null}

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
                    <EntryRoundBalls entry={e} te={te} />
                  </td>

                  <td className={`${ACTIONS_COL} px-1 py-1`}>
                    <EntryRowActions
                      entry={e}
                      tournamentId={tournamentId}
                      categories={categories}
                      te={te}
                      onGenerateLinks={handleGenerateLinks}
                    />
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={matchPlayPairs ? 11 : 10}
                  className="p-2 text-gray-600"
                >
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