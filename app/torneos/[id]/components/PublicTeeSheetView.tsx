import Link from "next/link";
import type { PublicPairingGroup, RoundRow } from "../lib/types";
import {
  buildHref,
  formatDate,
  formatTime,
  isStartingOrderConfirmed,
  sectionPillClasses,
} from "../lib/utils";

type PublicTeeSheetViewProps = {
  groups: PublicPairingGroup[];
  rounds: RoundRow[];
  tournamentId: string;
  selectedCategoryId: string;
  selectedRoundId: string | null;
};

/** Interpreta etiquetas tipo `H1A`, `H10B` o `H12` (tee time). */
function parseHoleSalida(label: string | null) {
  if (!label) return { hole: null as string | null, side: null as "A" | "B" | null };
  const m = /^H(\d+)([AB])?$/i.exec(label.trim());
  if (!m) return { hole: null, side: null };
  const hole = m[1];
  const raw = m[2]?.toUpperCase();
  const side = raw === "A" || raw === "B" ? raw : null;
  return { hole, side };
}

function ClubLogoThumb({ clubId }: { clubId: string | null }) {
  if (!clubId) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[10px] font-bold text-slate-500"
        aria-hidden
      >
        —
      </div>
    );
  }
  const src = `/api/club-logo?club_id=${encodeURIComponent(clubId)}`;
  return (
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-xl border border-white/15 bg-white object-contain p-0.5 shadow-inner shadow-black/20"
      loading="lazy"
      decoding="async"
    />
  );
}

export default function PublicTeeSheetView({
  groups,
  rounds,
  tournamentId,
  selectedCategoryId,
  selectedRoundId,
}: PublicTeeSheetViewProps) {
  const confirmedRounds = rounds.filter((round) =>
    isStartingOrderConfirmed(round.notes)
  );

  const filteredGroups = groups
    .filter((group) => !selectedRoundId || group.round_id === selectedRoundId)
    .map((group) => ({
      ...group,
      members: selectedCategoryId
        ? group.members.filter(
            (member) => member.category_code === selectedCategoryId
          )
        : group.members,
    }))
    .filter((group) => group.members.length > 0 || !selectedCategoryId);

  const groupsByRound = new Map<string, PublicPairingGroup[]>();
  for (const group of filteredGroups) {
    const list = groupsByRound.get(group.round_id) ?? [];
    list.push(group);
    groupsByRound.set(group.round_id, list);
  }

  if (confirmedRounds.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-300">
        Aún no hay salidas publicadas. El comité debe confirmar/cerrar el orden
        definitivo del día en Tee Sheet.
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref({
            tournamentId,
            categoryId: selectedCategoryId || null,
            view: "tee-sheet",
          })}
          className={sectionPillClasses(!selectedRoundId)}
        >
          Todos los días
        </Link>

        {confirmedRounds.map((round) => (
          <Link
            key={round.id}
            href={buildHref({
              tournamentId,
              categoryId: selectedCategoryId || null,
              roundId: round.id,
              view: "tee-sheet",
            })}
            className={sectionPillClasses(selectedRoundId === round.id)}
          >
            R{round.round_no} · {formatDate(round.round_date)}
          </Link>
        ))}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-300">
          No hay grupos para mostrar con este filtro.
        </div>
      ) : null}

      {confirmedRounds
        .filter((round) => !selectedRoundId || round.id === selectedRoundId)
        .map((round) => {
          const roundGroups = (groupsByRound.get(round.id) ?? []).sort(
            (a, b) => a.group_no - b.group_no
          );
          if (roundGroups.length === 0) return null;

          return (
            <section key={round.id} className="space-y-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-4">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 sm:text-xs">
                    Salidas publicadas
                  </div>
                  <h2 className="mt-1 break-words text-lg font-black text-white sm:text-xl">
                    Ronda {round.round_no} · {formatDate(round.round_date)}
                  </h2>
                </div>
                <div className="shrink-0 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200 sm:self-auto">
                  {roundGroups.length} grupo{roundGroups.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {roundGroups.map((group) => {
                  const labelRaw =
                    group.starting_hole_label ??
                    (group.starting_hole != null
                      ? `H${group.starting_hole}`
                      : null);
                  const { hole, side } = parseHoleSalida(labelRaw);

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
                          {hole ? (
                            <>
                              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-100 sm:text-xs">
                                H{hole}
                              </span>
                              {side ? (
                                <span className="rounded-md border border-amber-300/35 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">
                                  Salida {side}
                                </span>
                              ) : null}
                            </>
                          ) : labelRaw ? (
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-100 sm:text-xs">
                              {labelRaw}
                            </span>
                          ) : (
                            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-400">
                              H—
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                          {group.members.length} jugador
                          {group.members.length === 1 ? "" : "es"}
                        </div>
                      </div>

                      <div className="divide-y divide-white/10">
                        {group.members.map((member) => (
                          <div
                            key={`${group.id}-${member.entry_id}`}
                            className="flex items-start gap-2 px-2.5 py-2.5 sm:items-center sm:gap-3 sm:px-3 sm:py-2"
                          >
                            <ClubLogoThumb clubId={member.club_id} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 px-1.5 text-xs font-black text-cyan-200">
                                  {member.position}
                                </span>
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
                                HCP
                              </span>
                              {member.handicap_index ?? "—"}
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
