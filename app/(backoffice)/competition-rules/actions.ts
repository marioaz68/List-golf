"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optNum(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${s}`);
  return n;
}

function parseBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function parseScoringFormat(value: unknown) {
  const v = String(value ?? "").trim();

  if (!["stroke_play", "stableford"].includes(v)) {
    throw new Error(`scoring_format inválido: ${v}`);
  }

  return v as "stroke_play" | "stableford";
}

function parseBasis(value: unknown) {
  const v = String(value ?? "").trim();

  if (!["gross", "net", "both", "stableford"].includes(v)) {
    throw new Error(`basis inválido: ${v}`);
  }

  return v as "gross" | "net" | "both" | "stableford";
}

type CompetitionRuleRow = {
  category_id: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  gross_prize_places?: number | null;
  net_prize_places?: number | null;
  is_active: boolean;
  notes?: string | null;
};

export async function saveCompetitionRulesSnapshot(formData: FormData) {
  const supabase = createAdminClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const rowsRaw = reqStr(formData, "rows_json");

  let rows: CompetitionRuleRow[] = [];

  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    throw new Error("rows_json inválido");
  }

  if (!Array.isArray(rows)) {
    throw new Error("rows_json debe ser arreglo");
  }

  const now = new Date().toISOString();
console.log("🔥 ACTIONS NUEVO EJECUTANDO");
  const normalizedRows = rows.map((row, index) => {
    const category_id = String(row.category_id ?? "").trim();

    if (!category_id) {
      throw new Error(`Falta categoría en fila ${index + 1}`);
    }

    const scoring_format = parseScoringFormat(row.scoring_format);
    let leaderboard_basis = parseBasis(row.leaderboard_basis);
    let prize_basis = parseBasis(row.prize_basis);

    const handicap_percentage = optNum(row.handicap_percentage) ?? 100;
    let gross_prize_places = optNum(row.gross_prize_places) ?? 1;
    let net_prize_places = optNum(row.net_prize_places);

    const is_active = parseBool(row.is_active);
    const notes = String(row.notes ?? "").trim() || null;

    // VALIDACIONES
    if (handicap_percentage < 0 || handicap_percentage > 150) {
      throw new Error(
        `El % handicap debe estar entre 0 y 150 en fila ${index + 1}`
      );
    }

    if (gross_prize_places < 0) {
      throw new Error(`Gross premios no puede ser negativo en fila ${index + 1}`);
    }

    if (net_prize_places !== null && net_prize_places < 0) {
      throw new Error(`Neto premios no puede ser negativo en fila ${index + 1}`);
    }

    // STABLEFORD
    if (scoring_format === "stableford") {
      leaderboard_basis = "stableford";
      prize_basis = "stableford";
      gross_prize_places = 0;
      net_prize_places = null;
    }

    // VALIDACIONES CRUZADAS
    if (scoring_format === "stroke_play" && leaderboard_basis === "stableford") {
      throw new Error(
        `Si la modalidad es Stroke Play, el leaderboard no puede ser Stableford en fila ${index + 1}`
      );
    }

    if (scoring_format === "stroke_play" && prize_basis === "stableford") {
      throw new Error(
        `Si la modalidad es Stroke Play, premios no puede ser Stableford en fila ${index + 1}`
      );
    }

    // 🔥 LÓGICA CORRECTA DE PREMIOS

    if (prize_basis === "gross") {
      net_prize_places = 0;
      if (gross_prize_places <= 0) gross_prize_places = 1;
    }

    if (prize_basis === "net") {
      gross_prize_places = 0;
      if (net_prize_places === null || net_prize_places <= 0) {
        net_prize_places = 1;
      }
    }

    if (prize_basis === "both") {
      if (gross_prize_places <= 0) {
        gross_prize_places = 1;
      }

      if (net_prize_places === null || net_prize_places <= 0) {
        net_prize_places = 1;
      }
    }

    return {
      tournament_id,
      category_id,
      scoring_format,
      leaderboard_basis,
      prize_basis,
      handicap_percentage,
      gross_prize_places,
      net_prize_places,
      is_active,
      notes,
      updated_at: now,
    };
  });

  // 🔥 BORRAR ANTES (SNAPSHOT)
  const { error: deleteError } = await supabase
    .from("category_competition_rules")
    .delete()
    .eq("tournament_id", tournament_id);

  if (deleteError) {
    throw new Error(`Error borrando reglas anteriores: ${deleteError.message}`);
  }

  if (normalizedRows.length > 0) {
    const { error: insertError } = await supabase
      .from("category_competition_rules")
      .insert(normalizedRows);

    if (insertError) {
      throw new Error(`Error insertando reglas nuevas: ${insertError.message}`);
    }
  }

  revalidatePath("/competition-rules");

  redirect(
    `/competition-rules?tournament_id=${tournament_id}&saved=${Date.now()}`
  );
}