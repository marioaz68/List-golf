/**
 * Diagnóstico de corte por categoría (inscritos, reglas, cupo esperado).
 * Uso: npx tsx scripts/diagnose-cut-by-category.ts <tournament_id> [round_no]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { buildInscribedCountByCategory, cutSlotsFromRule } from "../lib/cuts/cutAdvancementPolicy";
import type { RoundAdvancementRule } from "../lib/cuts/computeCutLine";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const tournamentId = process.argv[2]?.trim();
const roundNo = Number(process.argv[3] ?? 2);
if (!tournamentId) {
  console.error("Uso: npx tsx scripts/diagnose-cut-by-category.ts <tournament_id> [round_no]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function expectedHalf(n: number) {
  return Math.floor(n / 2);
}

async function main() {
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: categories } = await admin
    .from("categories")
    .select("id, code, name")
    .eq("tournament_id", tournamentId)
    .order("code");

  const codeById = new Map(
    (categories ?? []).map((c) => [String(c.id), String(c.code ?? c.name ?? "?")])
  );

  const { data: entries } = await admin
    .from("tournament_entries")
    .select("id, category_id, status, player_number")
    .eq("tournament_id", tournamentId);

  const byCode: Record<string, number> = {};
  const byCodeAll: Record<string, number> = {};
  for (const e of entries ?? []) {
    const code = codeById.get(String(e.category_id ?? "")) ?? "SIN_CAT";
    byCodeAll[code] = (byCodeAll[code] ?? 0) + 1;
    const s = (e.status ?? "").toLowerCase();
    if (s === "withdrawn" || s === "cancelled") continue;
    byCode[code] = (byCode[code] ?? 0) + 1;
  }

  const inscribed = buildInscribedCountByCategory(
    (entries ?? []).map((e) => ({
      category_id: e.category_id,
      status: e.status,
    }))
  );

  const { data: rules } = await admin
    .from("round_advancement_rules")
    .select(
      "id, from_round_no, to_round_no, scope_type, scope_value, ranking_basis, ranking_mode, advancement_type, advancement_value, include_ties, gross_exemption_enabled, gross_exemption_top_n, tie_break_profile_id, sort_order, is_active, notes"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("sort_order");

  console.log("\n=== INSCRITOS (excl. withdrawn/cancelled) ===\n");
  const sortedCodes = Object.keys(byCode).sort();
  for (const code of sortedCodes) {
    const n = byCode[code]!;
    const catId = [...codeById.entries()].find(([, c]) => c === code)?.[0];
    const fromMap = catId ? inscribed.get(catId) : undefined;
    console.log(
      `${code.padEnd(6)} inscritos=${n}  buildInscribed=${fromMap ?? "?"}  mitad↓=${expectedHalf(n)}`
    );
  }

  console.log("\n=== REGLAS DE CORTE ACTIVAS ===\n");
  for (const r of rules ?? []) {
    console.log(
      JSON.stringify(
        {
          scope: `${r.scope_type}:${r.scope_value}`,
          to: r.to_round_no,
          type: r.advancement_type,
          value: r.advancement_value,
          include_ties: r.include_ties,
          gross_ex: r.gross_exemption_enabled,
        },
        null,
        0
      )
    );
  }

  const enforcing = (rules ?? []).filter(
    (r) =>
      r.is_active &&
      r.to_round_no === roundNo &&
      r.from_round_no < roundNo
  ) as RoundAdvancementRule[];

  console.log(`\n=== CUPO MOTOR (reglas con to_round_no=${roundNo}) ===\n`);

  for (const cat of categories ?? []) {
    const code = String(cat.code ?? cat.name);
    const fieldSize = inscribed.get(String(cat.id)) ?? 0;
    const matching = enforcing.filter((rule) => {
      const c = code.toUpperCase();
      if (rule.scope_type === "category_code_list") {
        return String(rule.scope_value ?? "")
          .split(",")
          .map((x) => x.trim().toUpperCase())
          .includes(c);
      }
      if (rule.scope_type === "category") {
        return (
          String(rule.scope_value) === String(cat.id) ||
          String(rule.scope_value).toUpperCase() === c
        );
      }
      return false;
    });

    if (matching.length === 0) {
      console.log(`${code.padEnd(6)} sin regla de corte para R${roundNo}`);
      continue;
    }

    for (const rule of matching) {
      const slots = cutSlotsFromRule(rule as RoundAdvancementRule, fieldSize);
      console.log(
        `${code.padEnd(6)} inscritos=${fieldSize}  regla=${rule.advancement_type}@${rule.advancement_value}%  cupo=${slots}  (mitad↓=${expectedHalf(fieldSize)})  scope=${rule.scope_type}`
      );
    }
  }

  console.log("\n=== TOTAL ENTRIES RAW (incl. withdrawn) ===\n");
  for (const code of Object.keys(byCodeAll).sort()) {
    console.log(`${code.padEnd(6)} ${byCodeAll[code]}`);
  }

  const catA = categories?.find((c) => c.code === "A");
  if (catA) {
    const aEntries = (entries ?? []).filter((e) => e.category_id === catA.id);
    const st: Record<string, number> = {};
    for (const e of aEntries) {
      const s = (e.status ?? "null").toLowerCase();
      st[s] = (st[s] ?? 0) + 1;
    }
    console.log("\n=== CAT A status breakdown ===", st);
  }

  console.log("\n=== tie_break_profile_id en reglas ===\n");
  for (const r of rules ?? []) {
    console.log(
      `${r.scope_type}:${r.scope_value}  profile=${r.tie_break_profile_id ?? "NULL"}  include_ties=${r.include_ties}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
