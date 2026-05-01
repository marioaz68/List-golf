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

function parseScopeType(value: unknown) {
  const v = String(value ?? "").trim();
  if (!["category", "category_group", "category_code_list", "overall"].includes(v)) {
    throw new Error(`scope_type inválido: ${v}`);
  }
  return v as "category" | "category_group" | "category_code_list" | "overall";
}

function parseRankingBasis(value: unknown) {
  const v = String(value ?? "").trim();
  if (
    ![
      "gross_total",
      "net_total",
      "points_total",
      "gross_round",
      "net_round",
      "points_round",
    ].includes(v)
  ) {
    throw new Error(`ranking_basis inválido: ${v}`);
  }

  return v as
    | "gross_total"
    | "net_total"
    | "points_total"
    | "gross_round"
    | "net_round"
    | "points_round";
}

function parseRankingMode(value: unknown) {
  const v = String(value ?? "").trim();
  if (!["tournament_to_date", "specified_rounds", "last_round_only"].includes(v)) {
    throw new Error(`ranking_mode inválido: ${v}`);
  }
  return v as "tournament_to_date" | "specified_rounds" | "last_round_only";
}

function parseAdvancementType(value: unknown) {
  const v = String(value ?? "").trim();
  if (!["top_n", "top_percent", "all"].includes(v)) {
    throw new Error(`advancement_type inválido: ${v}`);
  }
  return v as "top_n" | "top_percent" | "all";
}

function parseBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

type RuleRow = {
  id?: string;
  from_round_no: number;
  to_round_no: number;
  scope_type: "category" | "category_group" | "category_code_list" | "overall";
  scope_value: string;
  ranking_basis:
    | "gross_total"
    | "net_total"
    | "points_total"
    | "gross_round"
    | "net_round"
    | "points_round";
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  advancement_type: "top_n" | "top_percent" | "all";
  advancement_value: number;
  include_ties: boolean;
  gross_exemption_enabled?: boolean;
  gross_exemption_top_n?: number;
  tie_break_profile_id?: string | null;
  sort_order?: number;
  is_active: boolean;
  notes?: string | null;
};

export async function saveCutRulesSnapshot(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const rowsRaw = reqStr(formData, "rows_json");
  const deleteIdsRaw = optStr(formData, "delete_ids_json");

  let rows: RuleRow[] = [];
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

    r.from_round_no = optInt(r.from_round_no) ?? 0;
    r.to_round_no = optInt(r.to_round_no) ?? 0;
    r.scope_type = parseScopeType(r.scope_type);
    r.scope_value = String(r.scope_value ?? "").trim();
    r.ranking_basis = parseRankingBasis(r.ranking_basis);
    r.ranking_mode = parseRankingMode(r.ranking_mode);
    r.advancement_type = parseAdvancementType(r.advancement_type);
    r.advancement_value = optNum(r.advancement_value) ?? 0;

    if (r.advancement_type === "all") {
      r.advancement_value = 0;
    }

    r.include_ties = parseBool(r.include_ties);
    r.gross_exemption_enabled = parseBool(r.gross_exemption_enabled);
    r.gross_exemption_top_n = optInt(r.gross_exemption_top_n) ?? 0;

    if (!r.gross_exemption_enabled) {
      r.gross_exemption_top_n = 0;
    }

    if (r.gross_exemption_enabled && r.gross_exemption_top_n < 1) {
      throw new Error(`Top Gross protegido inválido en fila ${i + 1}`);
    }

    r.tie_break_profile_id = String(r.tie_break_profile_id ?? "").trim() || null;
    r.sort_order = i + 1;
    r.is_active = parseBool(r.is_active);
    r.notes = String(r.notes ?? "").trim() || null;

    if (r.from_round_no < 1) {
      throw new Error(`from_round_no inválido en fila ${i + 1}`);
    }

    if (r.to_round_no < 1) {
      throw new Error(`to_round_no inválido en fila ${i + 1}`);
    }

    if (r.to_round_no < r.from_round_no) {
      throw new Error(`to_round_no debe ser mayor o igual que from_round_no en fila ${i + 1}`);
    }

    if (r.scope_type !== "overall" && !r.scope_value) {
      throw new Error(`Falta scope_value en fila ${i + 1}`);
    }

    if (r.advancement_type === "top_n" && r.advancement_value < 1) {
      throw new Error(`Top N inválido en fila ${i + 1}`);
    }

    if (
      r.advancement_type === "top_percent" &&
      (r.advancement_value <= 0 || r.advancement_value > 100)
    ) {
      throw new Error(`Top % inválido en fila ${i + 1}`);
    }
  }

  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("round_advancement_rules")
      .delete()
      .in("id", deleteIds)
      .eq("tournament_id", tournament_id);

    if (delErr) throw new Error(delErr.message);
  }

  const existing = rows.filter((r) => r.id && !String(r.id).startsWith("tmp_"));
  const fresh = rows.filter((r) => !r.id || String(r.id).startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("round_advancement_rules")
      .update({
        tournament_id,
        from_round_no: r.from_round_no,
        to_round_no: r.to_round_no,
        scope_type: r.scope_type,
        scope_value: r.scope_type === "overall" ? "ALL" : r.scope_value,
        ranking_basis: r.ranking_basis,
        ranking_mode: r.ranking_mode,
        advancement_type: r.advancement_type,
        advancement_value: r.advancement_value,
        include_ties: r.include_ties,
        gross_exemption_enabled: r.gross_exemption_enabled,
        gross_exemption_top_n: r.gross_exemption_top_n,
        tie_break_profile_id: r.tie_break_profile_id,
        sort_order: r.sort_order,
        is_active: r.is_active,
        notes: r.notes,
      })
      .eq("id", r.id!);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      tournament_id,
      from_round_no: r.from_round_no,
      to_round_no: r.to_round_no,
      scope_type: r.scope_type,
      scope_value: r.scope_type === "overall" ? "ALL" : r.scope_value,
      ranking_basis: r.ranking_basis,
      ranking_mode: r.ranking_mode,
      advancement_type: r.advancement_type,
      advancement_value: r.advancement_value,
      include_ties: r.include_ties,
      gross_exemption_enabled: r.gross_exemption_enabled,
      gross_exemption_top_n: r.gross_exemption_top_n,
      tie_break_profile_id: r.tie_break_profile_id,
      sort_order: r.sort_order,
      is_active: r.is_active,
      notes: r.notes,
    }));

    const { error } = await supabase.from("round_advancement_rules").insert(payload);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/cut-rules");

  redirect(`/cut-rules?tournament_id=${tournament_id}&saved=1`);
}