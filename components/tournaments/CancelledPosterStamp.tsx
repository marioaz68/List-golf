type Props = {
  label?: string;
  /** Posters pequeños en la tabla de torneos (112×160). */
  compact?: boolean;
};

/** Sello diagonal sobre el poster de torneos de prueba / cancelados. */
export default function CancelledPosterStamp({
  label = "CANCELADO",
  compact = false,
}: Props) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: "rgba(0, 0, 0, 0.38)",
      }}
    >
      <div
        style={{
          transform: "rotate(-16deg)",
          border: `${compact ? 2 : 3}px solid rgba(220, 38, 38, 0.92)`,
          borderRadius: compact ? 4 : 6,
          padding: compact ? "2px 6px" : "6px 14px",
          background: "rgba(220, 38, 38, 0.25)",
          color: "#fecaca",
          fontWeight: 900,
          fontSize: compact ? 9 : 14,
          lineHeight: 1.1,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          boxShadow: "inset 0 0 0 1px rgba(220,38,38,0.4)",
          textShadow: "0 1px 3px rgba(0,0,0,0.65)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
