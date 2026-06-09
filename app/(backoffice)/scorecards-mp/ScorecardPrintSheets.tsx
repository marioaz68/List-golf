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
    <div className="flex items-center gap-1 text-[8px] leading-tight">
      <GenderIcon g={p.gender} />
      <TeeDot color={p.teeColor} name={p.teeName} />
      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
      <span className="shrink-0 tabular-nums text-[7px]">
        HI {p.hi.toFixed(1)} · PH {p.ph ?? "—"}
      </span>
      <span className="shrink-0 rounded bg-black/5 px-0.5 text-[6px] font-bold uppercase">
        {p.ballRole}
      </span>
    </div>
  );
}

function HoleGrid({
  parByHole,
  siByHole,
  extraRows,
}: {
  parByHole: Record<number, number>;
  siByHole: Record<number, number>;
  extraRows: { label: string; className?: string }[];
}) {
  return (
    <table className="w-full border-collapse text-[6px]">
      <thead>
        <tr>
          <th className="w-8 border border-black/40 bg-black/5 px-0.5 text-left">
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
          <td className="border border-black/40 px-0.5 font-semibold">Par</td>
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
          <td className="border border-black/40 px-0.5 font-semibold">HCP</td>
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
              className={`border border-black/40 px-0.5 font-semibold ${row.className ?? ""}`}
            >
              {row.label}
            </td>
            {HOLES.slice(0, 9).map((h) => (
              <td key={h} className="h-3 border border-black/40" />
            ))}
            <td className="border border-black/40" />
            {HOLES.slice(9).map((h) => (
              <td key={h} className="h-3 border border-black/40" />
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
}: {
  meta: PrintableScorecardsBundle;
  subtitle: string;
  groupLine: string;
}) {
  return (
    <header className="border-b border-black/30 pb-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[7px] font-bold uppercase tracking-wide">
            {meta.clubName}
          </div>
          <div className="truncate text-[9px] font-extrabold">
            {meta.tournamentName}
          </div>
        </div>
        <div className="shrink-0 text-right text-[7px]">
          <div className="font-bold">{subtitle}</div>
          <div>{groupLine}</div>
        </div>
      </div>
      <div className="mt-0.5 text-[6px] text-black/70">
        {meta.pairFormatLabel} · {meta.allowancePct}% HI · 2 pts/hoyo (baja vs
        baja, alta vs alta)
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
    card.kind === "consolation_mp" ? "Consolación Match Play" : "Cuadro principal";
  const subtitle = `${kindLabel} · ${card.roundLabel} · G${card.groupNo ?? card.positionNo}`;
  const groupLine = [
    card.teeTime ? `Salida ${card.teeTime}` : null,
    `Match #${card.positionNo}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const scoreRows: { label: string; className?: string }[] = [];
  for (const p of card.topPlayers) {
    scoreRows.push({
      label: `A ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
    });
  }
  for (const p of card.bottomPlayers) {
    scoreRows.push({
      label: `B ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
    });
  }
  scoreRows.push({ label: "Pts baja", className: "bg-cyan-50" });
  scoreRows.push({ label: "Pts alta", className: "bg-violet-50" });
  scoreRows.push({ label: "Match", className: "bg-amber-50 font-bold" });

  return (
    <article className="scorecard-half flex h-[138mm] flex-col overflow-hidden border border-black/50 bg-white p-2 text-black">
      <CardHeader meta={meta} subtitle={subtitle} groupLine={groupLine} />
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-0.5 text-[7px] font-bold uppercase text-cyan-800">
            Pareja A — {card.topLabel}
          </div>
          {card.topPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
        <div>
          <div className="mb-0.5 text-[7px] font-bold uppercase text-violet-800">
            Pareja B — {card.bottomLabel}
          </div>
          {card.bottomPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-hidden">
        <HoleGrid
          parByHole={meta.parByHole}
          siByHole={meta.strokeIndexByHole}
          extraRows={scoreRows}
        />
      </div>
      <footer className="mt-1 flex gap-3 border-t border-black/20 pt-1 text-[6px]">
        <span>Ganador: ☐ A ☐ B</span>
        <span>Resultado: __________</span>
        <span>Firma A: ______ Firma B: ______</span>
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
  const subtitle = `Stroke Agregado · R${card.roundNo}`;
  const groupLine = `Grupo ${card.groupNo}${card.teeTime ? ` · ${card.teeTime}` : ""} · ${card.groupLabel}`;

  const scoreRows = card.players.map((p, i) => ({
    label: `J${i + 1} ${p.name.split(" ")[0]}`,
  }));
  scoreRows.push({ label: "Neto pareja 1" });
  scoreRows.push({ label: "Neto pareja 2" });

  return (
    <article className="scorecard-half flex h-[138mm] flex-col overflow-hidden border border-black/50 bg-white p-2 text-black">
      <CardHeader meta={meta} subtitle={subtitle} groupLine={groupLine} />
      <div className="mt-1 space-y-0.5">
        {card.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[8px]">
            <span className="w-4 font-bold">{i + 1}.</span>
            <PlayerLine p={p} />
          </div>
        ))}
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-hidden">
        <HoleGrid
          parByHole={meta.parByHole}
          siByHole={meta.strokeIndexByHole}
          extraRows={scoreRows}
        />
      </div>
      <footer className="mt-1 border-t border-black/20 pt-1 text-[6px]">
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
          className="print-page mx-auto flex max-w-[210mm] flex-col gap-2 bg-white p-2 print:min-h-[297mm] print:max-h-[297mm] print:break-after-page"
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
            size: A4 portrait;
            margin: 8mm;
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
          .print-page:last-child {
            break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}
