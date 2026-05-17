"use client";

import type { RefObject } from "react";

type Hole = {
  hole_number: number;
  par: number;
  handicap_index: number;
};

type CapturedRound = {
  round_id: string;
  round_no: number;
  scores: Record<number, number>;
};

const scorecardScrollClass =
  "w-full min-w-0 overflow-x-auto overflow-y-visible overscroll-x-contain [-webkit-overflow-scrolling:touch]";

const scorecardTableClass =
  "w-max min-w-[540px] border-separate border-spacing-0 text-[10px] text-black md:text-xs";

function stickyLabelCell(bg: string) {
  return `sticky left-0 z-10 w-11 min-w-[44px] max-w-[48px] border-r border-gray-200 px-1 py-0.5 text-left text-[10px] font-semibold leading-tight shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] ${bg}`;
}

const holeHeadCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-200 px-0 py-0.5 text-center font-semibold leading-none";

const holeBodyCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-100 px-0 py-0.5 text-center align-middle text-[10px] leading-none";

const holeMetaCell =
  "w-7 min-w-[28px] max-w-[32px] border-b border-gray-200 px-0 py-0.5 text-center text-[9px] leading-none text-gray-700";

const totalHeadCell =
  "w-9 min-w-[36px] max-w-[44px] border-b border-gray-200 px-0.5 py-0.5 text-center text-[10px] font-semibold leading-none";

const totalBodyCell =
  "w-9 min-w-[36px] max-w-[44px] border-b border-gray-100 px-0.5 py-0.5 text-center text-[10px] font-semibold leading-none";

function sumByHoles(
  holes: Hole[],
  values: Record<number, string | number | undefined>
) {
  return holes.reduce((acc, h) => acc + Number(values[h.hole_number] || 0), 0);
}

function CapturedRoundsTable({
  title,
  rounds,
  frontHoles,
  backHoles,
  selectedRoundNo,
  variant,
}: {
  title: string;
  rounds: CapturedRound[];
  frontHoles: Hole[];
  backHoles: Hole[];
  selectedRoundNo: number;
  variant: "default" | "warning";
}) {
  if (rounds.length === 0) return null;

  const shell =
    variant === "warning"
      ? "border-amber-300 bg-amber-50"
      : "border-gray-200 bg-white";
  const titleClass =
    variant === "warning" ? "text-amber-950" : "text-gray-800";
  const headBg = variant === "warning" ? "bg-amber-100/80" : "bg-gray-50";

  return (
    <div className={`rounded-lg border p-2 shadow-sm ${shell}`}>
      <div className={`mb-2 text-sm font-semibold ${titleClass}`}>{title}</div>
      <div className={scorecardScrollClass}>
        <table className={scorecardTableClass}>
          <thead>
            <tr className={headBg}>
              <th className={stickyLabelCell(headBg)}>RONDA</th>
              {frontHoles.map((h) => (
                <th key={`capt-h-${h.hole_number}`} className={holeHeadCell}>
                  {h.hole_number}
                </th>
              ))}
              <th className={totalHeadCell}>F9</th>
              {backHoles.map((h) => (
                <th key={`capt-hb-${h.hole_number}`} className={holeHeadCell}>
                  {h.hole_number}
                </th>
              ))}
              <th className={totalHeadCell}>B9</th>
              <th className={totalHeadCell}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const rowFront9 = sumByHoles(frontHoles, r.scores);
              const rowBack9 = sumByHoles(backHoles, r.scores);
              const rowTotal = rowFront9 + rowBack9;
              const rowBg =
                variant === "warning"
                  ? "bg-amber-50"
                  : r.round_no === selectedRoundNo
                    ? "bg-green-50"
                    : "bg-white";

              return (
                <tr key={r.round_id} className={rowBg}>
                  <td className={stickyLabelCell(rowBg)}>R{r.round_no}</td>
                  {frontHoles.map((h) => (
                    <td
                      key={`${r.round_id}-f-${h.hole_number}`}
                      className={holeBodyCell}
                    >
                      {r.scores[h.hole_number] ?? ""}
                    </td>
                  ))}
                  <td className={totalBodyCell}>{rowFront9 || ""}</td>
                  {backHoles.map((h) => (
                    <td
                      key={`${r.round_id}-b-${h.hole_number}`}
                      className={holeBodyCell}
                    >
                      {r.scores[h.hole_number] ?? ""}
                    </td>
                  ))}
                  <td className={totalBodyCell}>{rowBack9 || ""}</td>
                  <td className={totalBodyCell}>{rowTotal || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CapturedRoundsScorecard({
  capturedRounds,
  frontHoles,
  backHoles,
  selectedRoundNo,
}: {
  capturedRounds: CapturedRound[];
  frontHoles: Hole[];
  backHoles: Hole[];
  selectedRoundNo: number;
}) {
  if (capturedRounds.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <CapturedRoundsTable
        title="Rondas capturadas"
        rounds={capturedRounds}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedRoundNo={selectedRoundNo}
        variant="default"
      />
    </div>
  );
}

export function EditableScorecard({
  holes,
  frontHoles,
  backHoles,
  scores,
  activeIndex,
  inputRefs,
  readOnly = false,
  onFocusIndex,
  onChange,
  onKeyDown,
}: {
  holes: Hole[];
  frontHoles: Hole[];
  backHoles: Hole[];
  scores: Record<number, string>;
  activeIndex: number;
  inputRefs: RefObject<(HTMLInputElement | null)[]>;
  readOnly?: boolean;
  onFocusIndex: (index: number) => void;
  onChange: (holeNumber: number, index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (
    holeNumber: number,
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => void;
}) {
  const front9 = sumByHoles(frontHoles, scores);
  const back9 = sumByHoles(backHoles, scores);
  const total = front9 + back9;

  const holeIndexMap = new Map<number, number>();
  holes.forEach((h, idx) => holeIndexMap.set(h.hole_number, idx));

  function renderInputCell(h: Hole) {
    const idx = holeIndexMap.get(h.hole_number) ?? 0;

    return (
      <td key={`in-${h.hole_number}`} className={holeBodyCell}>
        <input
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={scores[h.hole_number] ?? ""}
          readOnly={readOnly}
          disabled={readOnly}
          onFocus={() => onFocusIndex(idx)}
          onClick={() => onFocusIndex(idx)}
          onChange={(e) => onChange(h.hole_number, idx, e)}
          onKeyDown={(e) => onKeyDown(h.hole_number, idx, e)}
          className={`mx-auto box-border h-8 w-7 min-w-[28px] max-w-[32px] rounded border px-0 py-0 text-center text-xs outline-none ${
            readOnly
              ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-700"
              : activeIndex === idx
                ? "border-green-600 bg-white text-black ring-2 ring-green-200"
                : "border-gray-300 bg-white text-black focus:border-green-600"
          }`}
        />
      </td>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <div className={scorecardScrollClass}>
        <table className={scorecardTableClass}>
          <thead>
            <tr className="bg-white">
              <th className={stickyLabelCell("bg-white")}>VENT</th>
              {frontHoles.map((h) => (
                <th key={`hcp-f-${h.hole_number}`} className={holeMetaCell}>
                  {h.handicap_index}
                </th>
              ))}
              <th className={totalHeadCell} />
              {backHoles.map((h) => (
                <th key={`hcp-b-${h.hole_number}`} className={holeMetaCell}>
                  {h.handicap_index}
                </th>
              ))}
              <th className={totalHeadCell} />
              <th className={totalHeadCell} />
            </tr>
            <tr className="bg-gray-50">
              <th className={stickyLabelCell("bg-gray-50")}>HOYO</th>
              {frontHoles.map((h) => (
                <th key={`hn-f-${h.hole_number}`} className={holeHeadCell}>
                  {h.hole_number}
                </th>
              ))}
              <th className={totalHeadCell}>F9</th>
              {backHoles.map((h) => (
                <th key={`hn-b-${h.hole_number}`} className={holeHeadCell}>
                  {h.hole_number}
                </th>
              ))}
              <th className={totalHeadCell}>B9</th>
              <th className={totalHeadCell}>TOT</th>
            </tr>
            <tr className="bg-gray-50">
              <th className={stickyLabelCell("bg-gray-50")}>PAR</th>
              {frontHoles.map((h) => (
                <th key={`par-f-${h.hole_number}`} className={holeMetaCell}>
                  {h.par}
                </th>
              ))}
              <th className={totalHeadCell}>
                {sumByHoles(
                  frontHoles,
                  Object.fromEntries(frontHoles.map((h) => [h.hole_number, h.par]))
                )}
              </th>
              {backHoles.map((h) => (
                <th key={`par-b-${h.hole_number}`} className={holeMetaCell}>
                  {h.par}
                </th>
              ))}
              <th className={totalHeadCell}>
                {sumByHoles(
                  backHoles,
                  Object.fromEntries(backHoles.map((h) => [h.hole_number, h.par]))
                )}
              </th>
              <th className={totalHeadCell}>
                {sumByHoles(
                  holes,
                  Object.fromEntries(holes.map((h) => [h.hole_number, h.par]))
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={stickyLabelCell("bg-white")}>SCORE</td>
              {frontHoles.map((h) => renderInputCell(h))}
              <td className={totalBodyCell}>{front9 || ""}</td>
              {backHoles.map((h) => renderInputCell(h))}
              <td className={totalBodyCell}>{back9 || ""}</td>
              <td className={totalBodyCell}>{total || ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
