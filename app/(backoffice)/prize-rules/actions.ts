"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v || "";
}

function optNum(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${s}`);
  return n;
}

function optInt(value: unknown) {
  const n = optNum(value);
  return n === null ? null : Math.trunc(n);
}

function parseBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function parseScopeType(value: unknown) {
  const v = String(value ?? "").trim();

  if (!["overall", "category_group", "category_code_list", "category"].includes(v)) {
    throw new Error(`scope_type inválido: ${v}`);
  }

  return v as "overall" | "category_group" | "category_code_list" | "category";
}

function parseRankingBasis(value: unknown) {
  const v = String(value ?? "").trim();

  if (!["gross", "net", "stableford"].includes(v)) {
    throw new Error(`ranking_basis inválido: ${v}`);
  }

  return v as "gross" | "net" | "stableford";
}

function parseRankingMode(value: unknown) {
  const v = String(value ?? "").trim();

  if (!["tournament_to_date", "specified_rounds", "last_round_only"].includes(v)) {
    throw new Error(`ranking_mode inválido: ${v}`);
  }

  return v as "tournament_to_date" | "specified_rounds" | "last_round_only";
}

type PrizeRuleRow = {
  id?: string;
  scope_type: "overall" | "category_group" | "category_code_list" | "category";
  scope_value: string;
  prize_label: string;
  prize_position: number;
  ranking_basis: "gross" | "net" | "stableford";
  priority: number;
  unique_winner: boolean;
  show_on_leaderboard: boolean;
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  round_nos?: number[] | null;
  sort_order?: number | null;
  is_active: boolean;
  notes?: string | null;
};

function normalizeRoundNos(value: unknown) {
  if (!Array.isArray(value)) return null;

  const nums = value
    .map((x) => optInt(x))
    .filter((x): x is number => typeof x === "number" && x >= 1);

  return nums.length ? Array.from(new Set(nums)).sort((a, b) => a - b) : null;
}

export async function savePrizeRulesSnapshot(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const rowsRaw = reqStr(formData, "rows_json");
  const deleteIdsRaw = optStr(formData, "delete_ids_json");

  let rows: PrizeRuleRow[] = [];
  let deleteIds: string[] = [];

  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    throw new Error("rows_json inválido");
  }

  try {
    deleteIds = deleteIdsRaw ? JSON.parse(deleteIdsRaw) : [];
  } catch {
    throw new Error("delete_ids_json inválido");
  }

  if (!Array.isArray(rows)) throw new Error("rows_json debe ser arreglo");
  if (!Array.isArray(deleteIds)) throw new Error("delete_ids_json debe ser arreglo");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    r.scope_type = parseScopeType(r.scope_type);
    r.scope_value = String(r.scope_value ?? "").trim();
    r.prize_label = String(r.prize_label ?? "").trim();
    r.prize_position = optInt(r.prize_position) ?? 1;
    r.ranking_basis = parseRankingBasis(r.ranking_basis);
    r.priority = optInt(r.priority) ?? i + 1;
    r.unique_winner = parseBool(r.unique_winner);
    r.show_on_leaderboard = parseBool(r.show_on_leaderboard);
    r.ranking_mode = parseRankingMode(r.ranking_mode);
    r.round_nos = normalizeRoundNos(r.round_nos);
    r.sort_order = i + 1;
    r.is_active = parseBool(r.is_active);
    r.notes = String(r.notes ?? "").trim() || null;

    if (r.scope_type !== "overall" && !r.scope_value) {
      throw new Error(`Falta scope_value en fila ${i + 1}`);
    }

    if (r.prize_position < 1) {
      throw new Error(`Posición inválida en fila ${i + 1}`);
    }

    if (r.priority < 1) {
      throw new Error(`Prioridad inválida en fila ${i + 1}`);
    }

    if (!r.prize_label) {
      const basisLabel =
        r.ranking_basis === "gross"
          ? "Gross"
          : r.ranking_basis === "net"
            ? "Neto"
            : "Stableford";

      r.prize_label = `${r.prize_position} ${basisLabel}`;
    }
  }

  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("category_prize_rules")
      .delete()
      .in("id", deleteIds)
      .eq("tournament_id", tournament_id);

    if (delErr) throw new Error(delErr.message);
  }

  const existing = rows.filter((r) => r.id && !String(r.id).startsWith("tmp_"));
  const fresh = rows.filter((r) => !r.id || String(r.id).startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("category_prize_rules")
      .update({
        tournament_id,
        scope_type: r.scope_type,
        scope_value: r.scope_type === "overall" ? "ALL" : r.scope_value,
        prize_label: r.prize_label,
        prize_position: r.prize_position,
        ranking_basis: r.ranking_basis,
        priority: r.priority,
        unique_winner: r.unique_winner,
        show_on_leaderboard: r.show_on_leaderboard,
        ranking_mode: r.ranking_mode,
        round_nos: r.round_nos,
        sort_order: r.sort_order,
        is_active: r.is_active,
        notes: r.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id!);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      tournament_id,
      scope_type: r.scope_type,
      scope_value: r.scope_type === "overall" ? "ALL" : r.scope_value,
      prize_label: r.prize_label,
      prize_position: r.prize_position,
      ranking_basis: r.ranking_basis,
      priority: r.priority,
      unique_winner: r.unique_winner,
      show_on_leaderboard: r.show_on_leaderboard,
      ranking_mode: r.ranking_mode,
      round_nos: r.round_nos,
      sort_order: r.sort_order,
      is_active: r.is_active,
      notes: r.notes,
    }));

    const { error } = await supabase.from("category_prize_rules").insert(payload);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/prize-rules");
  redirect(`/prize-rules?tournament_id=${tournament_id}`);
}