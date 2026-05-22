import { redirect } from "next/navigation";
import BackofficeLayoutClient from "@/components/layout/BackofficeLayoutClient";
import BackofficeUserCorner from "@/components/layout/BackofficeUserCorner";
import { BackofficeRolesProvider } from "@/components/layout/BackofficeRolesContext";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessAnyBackofficeModule } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/utils/supabase/server";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const roles = await getUserRoles(supabase, user.id);

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
