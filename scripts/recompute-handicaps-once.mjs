import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const tournamentId = process.argv[2] || "a3badced-0b7d-47cc-9f31-1d13545dc5f9";
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

function normalizeTeeName(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function computeWhs(hi, slope, courseRating, par, allowancePct) {
  const ch = roundHalfUp(hi * (slope / 113) + (courseRating - par));
  const ph = roundHalfUp((ch * allowancePct) / 100);
  return { ch, ph };
}

function findCourseTee(maps, tee) {
  const code = String(tee.code ?? "").trim().toUpperCase();
  if (code && maps.byCode.has(code)) return maps.byCode.get(code);
  const nameNorm = normalizeTeeName(tee.name ?? tee.code ?? null);
  if (nameNorm && maps.byName.has(nameNorm)) return maps.byName.get(nameNorm);
  const colorNorm = normalizeTeeName(tee.color ?? null);
  if (colorNorm && maps.byColor.has(colorNorm)) return maps.byColor.get(colorNorm);
  return null;
}

function whsFromCourseTee(courseTee, gender) {
  const g = String(gender ?? "M").toUpperCase();
  if (g === "F" && courseTee.slope_women != null && courseTee.course_rating_women != null) {
    return {
      slope: Number(courseTee.slope_women),
      course_rating: Number(courseTee.course_rating_women),
      par: Number(courseTee.par ?? 72),
    };
  }
  if (courseTee.slope_men != null && courseTee.course_rating_men != null) {
    return {
      slope: Number(courseTee.slope_men),
      course_rating: Number(courseTee.course_rating_men),
      par: Number(courseTee.par ?? 72),
    };
  }
  return null;
}

function matchesRule(rule, player, hi, year) {
  const gender = String(player?.gender ?? "X").toUpperCase();
  if (rule.gender && rule.gender !== "X" && rule.gender !== gender) return false;
  if (rule.age_min != null && year != null && year < Number(rule.age_min)) return false;
  if (rule.age_max != null && year != null && year > Number(rule.age_max)) return false;
  if (rule.handicap_min != null && hi < Number(rule.handicap_min)) return false;
  if (rule.handicap_max != null && hi > Number(rule.handicap_max)) return false;
  return true;
}

async function main() {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("course_id")
    .eq("id", tournamentId)
    .maybeSingle();
  const courseId = tournament?.course_id;

  const [teeSetsRes, rulesRes, compRulesRes, courseTeesRes, mpRulesRes, entriesRes] =
    await Promise.all([
      admin.from("tee_sets").select("id, code, name, color").eq("tournament_id", tournamentId),
      admin
        .from("category_tee_rules")
        .select(
          "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
        )
        .eq("tournament_id", tournamentId)
        .order("priority", { ascending: true }),
      admin
        .from("category_competition_rules")
        .select("category_id, handicap_percentage, is_active")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true),
      courseId
        ? admin
            .from("course_tee_sets")
            .select(
              "code, name, color, slope_men, slope_women, course_rating_men, course_rating_women, par"
            )
            .eq("course_id", courseId)
        : Promise.resolve({ data: [] }),
      admin
        .from("tournament_matchplay_rules")
        .select("handicap_allowance_pct")
        .eq("tournament_id", tournamentId)
        .maybeSingle(),
      admin
        .from("tournament_entries")
        .select(
          "id, player_id, category_id, handicap_index, playing_handicap_override, tee_set_id_override, handicap_calc_meta, players(gender, birth_year, handicap_index, handicap_torneo, first_name, last_name)"
        )
        .eq("tournament_id", tournamentId)
        .neq("status", "cancelled"),
    ]);

  const allowancePctByCategory = new Map();
  for (const r of compRulesRes.data ?? []) {
    if (r.category_id) allowancePctByCategory.set(r.category_id, Number(r.handicap_percentage));
  }
  const fallbackPct = Number(mpRulesRes.data?.handicap_allowance_pct ?? 80);

  const courseMaps = { byCode: new Map(), byName: new Map(), byColor: new Map() };
  for (const t of courseTeesRes.data ?? []) {
    if (t.code) courseMaps.byCode.set(String(t.code).trim().toUpperCase(), t);
    const nameNorm = normalizeTeeName(t.name ?? t.code ?? null);
    if (nameNorm) courseMaps.byName.set(nameNorm, t);
    const colorNorm = normalizeTeeName(t.color ?? null);
    if (colorNorm) courseMaps.byColor.set(colorNorm, t);
  }

  const teeSetById = new Map((teeSetsRes.data ?? []).map((t) => [t.id, t]));
  const rulesByCategory = new Map();
  for (const r of rulesRes.data ?? []) {
    const list = rulesByCategory.get(r.category_id) ?? [];
    list.push(r);
    rulesByCategory.set(r.category_id, list);
  }

  let updated = 0;
  let skipped = 0;

  for (const e of entriesRes.data ?? []) {
    const player = Array.isArray(e.players) ? e.players[0] : e.players;
    const hi = Number(
      e.handicap_index ?? player?.handicap_index ?? player?.handicap_torneo ?? 0
    );
    const allowance =
      (e.category_id && allowancePctByCategory.get(e.category_id)) || fallbackPct;
    const meta = e.handicap_calc_meta ?? {};
    const year = player?.birth_year ?? null;

    let whs = null;
    let teeCode = meta.tee_code ?? null;
    let source = "category_tee_whs";

    if (e.tee_set_id_override) {
      const ts = teeSetById.get(e.tee_set_id_override);
      const courseTee = ts ? findCourseTee(courseMaps, ts) : null;
      whs = courseTee ? whsFromCourseTee(courseTee, player?.gender) : null;
      teeCode = ts?.code ?? teeCode;
      source = "tee_override";
    }

    if (!whs && meta.slope && meta.course_rating && meta.par) {
      whs = {
        slope: Number(meta.slope),
        course_rating: Number(meta.course_rating),
        par: Number(meta.par),
      };
      source = "meta_recalc";
    }

    if (!whs && e.category_id) {
      const rules = rulesByCategory.get(e.category_id) ?? [];
      for (const rule of rules) {
        if (!matchesRule(rule, player, hi, year)) continue;
        const ts = teeSetById.get(rule.tee_set_id);
        const courseTee = ts ? findCourseTee(courseMaps, ts) : null;
        whs = courseTee ? whsFromCourseTee(courseTee, player?.gender) : null;
        if (whs) {
          teeCode = ts?.code ?? teeCode;
          break;
        }
      }
    }

    if (!whs) {
      skipped++;
      console.error("SKIP", player?.last_name, "no tee");
      continue;
    }

    const { ch, ph } = computeWhs(
      hi,
      whs.slope,
      whs.course_rating,
      whs.par,
      allowance
    );
    const finalPh =
      e.playing_handicap_override != null
        ? Math.round(Number(e.playing_handicap_override))
        : ph;

    const { error } = await admin
      .from("tournament_entries")
      .update({
        course_handicap: ch,
        playing_handicap: finalPh,
        handicap_calc_meta: {
          hi,
          slope: whs.slope,
          course_rating: whs.course_rating,
          par: whs.par,
          allowance_pct: allowance,
          computed_at: new Date().toISOString(),
          source,
          tee_code: teeCode,
          category_id: e.category_id,
        },
      })
      .eq("id", e.id);

    if (!error) updated++;
    else console.error("FAIL", player?.last_name, error.message);
  }

  console.log(
    JSON.stringify({ tournamentId, updated, skipped, total: entriesRes.data?.length ?? 0 })
  );

  const { data: check } = await admin
    .from("tournament_entries")
    .select(
      "handicap_index, course_handicap, playing_handicap, handicap_calc_meta, players(last_name)"
    )
    .eq("tournament_id", tournamentId)
    .in("player_id", [
      "8e33e9e3-b7aa-4e14-adfa-d3e7ca9d2486",
      "57d31d56-68a8-4367-9d8f-992b7e40a3fe",
    ]);

  for (const row of check ?? []) {
    const p = Array.isArray(row.players) ? row.players[0] : row.players;
    console.log(
      "CHECK",
      p?.last_name,
      "HI",
      row.handicap_index,
      "CH",
      row.course_handicap,
      "PH",
      row.playing_handicap,
      "meta_hi",
      row.handicap_calc_meta?.hi
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
