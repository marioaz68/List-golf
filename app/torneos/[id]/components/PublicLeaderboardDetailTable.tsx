import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import type { LeaderboardRow } from "../lib/types";
import {
  formatRelativeOrDQ,
  formatScore,
  formatScoreOrDQ,
  scoreMarker,
  selectLeaderboardDetailsForPlayer,
  subtotal,
} from "../lib/utils";

export default function PublicLeaderboardDetailTable({
  row,
}: {
  row: LeaderboardRow;
}) {
  const displayDetails = selectLeaderboardDetailsForPlayer(row);

  const baseRound =
    displayDetails.find((detail) =>
      detail.holes.some((hole) => hole.par != null)
    ) ??
    displayDetails[0] ??
    row.details.find((detail) => detail.holes.some((hole) => hole.par != null)) ??
    row.details[0] ??
    null;

  const baseHoles = baseRound?.holes ?? [];

  return (
    <div className="mx-auto mt-2 w-full max-w-full overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300">
        <ClubLogoThumb
          clubId={row.club_id}
          size={28}
          title={row.club_label ?? undefined}
        />
        <div className="min-w-0">
          {row.player_code}
          {row.club_label ? ` • ${row.club_label}` : ""}
          {row.category_code ? ` • ${row.category_code}` : ""}
          {row.is_disqualified ? ` • DQ` : ""}
        </div>
      </div>

      <table className="w-full min-w-[960px] table-fixed border-collapse text-[10px] text-white sm:text-[11px]">
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th className="w-[70px] border-b border-white/10 px-2 py-2 text-left font-semibold">
              HOYOS
            </th>

            {Array.from({ length: 18 }, (_, i) => (
              <th
                key={`hdr-${row.entry_id}-${i + 1}`}
                className="w-[34px] border-b border-white/10 px-1 py-2 text-center font-semibold"
              >
                {i + 1}
              </th>
            ))}

            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              OUT
            </th>
            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              IN
            </th>
            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              TOT
            </th>
            <th className="w-[52px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              GROSS
            </th>
            <th className="w-[64px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              TO PAR
            </th>
            <th className="w-[44px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              POS
            </th>
          </tr>
        </thead>

        <tbody>
          <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
            <td className="border-b border-white/10 px-2 py-2 font-semibold">
              Par
            </td>

            {Array.from({ length: 18 }, (_, i) => {
              const hole = baseHoles[i];
              return (
                <td
                  key={`par-${row.entry_id}-${i + 1}`}
                  className="border-b border-white/10 px-1 py-2 text-center font-semibold"
                >
                  {formatScore(hole?.par ?? null)}
                </td>
              );
            })}

            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 0, 9, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 9, 18, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 0, 18, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
          </tr>

          {displayDetails.map((detail, detailIndex) => {
            const standing =
              row.standing_by_round_category.find(
                (s) => s.round_id === detail.round_id
              ) ??
              row.standing_by_round.find((s) => s.round_id === detail.round_id) ??
              null;

            return (
              <tr
                key={`detail-${row.entry_id}-${detail.round_id}`}
                className={
                  detailIndex % 2 === 0
                    ? "bg-white/[0.03] text-white"
                    : "bg-[#0b1728] text-white"
                }
              >
                <td className="border-b border-white/10 px-2 py-1.5 font-semibold text-cyan-100">
                  R{detail.round_no}
                </td>

                {detail.holes.map((hole) => {
                  const marker = scoreMarker(hole.strokes, hole.par);

                  return (
                    <td
                      key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                      className="border-b border-white/10 px-1 py-1 text-center"
                    >
                      <span className={marker.wrapper}>
                        {marker.outer ? <span aria-hidden className={marker.outer} /> : null}
                        {marker.inner ? <span aria-hidden className={marker.inner} /> : null}
                        <span
                          className={`relative z-10 text-[10px] font-semibold ${marker.textClass}`}
                        >
                          {formatScore(hole.strokes)}
                        </span>
                      </span>
                    </td>
                  );
                })}

                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.total_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScoreOrDQ(detail.gross_score, detail.is_dq)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatRelativeOrDQ(detail.to_par, detail.is_dq)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : standing?.pos ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
