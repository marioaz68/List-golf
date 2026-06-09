import type {
  PrintableMatchPlayCard,
  PrintablePlayerRow,
  PrintableScorecardsBundle,
  PrintableStrokeCard,
} from "@/lib/matchplay/loadPrintableMpScorecards";

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function parOut(par: Record<number, number>) {
  return HOLES.slice(0, 9).reduce((s, h) => s + (par[h] ?? 0), 0);
}
function parIn(par: Record<number, number>) {
  return HOLES.slice(9).reduce((s, h) => s + (par[h] ?? 0), 0);
}
function parTot(par: Record<number, number>) {
  return parOut(par) + parIn(par);
}

function GenderIcon({ g }: { g: "M" | "F" | "X" }) {
  if (g === "M") return <span className="text-blue-700">♂</span>;
  if (g === "F") return <span className="text-pink-700">♀</span>;
  return <span>·</span>;
}

function TeeDot({ color, name }: { color: string | null; name: string | null }) {
  if (!color && !name) return null;
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full border border-black/30"
      style={{ background: color ?? "#ccc" }}
      title={name ?? undefined}
    />
  );
}

function PlayerLine({ p }: { p: PrintablePlayerRow }) {
  return (
    <div className="flex items-center gap-1 text-[10px] leading-tight">
      <GenderIcon g={p.gender} />
      <TeeDot color={p.teeColor} name={p.teeName} />
      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      <span className="shrink-0 tabular-nums text-[9px]">
        HI {p.hi.toFixed(1)} · PH {p.ph ?? "—"}
      </span>
      <span className="shrink-0 rounded bg-black/5 px-1 text-[8px] font-bold uppercase">
        {p.ballRole}
      </span>
    </div>
  );
}

type ExtraRow = {
  label: string;
  className?: string;
  /** Golpes de ventaja por hoyo → punto en la esquina de la celda. */
  dotsByHole?: Record<number, number>;
};

function AdvantageCell({ dots, rowH }: { dots: number; rowH: string }) {
  return (
    <td className="relative border border-black/40" style={{ height: rowH }}>
      {dots > 0 ? (
        <span className="pointer-events-none absolute right-[1.5px] top-[1.5px] flex gap-[1px]">
          {Array.from({ length: Math.min(dots, 2) }).map((_, i) => (
            <span
              key={i}
              className="inline-block h-[4px] w-[4px] rounded-full bg-black"
            />
          ))}
        </span>
      ) : null}
    </td>
  );
}

function HoleGrid({
  parByHole,
  siByHole,
  extraRows,
  rowH,
}: {
  parByHole: Record<number, number>;
  siByHole: Record<number, number>;
  extraRows: ExtraRow[];
  rowH: string;
}) {
  return (
    <table className="w-full border-collapse text-[9px]">
      <thead>
        <tr>
          <th className="w-14 border border-black/40 bg-black/5 px-1 text-left">
            Hoyo
          </th>
          {HOLES.slice(0, 9).map((h) => (
            <th key={h} className="border border-black/40 px-0.5 text-center">
              {h}
            </th>
          ))}
          <th className="border border-black/40 bg-black/5 px-0.5">OUT</th>
          {HOLES.slice(9).map((h) => (
            <th key={h} className="border border-black/40 px-0.5 text-center">
              {h}
            </th>
          ))}
          <th className="border border-black/40 bg-black/5 px-0.5">IN</th>
          <th className="border border-black/40 bg-black/5 px-0.5">TOT</th>
        </tr>
        <tr>
          <td className="border border-black/40 px-1 font-semibold">Par</td>
          {HOLES.slice(0, 9).map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {parByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40 text-center font-semibold">
            {parOut(parByHole)}
          </td>
          {HOLES.slice(9).map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {parByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40 text-center font-semibold">
            {parIn(parByHole)}
          </td>
          <td className="border border-black/40 text-center font-semibold">
            {parTot(parByHole)}
          </td>
        </tr>
        <tr>
          <td className="border border-black/40 px-1 font-semibold">HCP</td>
          {HOLES.slice(0, 9).map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {siByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40" />
          {HOLES.slice(9).map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {siByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40" colSpan={2} />
        </tr>
      </thead>
      <tbody>
        {extraRows.map((row) => (
          <tr key={row.label}>
            <td
              className={`border border-black/40 px-1 font-semibold ${row.className ?? ""}`}
              style={{ height: rowH }}
            >
              {row.label}
            </td>
            {HOLES.slice(0, 9).map((h) => (
              <AdvantageCell key={h} dots={row.dotsByHole?.[h] ?? 0} rowH={rowH} />
            ))}
            <td className="border border-black/40" />
            {HOLES.slice(9).map((h) => (
              <AdvantageCell key={h} dots={row.dotsByHole?.[h] ?? 0} rowH={rowH} />
            ))}
            <td className="border border-black/40" />
            <td className="border border-black/40" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardHeader({
  meta,
  subtitle,
  groupLine,
  showAdvantageLegend = true,
}: {
  meta: PrintableScorecardsBundle;
  subtitle: string;
  groupLine: string;
  showAdvantageLegend?: boolean;
}) {
  return (
    <header className="border-b border-black/40 pb-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {meta.clubId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/club-logo?club_id=${encodeURIComponent(meta.clubId)}`}
              alt={meta.clubName}
              className="h-9 w-9 shrink-0 rounded-full object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wide">
              {meta.clubName}
            </div>
            <div className="truncate text-[12px] font-extrabold leading-tight">
              {meta.tournamentName}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right text-[10px] leading-tight">
          <div className="font-bold">{subtitle}</div>
          <div>{groupLine}</div>
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[8px] text-black/70">
        <span>
          {meta.pairFormatLabel} · {meta.allowancePct}% HI · 2 pts/hoyo (baja vs
          baja, alta vs alta)
        </span>
        {showAdvantageLegend ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-[4px] w-[4px] rounded-full bg-black" />
            = golpe de ventaja
          </span>
        ) : null}
      </div>
    </header>
  );
}

export function MatchPlayScorecardSheet({
  card,
  meta,
}: {
  card: PrintableMatchPlayCard;
  meta: PrintableScorecardsBundle;
}) {
  const kindLabel =
    card.kind === "consolation_mp"
      ? "Consolación Match Play"
      : card.kind === "third_place"
        ? "Match por 3er / 4to Lugar"
        : "Cuadro principal";
  const subtitle =
    card.kind === "third_place"
      ? `${kindLabel} · ${card.roundLabel}`
      : `${kindLabel} · ${card.roundLabel} · G${card.groupNo ?? card.positionNo}`;
  const groupLine =
    card.kind === "third_place"
      ? card.teeTime
        ? `Salida ${card.teeTime}`
        : "Salida por definir"
      : [
          card.teeTime ? `Salida ${card.teeTime}` : null,
          `Match #${card.positionNo}`,
        ]
          .filter(Boolean)
          .join(" · ");

  const scoreRows: ExtraRow[] = [];
  for (const p of card.topPlayers) {
    scoreRows.push({
      label: `A ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
      dotsByHole: p.strokesByHole,
    });
  }
  for (const p of card.bottomPlayers) {
    scoreRows.push({
      label: `B ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
      dotsByHole: p.strokesByHole,
    });
  }
  scoreRows.push({ label: "Pts baja", className: "bg-cyan-50" });
  scoreRows.push({ label: "Pts alta", className: "bg-violet-50" });
  scoreRows.push({ label: "Match", className: "bg-amber-50 font-bold" });

  return (
    <article className="scorecard-half flex h-[92mm] flex-col overflow-hidden border-2 border-black/60 bg-white p-2 text-black">
      <CardHeader meta={meta} subtitle={subtitle} groupLine={groupLine} />
      <div className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-0.5 text-[9px] font-bold uppercase text-cyan-800">
            Pareja A — {card.topLabel}
          </div>
          {card.topPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
        <div>
          <div className="mb-0.5 text-[9px] font-bold uppercase text-violet-800">
            Pareja B — {card.bottomLabel}
          </div>
          {card.bottomPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
      </div>
      <div className="mt-1 min-h-0 flex-1">
        <HoleGrid
          parByHole={meta.parByHole}
          siByHole={meta.strokeIndexByHole}
          extraRows={scoreRows}
          rowH="6.2mm"
        />
      </div>
      <footer className="mt-1 flex gap-4 border-t border-black/30 pt-1 text-[9px] font-semibold">
        <span>Ganador: ☐ A ☐ B</span>
        <span>Resultado: ____________</span>
        <span>Firma A: __________</span>
        <span>Firma B: __________</span>
      </footer>
    </article>
  );
}

export function StrokeAggregateScorecardSheet({
  card,
  meta,
}: {
  card: PrintableStrokeCard;
  meta: PrintableScorecardsBundle;
}) {
  const subtitle = `Consolación Stroke Play · R${card.roundNo}`;
  const groupLine = `Grupo ${card.groupNo}${card.teeTime ? ` · ${card.teeTime}` : ""} · ${card.groupLabel}`;

  const scoreRows: ExtraRow[] = card.players.map((p, i) => ({
    label: `J${i + 1} ${p.name.split(" ")[0]}`,
  }));
  scoreRows.push({ label: "Neto pareja 1", className: "bg-emerald-50 font-bold" });
  scoreRows.push({ label: "Neto pareja 2", className: "bg-emerald-50 font-bold" });

  return (
    <article className="scorecard-half flex h-[92mm] flex-col overflow-hidden border-2 border-black/60 bg-white p-2 text-black">
      <CardHeader
        meta={meta}
        subtitle={subtitle}
        groupLine={groupLine}
        showAdvantageLegend={false}
      />
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
        {card.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-4 font-bold">{i + 1}.</span>
            <PlayerLine p={p} />
          </div>
        ))}
      </div>
      <div className="mt-1 min-h-0 flex-1">
        <HoleGrid
          parByHole={meta.parByHole}
          siByHole={meta.strokeIndexByHole}
          extraRows={scoreRows}
          rowH="6.2mm"
        />
      </div>
      <footer className="mt-1 border-t border-black/30 pt-1 text-[8px]">
        Suma neto de los 2 jugadores de cada pareja · Desempate según convocatoria
        CCQ
      </footer>
    </article>
  );
}

type PrintItem =
  | { type: "mp"; card: PrintableMatchPlayCard }
  | { type: "stroke"; card: PrintableStrokeCard };

export function ScorecardPrintPages({
  meta,
  items,
}: {
  meta: PrintableScorecardsBundle;
  items: PrintItem[];
}) {
  const pages: PrintItem[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pages.push(items.slice(i, i + 2));
  }

  return (
    <div className="print-root">
      {pages.map((pair, pi) => (
        <div
          key={pi}
          className="print-page mx-auto flex w-full max-w-[287mm] flex-col gap-3 bg-white p-2 print:break-after-page"
        >
          {pair.map((item) =>
            item.type === "mp" ? (
              <MatchPlayScorecardSheet
                key={item.card.cardId}
                card={item.card}
                meta={meta}
              />
            ) : (
              <StrokeAggregateScorecardSheet
                key={item.card.cardId}
                card={item.card}
                meta={meta}
              />
            )
          )}
        </div>
      ))}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm;
          }
          body * {
            visibility: hidden;
          }
          .print-root,
          .print-root * {
            visibility: visible;
          }
          .print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print-page {
            gap: 4mm;
            padding: 0;
          }
          .print-page:last-child {
            break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}
