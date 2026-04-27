"use server";

import { createAdminClient } from "@/utils/supabase/admin";
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

/**
 * 🔥 FIX IMPORTANTE:
 * Soporta "tee_times" viejo y lo convierte a "tee_time"
 */
function reqStartType(fd: FormData) {
  let v = String(fd.get("start_type") ?? "").trim();

  if (v === "tee_times") v = "tee_time";

  if (v !== "tee_time" && v !== "shotgun") {
    throw new Error("start_type inválido");
  }

  return v as "tee_time" | "shotgun";
}

function optWave(fd: FormData) {
  const v = String(fd.get("wave") ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v !== "AM" && v !== "PM") {
    throw new Error("Turno inválido");
  }
  return v;
}

function reqGroupSize(fd: FormData) {
  const n = reqInt(fd, "group_size");
  if (n < 2 || n > 5) {
    throw new Error("Tamaño de grupo inválido");
  }
  return n;
}

function normalizeTime(raw: string | null) {
  if (!raw) return null;

  let s = raw.toLowerCase().trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error("Hora inválida");

  const h = Number(m[1]);
  const min = Number(m[2]);

  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error("Hora inválida");
  }

  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

async function ensureAccess(tournament_id: string) {
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
  const supabase = createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const round_no = reqInt(formData, "round_no");
  const category_id = reqStr(formData, "category_id");
  const round_date = optStr(formData, "round_date");
  const wave = optWave(formData);
  const start_type = reqStartType(formData);
  const start_time = normalizeTime(optStr(formData, "start_time"));
  const interval_minutes = optInt(formData, "interval_minutes");
  const group_size = reqGroupSize(formData);

  const { error } = await supabase.from("rounds").insert({
    tournament_id,
    round_no,
    category_id,
    round_date,
    wave,
    start_type,
    start_time,
    interval_minutes,
    group_size,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");
  redirect(`/rounds?tournament_id=${tournament_id}`);
}

export async function updateRound(formData: FormData) {
  const supabase = createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureAccess(tournament_id);

  const round_no = reqInt(formData, "round_no");
  const category_id = optStr(formData, "category_id");
  const round_date = optStr(formData, "round_date");
  const wave = optWave(formData);
  const start_type = reqStartType(formData);
  const start_time = normalizeTime(optStr(formData, "start_time"));
  const interval_minutes = optInt(formData, "interval_minutes");
  const group_size = reqGroupSize(formData);

  const { error } = await supabase
    .from("rounds")
    .update({
      round_no,
      category_id,
      round_date,
      wave,
      start_type,
      start_time,
      interval_minutes,
      group_size,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");
  redirect(`/rounds?tournament_id=${tournament_id}`);
}

export async function deleteRound(formData: FormData) {
  const supabase = createAdminClient();

  const id = reqStr(formData, "id");
  const tournament_id = optStr(formData, "tournament_id");

  if (tournament_id) {
    await ensureAccess(tournament_id);
  }

  const { error } = await supabase
    .from("rounds")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/rounds");

  if (tournament_id) {
    redirect(`/rounds?tournament_id=${tournament_id}`);
  }

  redirect("/rounds");
}