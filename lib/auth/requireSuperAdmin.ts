import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function requireSuperAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data } = await supabase
    .from("user_global_roles")
    .select(`
      roles:role_id (
        code
      )
    `)
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin = (data ?? []).some((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.code === "super_admin";
  });

  if (!isSuperAdmin) {
    redirect("/");
  }

  return user;
}