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
import EditableTeeSetCell, { type TeeSetOption } from "./EditableTeeSetCell";
import { formatOfficialHcp80Detail } from "@/lib/handicap/resolveTournamentEntryHandicap";

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

type CaddieAssignmentSummary = {
  /** Al menos una asignación activa de caddie en este torneo. */
  hasCaddie: boolean;
  /** Total de rondas del torneo donde tiene sentido asignar caddie (>0). */
  totalRounds: number;
  /** Rondas con al menos un caddie activo asignado. */
  roundsWithCaddie: number;
  /** Etiqueta resumida (ej. "Carlos M."). */
  label: string | null;
};

type Entry = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  course_handicap?: number | null;
  playing_handicap?: number | null;
  playing_handicap_override?: number | null;
  playing_handicap_override_reason?: string | null;
  allowance_pct_applied?: number | null;
  official_hcp_80?: {
    hp: number;
    ch: number;
    chExact: number;
    hi: number;
    slope: number;
    course_rating: number;
    par: number;
    teeCode: string | null;
    allowancePct?: number;
  } | null;
  status: string | null;
  flagged_for_committee?: boolean;
  flagged_committee_reason?: string | null;
  telegram_kit_sent_at?: string | null;
  telegram_kit_received_at?: string | null;
  round_signatures?: RoundSignature[] | null;
  tee_set_id_assigned?: string | null;
  tee_set_id_override?: string | null;
  caddie_summary?: CaddieAssignmentSummary | null;
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
const SLOT_CAD_PAIR = "shrink-0 md:w-[168px]";
const SLOT_EDIT = "shrink-0 md:w-[110px]";
const SLOT_EDIT_PAIR = "shrink-0 md:w-[168px]";
const ACTIONS_COL = "min-w-0 md:min-w-[820px] md:w-[820px]";
const ACTIONS_COL_PAIRS = "min-w-0 md:min-w-[980px] md:w-[980px]";

const MOBILE_ACTION_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center rounded border px-2 text-[10px] font-bold leading-none text-white whitespace-nowrap disabled:opacity-50";

type PartnerInfo = {
  entry_id: string;
  player_id: string | null;
  full_name: string;
  my_slot?: 1 | 2;
  jug1_entry_id?: string;
  jug2_entry_id?: string;
  jug1_name?: string;
  jug2_name?: string;
};

type EntryRowActionsProps = {
  entry: Entry;
  tournamentId: string;
  categories: Category[];
  te: ReturnType<typeof useAppLocale>["t"]["entries"]["list"];
  compact?: boolean;
  onGenerateLinks: (entryId: string) => void;
  /** Pareja match play: dos botones Caddie J1 / J2. */
  partner?: PartnerInfo | null;
  partnerEntry?: Entry | null;
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
  partner = null,
  partnerEntry = null,
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
        {isFlagged ? "Quitar comité" : "→ Comité"}
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

  /**
   * Enlace directo a /caddies/asignar. En parejas match play: dos botones
   * (Caddie J1 / Caddie J2) para no confundir a cuál jugador se asigna.
   */
  function caddieLinkFor(
    targetEntryId: string,
    summary: CaddieAssignmentSummary | null | undefined,
    label: string,
    playerName: string,
    jug?: 1 | 2 | null
  ) {
    const has = Boolean(summary?.hasCaddie);
    const state: "none" | "assigned" = has ? "assigned" : "none";
    const colors = {
      none: "border-red-800 bg-red-600 hover:bg-red-700",
      assigned: "border-emerald-800 bg-emerald-600 hover:bg-emerald-700",
    };
    const icon = has ? "✓" : "✕";
    const who = summary?.label ? ` — ${summary.label}` : "";
    const title = has
      ? `Caddie de ${playerName}${who}. Click para revisar.`
      : `Sin caddie para ${playerName}. Click para asignar.`;
    const jugQs = jug === 1 || jug === 2 ? `&jug=${jug}` : "";
    return (
      <Link
        href={`/caddies/asignar?entry_id=${encodeURIComponent(
          targetEntryId
        )}&tournament_id=${encodeURIComponent(
          tournamentId
        )}${jugQs}&back=${encodeURIComponent(
          `/entries?tournament_id=${tournamentId}`
        )}`}
        title={title}
        className={
          compact
            ? `${MOBILE_ACTION_BTN} ${colors[state]}`
            : `inline-flex h-7 w-full items-center justify-center rounded border text-[11px] font-bold text-white ${colors[state]}`
        }
      >
        <span className="mr-0.5">{icon}</span>
        {label}
      </Link>
    );
  }

  const selfName =
    `${entry.players?.last_name ?? ""} ${entry.players?.first_name ?? ""}`.trim() ||
    "Jugador";

  const pairHasBoth =
    Boolean(partner?.jug1_entry_id) && Boolean(partner?.jug2_entry_id);

  const jug1EntryId = partner?.jug1_entry_id ?? "";
  const jug2EntryId = partner?.jug2_entry_id ?? "";
  const jug1Name = partner?.jug1_name ?? "Jugador 1";
  const jug2Name = partner?.jug2_name ?? "Jugador 2";

  const jug1Summary =
    jug1EntryId === entry.id
      ? entry.caddie_summary
      : partnerEntry?.id === jug1EntryId
        ? partnerEntry.caddie_summary
        : null;
  const jug2Summary =
    jug2EntryId === entry.id
      ? entry.caddie_summary
      : partnerEntry?.id === jug2EntryId
        ? partnerEntry.caddie_summary
        : null;

  const caddieBtn = pairHasBoth ? (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-1"
          : "flex w-full items-center gap-1"
      }
    >
      {caddieLinkFor(jug1EntryId, jug1Summary, "Caddie J1", jug1Name, 1)}
      {caddieLinkFor(jug2EntryId, jug2Summary, "Caddie J2", jug2Name, 2)}
    </div>
  ) : (
    caddieLinkFor(entry.id, entry.caddie_summary, "Caddie", selfName, null)
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

  const editControlFor = (
    target: Entry | null | undefined,
    label: string,
    playerName: string
  ) => {
    if (!target) {
      return (
        <button
          type="button"
          disabled
          title={`${playerName} no disponible`}
          className="inline-flex h-6 items-center justify-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium leading-none text-gray-400"
        >
          {label}
        </button>
      );
    }
    return (
      <PlayerRowActions
        tournamentId={tournamentId}
        entryId={target.id}
        currentCategoryId={target.categories?.id ?? null}
        categories={categories}
        entryCourseHandicap={target.course_handicap ?? null}
        entryPlayingHandicap={target.playing_handicap ?? null}
        entryPlayingHandicapOverride={
          target.playing_handicap_override ?? null
        }
        entryAllowancePct={target.allowance_pct_applied ?? null}
        caddieSummary={target.caddie_summary ?? null}
        buttonLabel={label}
        buttonTitle={`Editar ${playerName}`}
        player={
          target.players
            ? {
                id: target.players.id,
                first_name: target.players.first_name,
                last_name: target.players.last_name,
                initials: target.players.initials ?? null,
                gender: target.players.gender ?? null,
                handicap_index: target.players.handicap_index ?? null,
                handicap_torneo:
                  target.handicap_index ??
                  target.players.handicap_torneo ??
                  null,
                phone: target.players.phone ?? null,
                email: target.players.email ?? null,
                club: target.players.club ?? null,
                club_id: target.players.club_id ?? null,
                ghin_number: target.players.ghin_number ?? null,
                shirt_size: target.players.shirt_size ?? null,
                shoe_size: target.players.shoe_size ?? null,
                birth_year: target.players.birth_year ?? null,
                telegram_user_id: target.players.telegram_user_id ?? null,
                telegram_chat_id: target.players.telegram_chat_id ?? null,
              }
            : null
        }
      />
    );
  };

  const jug1Entry =
    jug1EntryId === entry.id
      ? entry
      : partnerEntry?.id === jug1EntryId
        ? partnerEntry
        : null;
  const jug2Entry =
    jug2EntryId === entry.id
      ? entry
      : partnerEntry?.id === jug2EntryId
        ? partnerEntry
        : null;

  const editControl = pairHasBoth ? (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-1"
          : "flex w-full items-center gap-1"
      }
    >
      {editControlFor(jug1Entry, "Editar J1", jug1Name)}
      {editControlFor(jug2Entry, "Editar J2", jug2Name)}
    </div>
  ) : (
    editControlFor(entry, "Editar", selfName)
  );

  return (
    <div
      className={
        compact
          ? "flex max-w-[min(52vw,16.5rem)] shrink-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain"
          : `flex flex-nowrap items-center gap-2 ${
              pairHasBoth ? ACTIONS_COL_PAIRS : ACTIONS_COL
            }`
      }
    >
      {wrap(telegramBtn, SLOT_MD)}
      {wrap(caddieBtn, pairHasBoth ? SLOT_CAD_PAIR : SLOT_MD)}
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
        pairHasBoth ? SLOT_EDIT_PAIR : SLOT_EDIT
      )}
    </div>
  );
}

export default function EntriesListPanel({
  entries,
  tournamentId,
  categories,
  matchPlayPairs = false,
  partnerByEntryId = {},
  teeSets = [],
}: {
  entries: Entry[];
  tournamentId: string;
  categories: Category[];
  matchPlayPairs?: boolean;
  partnerByEntryId?: Record<string, PartnerInfo>;
  teeSets?: TeeSetOption[];
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

  const entryById = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(e.id, e);
    return m;
  }, [entries]);

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
                    {e.official_hcp_80 ? (
                      <>
                        {" "}
                        · 80%{" "}
                        <span
                          className="font-mono font-semibold text-indigo-800"
                          title={formatOfficialHcp80Detail(e.official_hcp_80)}
                        >
                          {e.official_hcp_80.hp}
                        </span>
                      </>
                    ) : null}
                    {" · "}
                    {categoryLabel}
                  </p>
                  {matchPlayPairs ? (
                    <p className="mt-0.5 truncate text-[10px] text-emerald-700">
                      {partnerByEntryId[e.id]?.jug1_name &&
                      partnerByEntryId[e.id]?.jug2_name ? (
                        <>
                          Pareja · J1{" "}
                          <span className="font-semibold">
                            {partnerByEntryId[e.id].jug1_name}
                          </span>
                          {" · J2 "}
                          <span className="font-semibold">
                            {partnerByEntryId[e.id].jug2_name}
                          </span>
                        </>
                      ) : (
                        <>
                          Pareja:{" "}
                          <span className="font-semibold">
                            {partnerByEntryId[e.id]?.full_name ?? "sin pareja"}
                          </span>
                        </>
                      )}
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
                  partner={partnerByEntryId[e.id] ?? null}
                  partnerEntry={
                    partnerByEntryId[e.id]?.entry_id
                      ? entryById.get(partnerByEntryId[e.id].entry_id) ?? null
                      : null
                  }
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
                title="Handicap Index (HI, editable). DEFINE LA CATEGORÍA en la que queda inscrito el jugador. Al guardarlo, CH y PH se recalculan automáticamente."
              >
                HI ✎
              </th>
              <th
                className="px-1 py-1 text-right"
                title="Course Handicap (HC, referencia del campo): HI × Slope/113 + (CR − Par) usando la salida que la regla salida/categoría asigna en este torneo."
              >
                HC
              </th>
              <th
                className="px-1 py-1 text-right"
                title="Playing Handicap (PH) — HANDICAP DEL TORNEO. Es el handicap con el que el jugador compite todo el torneo (si es con handicap). PH = HC × % de la regla de competencia."
              >
                PH
              </th>
              <th
                className="px-1 py-1 text-right"
                title={te.thHcp80Title}
              >
                {te.thHcp80}
              </th>
              <th className="px-1 py-1 text-left">{te.thCat}</th>
              <th
                className="px-1 py-1 text-left"
                title="Salida (color de tee). Por defecto la calcula la regla de categoría. Si el comité la cambia, se recalculan CH/PH y se actualizan reportes, tarjetas, grupos y comité."
              >
                Salida
              </th>
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

                  <td
                    className="px-1 py-1 text-right tabular-nums font-mono font-semibold text-indigo-800"
                    title={
                      e.official_hcp_80
                        ? formatOfficialHcp80Detail(e.official_hcp_80)
                        : te.thHcp80Title
                    }
                  >
                    {e.official_hcp_80 ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span>{e.official_hcp_80.hp}</span>
                        <span className="max-w-[11rem] truncate text-[8px] font-medium text-slate-500">
                          {e.official_hcp_80.allowancePct ?? 80}% · HI{" "}
                          {e.official_hcp_80.hi.toFixed(1)}
                          {e.official_hcp_80.teeCode
                            ? ` · ${e.official_hcp_80.teeCode}`
                            : ""}{" "}
                          · CH {e.official_hcp_80.ch}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="px-1 py-1">
                    <span className="inline-flex h-6 max-w-[190px] items-center rounded border border-gray-300 bg-gray-100 px-2 text-[10px] font-medium text-gray-800">
                      <span className="truncate">
                        {e.categories?.code ? `${e.categories.code} - ` : ""}
                        {e.categories?.name ?? "-"}
                      </span>
                    </span>
                  </td>

                  <td className="px-1 py-1">
                    <EditableTeeSetCell
                      entryId={e.id}
                      tournamentId={tournamentId}
                      teeSets={teeSets}
                      assignedTeeSetId={e.tee_set_id_assigned ?? null}
                      overrideTeeSetId={e.tee_set_id_override ?? null}
                    />
                  </td>

                  {matchPlayPairs ? (
                    <td className="px-1 py-1">
                      {partnerByEntryId[e.id] ? (
                        <span className="inline-flex max-w-[220px] flex-col rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium leading-tight text-emerald-900">
                          <span className="truncate">
                            J1 · {partnerByEntryId[e.id].jug1_name ?? "—"}
                          </span>
                          <span className="truncate">
                            J2 · {partnerByEntryId[e.id].jug2_name ?? partnerByEntryId[e.id].full_name}
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

                  <td
                    className={`${
                      matchPlayPairs && partnerByEntryId[e.id]?.jug1_entry_id
                        ? ACTIONS_COL_PAIRS
                        : ACTIONS_COL
                    } px-1 py-1`}
                  >
                    <EntryRowActions
                      entry={e}
                      tournamentId={tournamentId}
                      categories={categories}
                      te={te}
                      onGenerateLinks={handleGenerateLinks}
                      partner={partnerByEntryId[e.id] ?? null}
                      partnerEntry={
                        partnerByEntryId[e.id]?.entry_id
                          ? entryById.get(partnerByEntryId[e.id].entry_id) ??
                            null
                          : null
                      }
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