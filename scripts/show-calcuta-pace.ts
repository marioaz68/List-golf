import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { scalePerHoleMinutesToDuration } from "@/lib/telegram/ritmo/paceCalculator";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing env");

  const admin = createClient(url, key);
  const courseId = "4bd3a144-dfe4-49f0-b11c-1d80132a7e63";
  const { data } = await admin
    .from("course_holes")
    .select("hole_number, par, pace_minutes")
    .eq("course_id", courseId)
    .order("hole_number");

  const per: Record<number, number> = {};
  const pars: Record<number, number> = {};
  let base = 0;
  for (const r of data ?? []) {
    per[r.hole_number] = Number(r.pace_minutes);
    pars[r.hole_number] = Number(r.par);
    base += Number(r.pace_minutes);
  }

  const scaled = scalePerHoleMinutesToDuration(per, pars, 300);
  let sum = 0;
  const byPar: Record<number, number[]> = { 3: [], 4: [], 5: [] };
  for (let h = 1; h <= 18; h++) {
    sum += scaled[h];
    byPar[pars[h]].push(scaled[h]);
  }
  const avg = (arr: number[]) =>
    Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;

  console.log("Base total:", base, "min (~", (base / 60).toFixed(2), "h)");
  console.log("Factor:", (300 / base).toFixed(4));
  console.log("Scaled total:", Math.round(sum * 100) / 100, "min (5 h)");
  console.log("Par 3 avg:", avg(byPar[3]), "min/hoyo");
  console.log("Par 4 avg:", avg(byPar[4]), "min/hoyo");
  console.log("Par 5 avg:", avg(byPar[5]), "min/hoyo");
  console.log("H1 par", pars[1], ":", per[1], "->", scaled[1]);
}

main().catch(console.error);
