import Link from "next/link";
import { User } from "lucide-react";

type UserNavIconLinkProps = {
  href: string;
  className?: string;
  label: string;
  iconClassName?: string;
  /** Tooltip (p. ej. email completo). */
  title?: string;
  /** Texto visible junto al icono (p. ej. nombre o «Entrar»). */
  showLabel?: boolean;
  labelText?: string;
};

/** Enlace de navegación con icono de usuario (login, administración, etc.). */
export function UserNavIconLink({
  href,
  className,
  label,
  iconClassName = "h-5 w-5",
  title,
  showLabel = false,
  labelText,
}: UserNavIconLinkProps) {
  const visible = showLabel ? (labelText ?? label) : null;

  return (
    <Link
      href={href}
      className={className}
      aria-label={label}
      title={title ?? label}
    >
      <User
        className={`${iconClassName} shrink-0`}
        strokeWidth={2.25}
        aria-hidden
      />
      {visible ? (
        <span className="truncate text-xs font-medium sm:text-sm">{visible}</span>
      ) : null}
    </Link>
  );
}
