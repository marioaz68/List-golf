import type { ReactNode } from "react";

type HeaderBarProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
};

export default function HeaderBar({
  title,
  children,
  actions,
  className = "",
  titleClassName = "",
  contentClassName = "",
}: HeaderBarProps) {
  return (
    <section
      className={[
        "rounded-lg border border-white/20 bg-white/10 p-2",
        className,
      ].join(" ")}
    >
      <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-start">
        <div
          className={[
            "flex min-h-[34px] items-center text-[11px] font-semibold uppercase tracking-[0.04em] leading-tight text-white",
            "md:pt-1",
            titleClassName,
          ].join(" ")}
        >
          {title}
        </div>

        <div
          className={[
            "min-w-0",
            contentClassName,
          ].join(" ")}
        >
          {children}
        </div>

        {actions ? (
          <div className="flex min-h-[34px] flex-wrap items-start justify-start gap-1.5 md:justify-end">
            {actions}
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
      </div>
    </section>
  );
}
