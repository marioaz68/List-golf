"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  active: "gross" | "net";
  labels: {
    gross: string;
    net: string;
    aria: string;
  };
};

export default function PublicLeaderboardBasisToggle({ active, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setBasis(basis: "gross" | "net") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("basis", basis);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2"
      role="group"
      aria-label={labels.aria}
    >
      {(["gross", "net"] as const).map((basis) => {
        const selected = active === basis;
        return (
          <button
            key={basis}
            type="button"
            onClick={() => setBasis(basis)}
            aria-pressed={selected}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              selected
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "border-white/15 bg-[#0c1728] text-slate-300 hover:border-white/25 hover:text-white"
            }`}
          >
            {basis === "gross" ? labels.gross : labels.net}
          </button>
        );
      })}
    </div>
  );
}
