type ScorecardHole = {
  hole: number;
  strokes: number | null;
};

type ScorecardTotals = {
  out: number;
  in: number;
  gross: number;
  holesPlayed: number;
};

type ScorecardPreviewProps = {
  title?: string;
  status: string;
  holes: ScorecardHole[];
  totals: ScorecardTotals;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
};

const PAR_BY_HOLE: Record<number, number> = {
  1: 4,
  2: 4,
  3: 3,
  4: 5,
  5: 4,
  6: 4,
  7: 4,
  8: 3,
  9: 5,
  10: 4,
  11: 5,
  12: 3,
  13: 4,
  14: 5,
  15: 4,
  16: 4,
  17: 3,
  18: 4,
};

function getCellClass(strokes: number | null, par: number) {
  if (strokes === null) return "";

  const diff = strokes - par;

  if (diff <= -1) {
    return "rounded-full border-2 border-red-600";
  }

  if (diff === 1) {
    return "border-2 border-black";
  }

  if (diff >= 2) {
    return "border-2 border-black shadow-[inset_0_0_0_2px_white,inset_0_0_0_4px_black]";
  }

  return "";
}

function formatSignValue(value?: string | null, fallback = "Pendiente") {
  if (!value) return fallback;
  return value;
}

export default function ScorecardPreview({
  title = "Tarjeta electrónica",
  status,
  holes,
  totals,
  player_signed_at,
  marker_signed_at,
  witness_signed_at,
  locked_at,
}: ScorecardPreviewProps) {
  const orderedHoles = [...holes].sort((a, b) => a.hole - b.hole);

  const front9 = orderedHoles.filter((h) => h.hole >= 1 && h.hole <= 9);
  const back9 = orderedHoles.filter((h) => h.hole >= 10 && h.hole <= 18);

  const totalParFront = front9.reduce((sum, h) => sum + PAR_BY_HOLE[h.hole], 0);
  const totalParBack = back9.reduce((sum, h) => sum + PAR_BY_HOLE[h.hole], 0);
  const totalPar = totalParFront + totalParBack;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 rounded-lg bg-black px-3 py-3 text-white">
        <div className="text-lg font-bold leading-tight">{title}</div>
        <div className="mt-1 text-sm text-white/75">Status: {status}</div>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center">
          <div className="text-[10px] text-slate-500">Hoyos</div>
          <div className="text-sm font-bold text-slate-900">
            {totals.holesPlayed}
          </div>
        </div>

        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center">
          <div className="text-[10px] text-slate-500">OUT</div>
          <div className="text-sm font-bold text-slate-900">{totals.out}</div>
        </div>

        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center">
          <div className="text-[10px] text-slate-500">IN</div>
          <div className="text-sm font-bold text-slate-900">{totals.in}</div>
        </div>

        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center">
          <div className="text-[10px] text-slate-500">TOT</div>
          <div className="text-sm font-bold text-slate-900">{totals.gross}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-[#0d2747] text-white">
              <th className="w-14 border border-[#18365d] px-1 py-2 text-left font-bold">
                H
              </th>

              {front9.map((h) => (
                <th
                  key={`head-front-${h.hole}`}
                  className="w-9 border border-[#18365d] px-1 py-2 text-center font-bold"
                >
                  {h.hole}
                </th>
              ))}

              <th className="w-10 border border-[#18365d] px-1 py-2 text-center font-bold">
                OUT
              </th>

              {back9.map((h) => (
                <th
                  key={`head-back-${h.hole}`}
                  className="w-9 border border-[#18365d] px-1 py-2 text-center font-bold"
                >
                  {h.hole}
                </th>
              ))}

              <th className="w-10 border border-[#18365d] px-1 py-2 text-center font-bold">
                IN
              </th>

              <th className="w-10 border border-[#18365d] px-1 py-2 text-center font-bold">
                TOT
              </th>
            </tr>
          </thead>

          <tbody>
            <tr className="bg-slate-100">
              <td className="border border-slate-300 px-1 py-1 font-bold text-slate-800">
                PAR
              </td>

              {front9.map((h) => (
                <td
                  key={`par-front-${h.hole}`}
                  className="border border-slate-300 px-1 py-1 text-center text-slate-700"
                >
                  {PAR_BY_HOLE[h.hole]}
                </td>
              ))}

              <td className="border border-slate-300 px-1 py-1 text-center font-bold text-slate-800">
                {totalParFront}
              </td>

              {back9.map((h) => (
                <td
                  key={`par-back-${h.hole}`}
                  className="border border-slate-300 px-1 py-1 text-center text-slate-700"
                >
                  {PAR_BY_HOLE[h.hole]}
                </td>
              ))}

              <td className="border border-slate-300 px-1 py-1 text-center font-bold text-slate-800">
                {totalParBack}
              </td>

              <td className="border border-slate-300 px-1 py-1 text-center font-bold text-slate-800">
                {totalPar}
              </td>
            </tr>

            <tr>
              <td className="border border-slate-300 px-1 py-1 font-bold text-slate-900">
                SCORE
              </td>

              {front9.map((h) => (
                <td
                  key={`score-front-${h.hole}`}
                  className="border border-slate-300 px-1 py-1 text-center"
                >
                  <span
                    className={[
                      "mx-auto inline-flex h-7 w-7 items-center justify-center text-xs font-bold text-slate-900",
                      getCellClass(h.strokes, PAR_BY_HOLE[h.hole]),
                    ].join(" ")}
                  >
                    {h.strokes ?? ""}
                  </span>
                </td>
              ))}

              <td className="border border-slate-300 px-1 py-1 text-center text-sm font-bold text-slate-900">
                {totals.out || ""}
              </td>

              {back9.map((h) => (
                <td
                  key={`score-back-${h.hole}`}
                  className="border border-slate-300 px-1 py-1 text-center"
                >
                  <span
                    className={[
                      "mx-auto inline-flex h-7 w-7 items-center justify-center text-xs font-bold text-slate-900",
                      getCellClass(h.strokes, PAR_BY_HOLE[h.hole]),
                    ].join(" ")}
                  >
                    {h.strokes ?? ""}
                  </span>
                </td>
              ))}

              <td className="border border-slate-300 px-1 py-1 text-center text-sm font-bold text-slate-900">
                {totals.in || ""}
              </td>

              <td className="border border-slate-300 px-1 py-1 text-center text-sm font-bold text-slate-900">
                {totals.gross || ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Firma jugador
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {formatSignValue(player_signed_at)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Firma marcador
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {formatSignValue(marker_signed_at)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Firma testigo
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {formatSignValue(witness_signed_at, "Opcional / pendiente")}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cierre
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {formatSignValue(locked_at, "No cerrada")}
          </div>
        </div>
      </div>
    </section>
  );
}