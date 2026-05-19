import Link from "next/link";

export type ScoreEntryRoundLink = {
  roundNo: number;
  href: string;
  isCurrent: boolean;
  isClosed: boolean;
  hasCapture: boolean;
};

export default function ScoreEntryRoundSwitcher({
  items,
  labels,
}: {
  items: ScoreEntryRoundLink[];
  labels: {
    kicker: string;
    current: string;
    closed: string;
    open: string;
    noCapture: string;
  };
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {labels.kicker}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const stateLabel = item.isClosed
            ? labels.closed
            : item.hasCapture
              ? labels.open
              : labels.noCapture;

          return (
            <Link
              key={item.roundNo}
              href={item.href}
              scroll={false}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                item.isCurrent
                  ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-800 hover:border-sky-400 hover:bg-sky-50"
              }`}
            >
              R{item.roundNo}
              <span
                className={`mt-0.5 block text-[10px] font-medium ${
                  item.isCurrent ? "text-sky-100" : "text-slate-500"
                }`}
              >
                {item.isCurrent ? labels.current : stateLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
