import Link from "next/link";
import { User } from "lucide-react";

type UserNavIconLinkProps = {
  href: string;
  className?: string;
  label: string;
  iconClassName?: string;
};

/** Enlace de navegación con icono de usuario (login, administración, etc.). */
export function UserNavIconLink({
  href,
  className,
  label,
  iconClassName = "h-5 w-5",
}: UserNavIconLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={label}
      title={label}
    >
      <User
        className={`${iconClassName} shrink-0`}
        strokeWidth={2.25}
        aria-hidden
      />
    </Link>
  );
}
