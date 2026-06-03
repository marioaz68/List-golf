/** Etiqueta de ronda del torneo y etapa del cuadro (Octavos, Cuartos…). */
export default function BracketRoundBadge({
  roundNo,
  bracketRoundLabel,
  className = "",
}: {
  roundNo: number | null | undefined;
  bracketRoundLabel: string | null | undefined;
  className?: string;
}) {
  if (bracketRoundLabel == null && roundNo == null) return null;

  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {roundNo != null ? <span>R{roundNo}</span> : null}
      {bracketRoundLabel ? <span>· {bracketRoundLabel}</span> : null}
    </div>
  );
}
