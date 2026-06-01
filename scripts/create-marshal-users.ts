/**
 * Crea el rol marshal (si falta) y hasta 5 usuarios marshal por club.
 *
 * Uso:
 *   npx tsx scripts/create-marshal-users.ts --club-id=<uuid>
 *   npx tsx scripts/create-marshal-users.ts --club-id=<uuid> --password="Marshal2026!"
 *   npx tsx scripts/create-marshal-users.ts --list-clubs
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

const listClubs = process.argv.includes("--list-clubs");
const clubId = arg("club-id");
const tournamentId = arg("tournament-id");
const password = arg("password") ?? "Marshal2026!";

const MARSHALS = [
  { first: "Marshal", last: "Uno", email: "marshal1@listgolf.club" },
  { first: "Marshal", last: "Dos", email: "marshal2@listgolf.club" },
  { first: "Marshal", last: "Tres", email: "marshal3@listgolf.club" },
  { first: "Marshal", last: "Cuatro", email: "marshal4@listgolf.club" },
  { first: "Marshal", last: "Cinco", email: "marshal5@listgolf.club" },
];

async function ensureMarshalRole(admin: ReturnType<typeof createClient>) {
  const { data: existing } = await admin
    .from("roles")
    .select("id, code")
    .eq("code", "marshal")
    .maybeSingle();

  if (existing?.id) return;

  const { error } = await admin.from("roles").insert({
    code: "marshal",
    name: "Marshal / Juez de campo",
    description:
      "Acceso solo a captura de tarjetas y revisión de scorecards.",
  });
  if (error && !error.message.includes("duplicate")) {
    throw new Error(`roles: ${error.message}`);
  }
}

async function getMarshalRoleId(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .eq("code", "marshal")
    .single();
  if (error || !data) throw new Error("No se encontró rol marshal.");
  return data.id as string;
}

async function main() {
  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local"
    );
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (listClubs) {
    const { data, error } = await admin
      .from("clubs")
      .select("id, name")
      .order("name");
    if (error) throw error;
    console.log("Clubs disponibles:");
    for (const c of data ?? []) {
      console.log(`  ${c.id}  ${c.name}`);
    }
    return;
  }

  if (!clubId && !tournamentId) {
    console.error(
      "Uso: npx tsx scripts/create-marshal-users.ts --club-id=<uuid>\n" +
        "     npx tsx scripts/create-marshal-users.ts --tournament-id=<uuid>\n" +
        "     npx tsx scripts/create-marshal-users.ts --list-clubs"
    );
    process.exit(1);
  }

  let resolvedClubId = clubId;
  if (!resolvedClubId && tournamentId) {
    const { data: t, error: tErr } = await admin
      .from("tournaments")
      .select("id, name, club_id")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr || !t?.club_id) {
      throw new Error("Torneo no encontrado o sin club_id.");
    }
    console.log(`Torneo: ${t.name}`);
    resolvedClubId = t.club_id;
  }

  await ensureMarshalRole(admin);
  const marshalRoleId = await getMarshalRoleId(admin);

  const { data: club, error: clubErr } = await admin
    .from("clubs")
    .select("id, name")
    .eq("id", resolvedClubId!)
    .maybeSingle();
  if (clubErr || !club) throw new Error("Club no encontrado.");

  console.log(`Club: ${club.name} (${club.id})`);
  console.log(`Password temporal para todos: ${password}\n`);

  const created: Array<{ email: string; status: string }> = [];

  for (const m of MARSHALS) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("email", m.email)
      .maybeSingle();

    let userId = existingProfile?.id as string | undefined;

    if (!userId) {
      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email: m.email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: m.first,
            last_name: m.last,
          },
        });

      if (authError) {
        created.push({ email: m.email, status: `ERROR auth: ${authError.message}` });
        continue;
      }
      userId = authData.user?.id;
      if (!userId) {
        created.push({ email: m.email, status: "ERROR: sin user id" });
        continue;
      }
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email: m.email,
      first_name: m.first,
      last_name: m.last,
      is_active: true,
    });
    if (profileError) {
      created.push({
        email: m.email,
        status: `ERROR profile: ${profileError.message}`,
      });
      continue;
    }

    const { error: roleError } = await admin.from("user_club_roles").upsert(
      {
        user_id: userId,
        club_id: resolvedClubId!,
        role_id: marshalRoleId,
        is_active: true,
      },
      { onConflict: "user_id,club_id,role_id" }
    );
    if (roleError) {
      created.push({
        email: m.email,
        status: `ERROR rol: ${roleError.message}`,
      });
      continue;
    }

    created.push({ email: m.email, status: existingProfile ? "ya existía, rol OK" : "creado" });
  }

  console.log("Resultado:");
  for (const row of created) {
    console.log(`  ${row.email}: ${row.status}`);
  }
  console.log("\nTelegram: cada marshal escribe al bot:");
  console.log("  /soy_marshal marshal1@listgolf.club");
  console.log("\nWeb: www.listgolf.club/login");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
