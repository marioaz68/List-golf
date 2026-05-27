/** Badge visible junto al nombre cuando el inscrito está en revisión de handicap. */
export default function CommitteeReviewBadge({
  reason,
  compact = false,
}: {
  reason?: string | null;
  compact?: boolean;
}) {
  const title = reason?.trim()
    ? `En revisión de handicap: ${reason}`
    : "En revisión de handicap (comité)";

  return (
    <span
      title={title}
      className={[
        "inline-flex shrink-0 items-center gap-0.5 rounded border font-bold uppercase tracking-wide text-amber-950",
        compact
          ? "border-amber-500 bg-amber-100 px-1 py-0 text-[8px]"
          : "border-amber-500 bg-amber-100 px-1.5 py-0.5 text-[9px]",
      ].join(" ")}
    >
      <span aria-hidden className={compact ? "text-[9px]" : "text-[10px]"}>
        ⚠
      </span>
      <span>{compact ? "HI" : "Revisión HI"}</span>
    </span>
  );
}
