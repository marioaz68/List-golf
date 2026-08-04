import type {
  PrintableMatchPlayCard,
  PrintablePlayerRow,
  PrintableScorecardsBundle,
  PrintableStrokeCard,
} from "@/lib/matchplay/loadPrintableMpScorecards";

const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

/** Orden de juego a partir del hoyo de salida (p. ej. 10 → 10..18,1..9). */
function holesInPlayOrder(startingHole: number | null | undefined): number[] {
  const start =
    typeof startingHole === "number" &&
    Number.isFinite(startingHole) &&
    startingHole >= 1 &&
    startingHole <= 18
      ? Math.floor(startingHole)
      : 1;
  if (start <= 1) return [...DEFAULT_HOLES];
  const order: number[] = [];
  for (let h = start; h <= 18; h++) order.push(h);
  for (let h = 1; h < start; h++) order.push(h);
  return order;
}

function sumPar(par: Record<number, number>, holes: number[]) {
  return holes.reduce((s, h) => s + (par[h] ?? 0), 0);
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
  /** Alto de fila (override del default del grid). */
  rowH?: string;
};

function AdvantageCell({ dots, rowH }: { dots: number; rowH: string }) {
  // 1 golpe → 1 punto; 2 golpes (PH > 18 en SI) → 2 puntos.
  // Siempre esquina superior derecha; centro vacío para anotar a mano.
  const n = Math.min(Math.max(0, Math.trunc(Number(dots) || 0)), 2);
  return (
    <td
      className="relative border border-black/40 p-0 align-top"
      style={{ height: rowH, minHeight: rowH, verticalAlign: "top" }}
    >
      {n > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute select-none"
          style={{
            top: 1,
            right: 2,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: n > 1 ? -0.5 : undefined,
          }}
        >
          {"•".repeat(n)}
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
  holeOrder = DEFAULT_HOLES,
}: {
  parByHole: Record<number, number>;
  siByHole: Record<number, number>;
  extraRows: ExtraRow[];
  rowH: string;
  /** Orden de columnas (1–18 o 10–18,1–9). */
  holeOrder?: number[];
}) {
  const holes = holeOrder.length === 18 ? holeOrder : DEFAULT_HOLES;
  const front = holes.slice(0, 9);
  const back = holes.slice(9);

  return (
    <table className="w-full border-collapse text-[9px]">
      <thead>
        <tr>
          <th className="w-14 border border-black/40 bg-black/5 px-1 text-left">
            Hoyo
          </th>
          {front.map((h) => (
            <th key={h} className="border border-black/40 px-0.5 text-center">
              {h}
            </th>
          ))}
          <th className="border border-black/40 bg-black/5 px-0.5">OUT</th>
          {back.map((h) => (
            <th key={h} className="border border-black/40 px-0.5 text-center">
              {h}
            </th>
          ))}
          <th className="border border-black/40 bg-black/5 px-0.5">IN</th>
          <th className="border border-black/40 bg-black/5 px-0.5">TOT</th>
        </tr>
        <tr>
          <td className="border border-black/40 px-1 font-semibold">Par</td>
          {front.map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {parByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40 text-center font-semibold">
            {sumPar(parByHole, front)}
          </td>
          {back.map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {parByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40 text-center font-semibold">
            {sumPar(parByHole, back)}
          </td>
          <td className="border border-black/40 text-center font-semibold">
            {sumPar(parByHole, holes)}
          </td>
        </tr>
        <tr>
          <td className="border border-black/40 px-1 font-semibold">HCP</td>
          {front.map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {siByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40" />
          {back.map((h) => (
            <td key={h} className="border border-black/40 text-center">
              {siByHole[h] ?? "—"}
            </td>
          ))}
          <td className="border border-black/40" colSpan={2} />
        </tr>
      </thead>
      <tbody>
        {extraRows.map((row) => {
          const h = row.rowH ?? rowH;
          return (
            <tr key={row.label}>
              <td
                className={`border border-black/40 px-1 align-middle font-semibold ${row.className ?? ""}`}
                style={{ height: h, minHeight: h }}
              >
                {row.label}
              </td>
              {front.map((hole) => (
                <AdvantageCell
                  key={hole}
                  dots={row.dotsByHole?.[hole] ?? 0}
                  rowH={h}
                />
              ))}
              <td className="border border-black/40" style={{ height: h }} />
              {back.map((hole) => (
                <AdvantageCell
                  key={hole}
                  dots={row.dotsByHole?.[hole] ?? 0}
                  rowH={h}
                />
              ))}
              <td className="border border-black/40" style={{ height: h }} />
              <td className="border border-black/40" style={{ height: h }} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CardHeader({
  meta,
  subtitle,
  groupLine,
  showAdvantageLegend = true,
  formatLegend,
}: {
  meta: PrintableScorecardsBundle;
  subtitle: string;
  groupLine: string;
  showAdvantageLegend?: boolean;
  /** Si se pasa, reemplaza la leyenda de formato (p. ej. individuales Ryder). */
  formatLegend?: string;
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
          {formatLegend ??
            `${meta.pairFormatLabel} · ${meta.allowancePct}% HI · 2 pts/hoyo (baja vs baja, alta vs alta)`}
        </span>
        {showAdvantageLegend ? (
          <span className="flex items-center gap-1">
            <span style={{ fontSize: 9, lineHeight: 1 }}>•</span>
            = 1 golpe de ventaja (esquina de la casilla; •• = 2)
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
  const isRyder = meta.matchplayVariant === "ryder";

  // Calcutta: etiquetas de ronda (Dieciseisavos, Octavos…) intactas.
  // Ryder: "Parejas · 1a · G3" / "Salida HH:MM" (sin Match # del cuadro).
  let subtitle: string;
  let groupLine: string;
  if (isRyder && card.ryderHeaderLine) {
    subtitle = card.ryderHeaderLine;
    groupLine = card.teeTime
      ? `Salida ${card.teeTime}`
      : "Salida por definir";
  } else {
    const kindLabel =
      card.kind === "consolation_mp"
        ? "Consolación Match Play"
        : card.kind === "third_place"
          ? "Match por 3er / 4to Lugar"
          : "Cuadro principal";
    subtitle =
      card.kind === "third_place"
        ? `${kindLabel} · ${card.roundLabel}`
        : `${kindLabel} · ${card.roundLabel} · G${card.groupNo ?? card.positionNo}`;
    groupLine =
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
  }

  const isSingles = isRyder && card.scoringFormat === "singles";
  // En Ryder la fila Match mide 12mm; el resto se compacta para no encimar el pie.
  const baseRowH = isRyder ? "5mm" : "6.2mm";
  const matchRowH = isRyder ? "12mm" : baseRowH;
  const scoreRows: ExtraRow[] = [];
  for (const p of card.topPlayers) {
    scoreRows.push({
      label: isSingles
        ? `A ${p.name.split(" ")[0]}`
        : `A ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
      dotsByHole: p.strokesByHole,
    });
  }
  for (const p of card.bottomPlayers) {
    scoreRows.push({
      label: isSingles
        ? `B ${p.name.split(" ")[0]}`
        : `B ${p.ballRole === "baja" ? "↓" : "↑"} ${p.name.split(" ")[0]}`,
      dotsByHole: p.strokesByHole,
    });
  }
  if (isSingles) {
    scoreRows.push({ label: "Pts hoyo", className: "bg-cyan-50" });
    scoreRows.push({
      label: "Match",
      className: "bg-amber-50 font-bold",
      rowH: matchRowH,
    });
  } else {
    scoreRows.push({ label: "Pts baja", className: "bg-cyan-50" });
    scoreRows.push({ label: "Pts alta", className: "bg-violet-50" });
    scoreRows.push({
      label: "Match",
      className: "bg-amber-50 font-bold",
      rowH: matchRowH,
    });
  }

  const handicapBit = isRyder
    ? (card.ryderHandicapLabel ?? "ventaja según sesión")
    : `${meta.allowancePct}% HI`;

  const formatLegend = isRyder
    ? isSingles
      ? `Individual · ${handicapBit} · 1 pt/hoyo`
      : `${meta.pairFormatLabel} · ${handicapBit} · 2 pts/hoyo (baja vs baja, alta vs alta)`
    : undefined;

  const showAdvantageLegend = !(
    isRyder && card.ryderHandicapLabel === "scratch"
  );

  const holeOrder = isRyder
    ? holesInPlayOrder(card.startingHole)
    : DEFAULT_HOLES;

  const topSide =
    isRyder && card.topSideLabel
      ? card.topSideLabel
      : isSingles
        ? "Jugador A"
        : "Pareja A";
  const bottomSide =
    isRyder && card.bottomSideLabel
      ? card.bottomSideLabel
      : isSingles
        ? "Jugador B"
        : "Pareja B";

  return (
    <article
      className={`scorecard-half flex flex-col overflow-hidden border-2 border-black/60 bg-white p-2 text-black ${
        isRyder ? "h-[98mm]" : "h-[92mm]"
      }`}
    >
      <CardHeader
        meta={meta}
        subtitle={subtitle}
        groupLine={groupLine}
        formatLegend={formatLegend}
        showAdvantageLegend={showAdvantageLegend}
      />
      <div className="mt-1 shrink-0 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-0.5 text-[9px] font-bold uppercase text-cyan-800">
            {topSide} — {card.topLabel}
          </div>
          {card.topPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
        <div>
          <div className="mb-0.5 text-[9px] font-bold uppercase text-violet-800">
            {bottomSide} — {card.bottomLabel}
          </div>
          {card.bottomPlayers.map((p, i) => (
            <PlayerLine key={i} p={p} />
          ))}
        </div>
      </div>
      {/* overflow-hidden: la fila Match alta no se pinta encima del pie */}
      <div className="mt-1 min-h-0 flex-1 overflow-hidden">
        <HoleGrid
          parByHole={meta.parByHole}
          siByHole={meta.strokeIndexByHole}
          extraRows={scoreRows}
          rowH={baseRowH}
          holeOrder={holeOrder}
        />
      </div>
      <footer className="mt-1 shrink-0 border-t border-black/30 bg-white pt-1 text-[9px] font-semibold">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span>Ganador: ☐ A ☐ B</span>
          <span>Resultado: ____________</span>
          <span>Firma A: __________</span>
          <span>Firma B: __________</span>
        </div>
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
          className="print-page mx-auto flex w-full max-w-[267mm] flex-col gap-3 bg-white p-2 print:break-after-page"
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
            size: letter landscape;
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
