import { headers } from "next/headers";
import AppHeader from "@/components/AppHeader";
import { isBackofficePath } from "@/lib/auth/permissions";

/** Oculta el header global en backoffice (barra propia) y en flujos públicos de auth/captura. */
export default async function ConditionalAppHeader() {
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (
    isBackofficePath(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/torneos/") ||
    pathname.startsWith("/sign/") ||
    pathname.startsWith("/captura/")
  ) {
    return null;
  }

  return <AppHeader />;
}
