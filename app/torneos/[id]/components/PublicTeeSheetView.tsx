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
    <div className="space-y-5">
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
          const roundGroups = groupsByRound.get(round.id) ?? [];
          if (roundGroups.length === 0) return null;

          return (
            <section key={round.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                    Salidas publicadas
                  </div>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Ronda {round.round_no} · {formatDate(round.round_date)}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {roundGroups.length} grupo{roundGroups.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {roundGroups.map((group) => (
                  <article
                    key={group.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-black text-cyan-200">
                          G{group.group_no}
                        </span>
                        <span className="text-sm font-bold text-white">
                          {formatTime(group.tee_time)}
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-slate-200">
                          {group.starting_hole ? `H${group.starting_hole}` : "H-"}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {group.members.length} jugador
                        {group.members.length === 1 ? "" : "es"}
                      </div>
                    </div>

                    <div className="divide-y divide-white/10">
                      {group.members.map((member) => (
                        <div
                          key={`${group.id}-${member.entry_id}`}
                          className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-3 py-2 text-sm"
                        >
                          <div className="text-center font-black text-cyan-300">
                            {member.position}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">
                              {member.player_name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-slate-400">
                              {member.club_label ? (
                                <span>{member.club_label}</span>
                              ) : null}
                              {member.category_code ? (
                                <span>· {member.category_code}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right text-xs font-bold text-emerald-300">
                            {member.handicap_index ?? "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
