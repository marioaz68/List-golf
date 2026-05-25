import Link from "next/link";
import type { PublicPairingGroup, RoundRow } from "../lib/types";
import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import { formatStartingHoleLabelParts } from "@/lib/tee-sheet/formatStartingHoleLabel";
import { pairingGroupMatchesCategory } from "@/lib/tee-sheet/pairingGroupCategoryMatch";
import {
  MATCH_PLAY_PAIR_COLORS,
  compactPlayerName,
  matchPlayPairSideForPosition,
  parseMatchPlayGroupNotes,
} from "@/lib/tee-sheet/matchPlayPairing";
import {
  buildHref,
  formatPublicSalidasKicker,
  formatPublicTeeSheetRoundPill,
  formatPublicTeeSheetSectionTitle,
  formatTime,
  sectionPillClasses,
} from "../lib/utils";

type PublicTeeSheetViewProps = {
  groups: PublicPairingGroup[];
  rounds: RoundRow[];
  tournamentId: string;
  selectedCategoryUuid: string;
  selectedCategoryCode: string;
  selectedRoundId: string | null;
  labels: {
    empty: string;
    noGroupsFilter: string;
    publishedStarts: string;
    groupOne: string;
    groupMany: string;
    startingTee: string;
    playerOne: string;
    playersMany: string;
    scoreHcp: string;
    scoreR1: string;
    scoreR1R2: string;
  };
};

function pairingScoreColumnLabel(
  roundNo: number,
  labels: PublicTeeSheetViewProps["labels"]
) {
  if (roundNo <= 1) return labels.scoreHcp;
  if (roundNo === 2) return labels.scoreR1;
  return labels.scoreR1R2;
}

export default function PublicTeeSheetView({
  groups,
  rounds,
  tournamentId,
  selectedCategoryUuid,
  selectedCategoryCode,
  selectedRoundId,
  labels,
}: PublicTeeSheetViewProps) {
  // El servidor ya envía solo jornadas publicadas para esta categoría.
  const confirmedRounds = rounds;
  const activeRoundId =
    selectedRoundId && confirmedRounds.some((r) => r.id === selectedRoundId)
      ? selectedRoundId
      : confirmedRounds[0]?.id ?? null;

  const filteredGroups = groups
    .filter((group) => !activeRoundId || group.round_id === activeRoundId)
    .filter((group) =>
      pairingGroupMatchesCategory(
        group.notes,
        group.members,
        selectedCategoryCode,
        undefined,
        selectedCategoryUuid
      )
    )
    .map((group) => {
      const matchByGroupNotes =
        !!selectedCategoryCode &&
        pairingGroupMatchesCategory(
          group.notes,
          [],
          selectedCategoryCode,
          undefined,
          selectedCategoryUuid
        );
      return {
        ...group,
        members:
          selectedCategoryCode && !matchByGroupNotes
            ? group.members.filter((member) =>
                pairingGroupMatchesCategory(
                  null,
                  [member],
                  selectedCategoryCode,
                  undefined,
                  selectedCategoryUuid
                )
              )
            : group.members,
      };
    })
    .filter((group) => group.members.length > 0 || !selectedCategoryCode);

  const groupsByRound = new Map<string, PublicPairingGroup[]>();
  for (const group of filteredGroups) {
    const list = groupsByRound.get(group.round_id) ?? [];
    list.push(group);
    groupsByRound.set(group.round_id, list);
  }

  if (confirmedRounds.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-300">
        {labels.empty}
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      {confirmedRounds.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {confirmedRounds.map((round) => (
            <Link
              key={round.id}
              href={buildHref({
                tournamentId,
                categoryId: selectedCategoryUuid || null,
                roundId: round.id,
                view: "tee-sheet",
              })}
              className={sectionPillClasses(activeRoundId === round.id)}
            >
              {formatPublicTeeSheetRoundPill(round)}
            </Link>
          ))}
        </div>
      ) : null}

      {filteredGroups.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-300">
          {labels.noGroupsFilter}
        </div>
      ) : null}

      {confirmedRounds
        .filter((round) => !activeRoundId || round.id === activeRoundId)
        .map((round) => {
          const roundGroups = (groupsByRound.get(round.id) ?? []).sort(
            (a, b) => a.group_no - b.group_no
          );
          if (roundGroups.length === 0) return null;

          const salidasKicker = formatPublicSalidasKicker(round);
          const scoreColumnLabel = pairingScoreColumnLabel(round.round_no, labels);

          return (
            <section key={round.id} className="space-y-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 sm:text-xs">
                    {labels.publishedStarts}
                    {salidasKicker ? ` · ${salidasKicker}` : ""}
                  </div>
                  <h2 className="mt-1 break-words text-lg font-black text-white sm:text-xl">
                    {formatPublicTeeSheetSectionTitle(round)}
                  </h2>
                </div>
                <div className="shrink-0 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200 sm:self-auto">
                  {roundGroups.length}{" "}
                  {roundGroups.length === 1 ? labels.groupOne : labels.groupMany}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {roundGroups.map((group) => {
                  const { holeText, side } = formatStartingHoleLabelParts(
                    group.starting_hole_label,
                    group.starting_hole
                  );

                  const matchPlayInfo = parseMatchPlayGroupNotes(group.notes);
                  const isMatchPlay = matchPlayInfo.isMatchPlay;
                  const topPair = MATCH_PLAY_PAIR_COLORS.top;
                  const bottomPair = MATCH_PLAY_PAIR_COLORS.bottom;

                  return (
                    <article
                      key={group.id}
                      className={[
                        "min-w-0 overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                        isMatchPlay
                          ? "border-slate-400/60 bg-slate-200"
                          : "border-white/10 bg-[#0c1728]",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex flex-col gap-2 border-b px-2.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-3 sm:py-2",
                          isMatchPlay
                            ? "border-slate-300 bg-slate-300/80"
                            : "border-white/10 bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-[11px] font-black sm:text-xs",
                              isMatchPlay
                                ? "border border-slate-500/50 bg-slate-100 text-slate-800"
                                : "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
                            ].join(" ")}
                          >
                            G{group.group_no}
                          </span>
                          <span
                            className={[
                              "text-sm font-bold",
                              isMatchPlay ? "text-slate-900" : "text-white",
                            ].join(" ")}
                          >
                            {formatTime(group.tee_time)}
                          </span>
                          {holeText !== "—" ? (
                            <>
                              <span
                                className={[
                                  "rounded-md px-2 py-1 text-[11px] font-bold sm:text-xs",
                                  isMatchPlay
                                    ? "border border-slate-500/40 bg-slate-100 text-slate-800"
                                    : "border border-white/10 bg-white/5 text-slate-100",
                                ].join(" ")}
                              >
                                {holeText}
                              </span>
                              {side ? (
                                <span
                                  className={[
                                    "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    isMatchPlay
                                      ? "border border-amber-500/50 bg-amber-100 text-amber-900"
                                      : "border border-amber-300/35 bg-amber-400/15 text-amber-100",
                                  ].join(" ")}
                                >
                                  {labels.startingTee} {side}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span
                              className={[
                                "rounded-md px-2 py-1 text-[11px] font-bold",
                                isMatchPlay
                                  ? "border border-slate-400/50 bg-slate-100 text-slate-500"
                                  : "border border-white/10 bg-white/5 text-slate-400",
                              ].join(" ")}
                            >
                              —
                            </span>
                          )}
                        </div>
                        <div
                          className={[
                            "text-[10px] font-semibold sm:text-[11px]",
                            isMatchPlay ? "text-slate-700" : "text-slate-400",
                          ].join(" ")}
                        >
                          {group.members.length}{" "}
                          {group.members.length === 1
                            ? labels.playerOne
                            : labels.playersMany}
                        </div>
                      </div>

                      {isMatchPlay ? (
                        <div className="flex items-center justify-between gap-2 border-b border-slate-300 bg-slate-300/60 px-2.5 py-1.5 text-[11px] font-bold sm:px-3">
                          <span
                            className="inline-flex items-center rounded-md px-2 py-0.5"
                            style={{
                              backgroundColor: topPair.badgeBg,
                              color: topPair.badgeFg,
                            }}
                          >
                            {matchPlayInfo.topLabel}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            vs
                          </span>
                          <span
                            className="inline-flex items-center rounded-md px-2 py-0.5"
                            style={{
                              backgroundColor: bottomPair.badgeBg,
                              color: bottomPair.badgeFg,
                            }}
                          >
                            {matchPlayInfo.bottomLabel}
                          </span>
                        </div>
                      ) : null}

                      <div
                        className={
                          isMatchPlay
                            ? "divide-y divide-slate-400/50"
                            : "divide-y divide-white/10"
                        }
                      >
                        {group.members.map((member, idx) => {
                          const pairSide = isMatchPlay
                            ? matchPlayPairSideForPosition(member.position ?? idx + 1)
                            : null;
                          const pairColors = pairSide
                            ? MATCH_PLAY_PAIR_COLORS[pairSide]
                            : null;
                          const showPairDivider =
                            isMatchPlay &&
                            idx > 0 &&
                            pairSide !==
                              matchPlayPairSideForPosition(
                                group.members[idx - 1].position ?? idx
                              );

                          return (
                            <div
                              key={`${group.id}-${member.entry_id}`}
                              className={[
                                "relative flex items-start gap-2 px-2.5 py-2.5 sm:items-center sm:gap-3 sm:px-3 sm:py-2",
                                showPairDivider
                                  ? isMatchPlay
                                    ? "border-t-2 border-slate-500/70"
                                    : "border-t-2 border-white/30"
                                  : "",
                              ].join(" ")}
                              style={
                                pairColors
                                  ? {
                                      backgroundColor: pairColors.rowBg,
                                      borderLeft: `4px solid ${pairColors.accent}`,
                                    }
                                  : undefined
                              }
                            >
                              <ClubLogoThumb
                                clubId={member.club_id}
                                size={40}
                                title={member.club_label ?? undefined}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span
                                    className={[
                                      "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-black",
                                      pairColors
                                        ? ""
                                        : "border border-cyan-500/25 bg-cyan-500/10 text-cyan-200",
                                    ].join(" ")}
                                    style={
                                      pairColors
                                        ? {
                                            backgroundColor: pairColors.badgeBg,
                                            color: pairColors.badgeFg,
                                          }
                                        : undefined
                                    }
                                  >
                                    {member.position}
                                  </span>
                                  {member.tee_color ? (
                                    <span
                                      className="inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full ring-1 ring-white/40"
                                      style={{ background: member.tee_color }}
                                      title={
                                        member.tee_name
                                          ? `Sale de: ${member.tee_name}`
                                          : "Marca de salida asignada"
                                      }
                                      aria-label={
                                        member.tee_name
                                          ? `Sale de ${member.tee_name}`
                                          : "Marca de salida asignada"
                                      }
                                    />
                                  ) : null}
                                  <span
                                    className={[
                                      "min-w-0 break-words text-sm font-semibold leading-snug",
                                      pairColors ? "text-slate-900" : "text-white",
                                    ].join(" ")}
                                  >
                                    {isMatchPlay
                                      ? compactPlayerName({
                                          first_name: member.first_name,
                                          last_name: member.last_name,
                                          player_name: member.player_name,
                                        })
                                      : member.player_name}
                                  </span>
                                </div>
                                <div
                                  className={[
                                    "mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] leading-snug",
                                    pairColors ? "text-slate-700" : "text-slate-400",
                                  ].join(" ")}
                                >
                                  {member.club_label ? (
                                    <span className="break-words">{member.club_label}</span>
                                  ) : null}
                                  {member.category_code ? (
                                    <span className={pairColors ? "text-slate-600" : "text-slate-500"}>
                                      {member.club_label ? "· " : ""}
                                      {member.category_code}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div
                                className={[
                                  "shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums sm:pt-0",
                                  pairColors ? "text-slate-900" : "text-emerald-300",
                                ].join(" ")}
                              >
                                <span
                                  className={[
                                    "block text-[9px] font-semibold uppercase tracking-wide sm:hidden",
                                    pairColors ? "text-slate-600" : "text-slate-500",
                                  ].join(" ")}
                                >
                                  {scoreColumnLabel}
                                </span>
                                {round.round_no > 1
                                  ? member.standing_display ?? "—"
                                  : member.handicap_index ?? "—"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
