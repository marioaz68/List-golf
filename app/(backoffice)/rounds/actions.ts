"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

function reqInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);

  if (!Number.isFinite(n)) {
    throw new Error(`Número inválido en ${key}`);
  }

  return Math.trunc(n);
}

function optInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Número inválido en ${key}`);
  }

  return Math.trunc(n);
}

function reqStartType(fd: FormData) {
  const v = String(fd.get("start_type") ?? "").trim();

  if (v !== "tee_times" && v !== "shotgun") {
    throw new Error("start_type inválido");
  }

  return v as "tee_times" | "shotgun";
}

function normalizeTime(raw: string | null) {
  if (!raw) return null;

  let s = raw.toLowerCase().trim();
  if (!s) return null;

  s = s.replace(/\./g, "");
  s = s.replace(/\s+/g, " ");

  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);

    if (h < 0 || h > 23 || m < 0 || m > 59) {
      throw new Error("Hora inválida. Usa 07:30 / 14:30 / 7:30 am.");
    }

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2]);
    const ap = m12[3];

    if (h < 1 || h > 12 || m < 0 || m > 59) {
      throw new Error("Hora inválida. Usa 07:30 / 14:30 / 7:30 am.");
    }

    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  throw new Error("Hora inválida. Usa 07:30 / 14:30 / 7:30 am.");
}

async function ensureRoundsAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
    ],
  });
}

export async function createRound(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureRoundsAccess(tournament_id);

  const round_no = reqInt(formData, "round_no");
  const round_date = optStr(formData, "round_date");
  const start_type = reqStartType(formData);
  const start_time = normalizeTime(optStr(formData, "start_time"));
  const interval_minutes = optInt(formData, "interval_minutes");

  const { error } = await supabase.from("rounds").insert({
    tournament_id,
    round_no,
    round_date,
    start_type,
    start_time,
    interval_minutes,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");
  redirect(`/rounds?tournament_id=${tournament_id}`);
}

export async function updateRound(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureRoundsAccess(tournament_id);

  const round_no = reqInt(formData, "round_no");
  const round_date = optStr(formData, "round_date");
  const start_type = reqStartType(formData);
  const start_time = normalizeTime(optStr(formData, "start_time"));
  const interval_minutes = optInt(formData, "interval_minutes");

  const { error } = await supabase
    .from("rounds")
    .update({
      tournament_id,
      round_no,
      round_date,
      start_type,
      start_time,
      interval_minutes,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");
  redirect(`/rounds?tournament_id=${tournament_id}`);
}

export async function deleteRound(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = optStr(formData, "tournament_id");

  if (tournament_id) {
    await ensureRoundsAccess(tournament_id);
  }

  const { error } = await supabase.from("rounds").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");

  if (tournament_id) {
    redirect(`/rounds?tournament_id=${tournament_id}`);
  }

  redirect("/rounds");
}