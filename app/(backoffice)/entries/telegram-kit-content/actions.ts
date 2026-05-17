"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveTelegramKitContent(formData: FormData) {
  const tournamentId = reqStr(formData, "tournament_id");
  const greetingLine = reqStr(formData, "greeting_line");
  const bodyLines = String(formData.get("body_lines") ?? "").trim();
  const footerLine = reqStr(formData, "footer_line");

  const back = `/entries/telegram-kit-content?tournament_id=${encodeURIComponent(
    tournamentId
  )}`;

  await requireTournamentAccess({
    tournamentId,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
      "entries_operator",
    ],
  });

  if (!greetingLine || !bodyLines || !footerLine) {
    redirect(`${back}&err=${encodeURIComponent("Completa todos los campos.")}`);
  }

  const admin = await createAdminClient();
  const { error } = await admin.from("tournament_telegram_kit_content").upsert(
    {
      tournament_id: tournamentId,
      greeting_line: greetingLine,
      body_lines: bodyLines,
      footer_line: footerLine,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id" }
  );

  if (error) {
    redirect(`${back}&err=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/entries/telegram-kit-content");
  revalidatePath("/entries/telegram-kit");
  redirect(`${back}&saved=1`);
}
