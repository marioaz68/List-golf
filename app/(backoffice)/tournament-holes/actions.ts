"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function reqInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
}

function normalizePar(n: number) {
  if (n < 3 || n > 6) throw new Error("Par inválido. Debe estar entre 3 y 6.");
  return n;
}

function normalizeHcp(n: number) {
  if (n < 1 || n > 18) {
    throw new Error("Handicap del hoyo inválido. Debe estar entre 1 y 18.");
  }
  return n;
}

function buildDefaultHoleRows(tournamentId: string) {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    tournament_id: tournamentId,
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
  }));
}

export async function seedTournamentHoles(formData: FormData) {
  const supabase = await createClient();
  const tournamentId = reqStr(formData, "tournament_id");

  const defaults = buildDefaultHoleRows(tournamentId);

  const { error } = await supabase
    .from("tournament_holes")
    .upsert(defaults, {
      onConflict: "tournament_id,hole_number",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/tournament-holes");
  revalidatePath("/score-entry");
  redirect(`/tournament-holes?tournament_id=${tournamentId}`);
}

export async function saveTournamentHoles(formData: FormData) {
  const supabase = await createClient();
  const tournamentId = reqStr(formData, "tournament_id");

  const rows = Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const par = normalizePar(reqInt(formData, `par_${hole}`));
    const handicap_index = normalizeHcp(reqInt(formData, `hcp_${hole}`));

    return {
      tournament_id: tournamentId,
      hole_number: hole,
      par,
      handicap_index,
    };
  });

  const { error } = await supabase
    .from("tournament_holes")
    .upsert(rows, {
      onConflict: "tournament_id,hole_number",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/tournament-holes");
  revalidatePath("/score-entry");
  revalidatePath("/leaderboard");
  redirect(`/tournament-holes?tournament_id=${tournamentId}`);
}