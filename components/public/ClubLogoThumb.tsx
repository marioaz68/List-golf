type ClubLogoThumbProps = {
  clubId: string | null | undefined;
  /** Side length in CSS px */
  size?: number;
  className?: string;
  /** Tooltip / accesible cuando hay nombre corto del club */
  title?: string | null;
};

export default function ClubLogoThumb({
  clubId,
  size = 40,
  className = "",
  title,
}: ClubLogoThumbProps) {
  const id =
    typeof clubId === "string" && clubId.trim() ? clubId.trim() : null;

  if (!id) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[10px] font-bold text-slate-500 ${className}`}
        style={{ width: size, height: size }}
        title={title ?? undefined}
        aria-hidden
      >
        —
      </div>
    );
  }

  const src = `/api/club-logo?club_id=${encodeURIComponent(id)}`;

  return (
    <img
      src={src}
      alt={title?.trim() || "Club"}
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-xl border border-white/15 bg-white object-contain p-0.5 shadow-inner shadow-black/20 ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      title={title?.trim() || undefined}
    />
  );
}
