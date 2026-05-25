import Link from "next/link";
import type { PublicPairingGroup, RoundRow } from "../lib/types";
import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import { formatStartingHoleLabelParts } from "@/lib/tee-sheet/formatStartingHoleLabel";
import { pairingGroupMatchesCategory } from "@/lib/tee-sheet/pairingGroupCategoryMatch";
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

                  return (
                    <article
                      key={group.id}
                      className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    >
                      <div className="flex flex-col gap-2 border-b border-white/10 bg-white/[0.04] px-2.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-3 sm:py-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-black text-cyan-200 sm:text-xs">
                            G{group.group_no}
                          </span>
                          <span className="text-sm font-bold text-white">
                            {formatTime(group.tee_time)}
                          </span>
                          {holeText !== "—" ? (
                            <>
                              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-100 sm:text-xs">
                                {holeText}
                              </span>
                              {side ? (
                                <span className="rounded-md border border-amber-300/35 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                                  {labels.startingTee} {side}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-400">
                              —
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                          {group.members.length}{" "}
                          {group.members.length === 1
                            ? labels.playerOne
                            : labels.playersMany}
                        </div>
                      </div>

                      <div className="divide-y divide-white/10">
                        {group.members.map((member) => (
                          <div
                            key={`${group.id}-${member.entry_id}`}
                            className="flex items-start gap-2 px-2.5 py-2.5 sm:items-center sm:gap-3 sm:px-3 sm:py-2"
                          >
                            <ClubLogoThumb
                              clubId={member.club_id}
                              size={40}
                              title={member.club_label ?? undefined}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 text-xs font-black text-cyan-200">
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
                                <span className="min-w-0 break-words text-sm font-semibold leading-snug text-white">
                                  {member.player_name}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-slate-400">
                                {member.club_label ? (
                                  <span className="break-words">{member.club_label}</span>
                                ) : null}
                                {member.category_code ? (
                                  <span className="text-slate-500">
                                    {member.club_label ? "· " : ""}
                                    {member.category_code}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-emerald-300 sm:pt-0">
                              <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">
                                {scoreColumnLabel}
                              </span>
                              {round.round_no > 1
                                ? member.standing_display ?? "—"
                                : member.handicap_index ?? "—"}
                            </div>
                          </div>
                        ))}
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
