type Props = {
  label?: string;
};

/** Sello diagonal sobre el poster de torneos de prueba / cancelados. */
export default function CancelledPosterStamp({
  label = "CANCELADO",
}: Props) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/25"
    >
      <div
        className="rounded-md border-[3px] border-red-600/90 bg-red-600/20 px-3 py-1.5 text-sm font-black uppercase tracking-[0.14em] text-red-500 shadow-[inset_0_0_0_1px_rgba(220,38,38,0.35)]"
        style={{ transform: "rotate(-16deg)" }}
      >
        {label}
      </div>
    </div>
  );
}
