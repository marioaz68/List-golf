import { redirect } from "next/navigation";
import BackofficeLayoutClient from "@/components/layout/BackofficeLayoutClient";
import BackofficeUserCorner from "@/components/layout/BackofficeUserCorner";
import { BackofficeRolesProvider } from "@/components/layout/BackofficeRolesContext";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessAnyBackofficeModule } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

function isNextRedirectOrNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND";
}

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let locale: Locale = "es";
  try {
    locale = await getLocale();
  } catch (err) {
    console.error("[backoffice/layout] getLocale:", err);
  }

  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    user = (auth.data?.user ?? null) as { id: string } | null;
  } catch (err) {
    if (isNextRedirectOrNotFound(err)) throw err;
    console.error("[backoffice/layout] createClient/getUser:", err);
    redirect("/login");
  }

  if (!user) {
    redirect("/login");
  }

  let roles: string[] = [];
  try {
    const supabase = await createClient();
    roles = await getUserRoles(supabase, user.id);
  } catch (err) {
    if (isNextRedirectOrNotFound(err)) throw err;
    console.error("[backoffice/layout] getUserRoles:", err);
  }

  if (!canAccessAnyBackofficeModule(roles)) {
    redirect("/login");
  }

  return (
    <BackofficeRolesProvider roles={roles}>
      <BackofficeLayoutClient
        locale={locale}
        userCorner={<BackofficeUserCorner />}
      >
        {children}
      </BackofficeLayoutClient>
    </BackofficeRolesProvider>
  );
}
