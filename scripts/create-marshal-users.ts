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
/**
 * scope=club  → user_club_roles (marshal ve todos los torneos del club).
 * scope=tournament → user_tournament_roles (solo este torneo).
 * Si no se especifica: club si hay --club-id, tournament si solo hay --tournament-id.
 */
const scopeArg = arg("scope")?.toLowerCase() as
  | "club"
  | "tournament"
  | null
  | undefined;
const password = arg("password") ?? "Marshal2026!";

const MARSHALS = [
  { first: "Marshal", last: "Uno", email: "marshal1@listgolf.club" },
  { first: "Marshal", last: "Dos", email: "marshal2@listgolf.club" },
  { first: "Marshal", last: "Tres", email: "marshal3@listgolf.club" },
  { first: "Marshal", last: "Cuatro", email: "marshal4@listgolf.club" },
  { first: "Marshal", last: "Cinco", email: "marshal5@listgolf.club" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMarshalRole(admin: any) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMarshalRoleId(admin: any) {
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
      "Uso:\n" +
        "  npx tsx scripts/create-marshal-users.ts --club-id=<uuid>\n" +
        "  npx tsx scripts/create-marshal-users.ts --tournament-id=<uuid>             # scope=tournament por defecto\n" +
        "  npx tsx scripts/create-marshal-users.ts --tournament-id=<uuid> --scope=club\n" +
        "  npx tsx scripts/create-marshal-users.ts --list-clubs"
    );
    process.exit(1);
  }

  // Determinar scope efectivo.
  // - Si pasa --scope=tournament: asignar a user_tournament_roles.
  // - Si pasa --scope=club: asignar a user_club_roles (necesita resolver el club).
  // - Si no pasa --scope:
  //     - --club-id → club
  //     - solo --tournament-id → tournament
  const effectiveScope: "club" | "tournament" =
    scopeArg ?? (clubId ? "club" : "tournament");

  if (effectiveScope === "tournament" && !tournamentId) {
    throw new Error("Scope 'tournament' requiere --tournament-id");
  }

  let resolvedClubId = clubId;
  let tournamentName: string | null = null;

  if (tournamentId) {
    const { data: t, error: tErr } = await admin
      .from("tournaments")
      .select("id, name, club_id")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr || !t) {
      throw new Error("Torneo no encontrado.");
    }
    tournamentName = (t.name as string | null) ?? null;
    if (!resolvedClubId && effectiveScope === "club") {
      if (!t.club_id) {
        throw new Error("Scope 'club' pero el torneo no tiene club_id.");
      }
      resolvedClubId = t.club_id as string;
    }
  }

  await ensureMarshalRole(admin);
  const marshalRoleId = await getMarshalRoleId(admin);

  let clubName: string | null = null;
  if (effectiveScope === "club") {
    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .select("id, name")
      .eq("id", resolvedClubId!)
      .maybeSingle();
    if (clubErr || !club) throw new Error("Club no encontrado.");
    clubName = club.name as string | null;
  }

  console.log(`Scope: ${effectiveScope}`);
  if (tournamentName) console.log(`Torneo: ${tournamentName}`);
  if (clubName) console.log(`Club: ${clubName} (${resolvedClubId})`);
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

    const roleAssign =
      effectiveScope === "club"
        ? await admin.from("user_club_roles").upsert(
            {
              user_id: userId,
              club_id: resolvedClubId!,
              role_id: marshalRoleId,
              is_active: true,
            },
            { onConflict: "user_id,club_id,role_id" }
          )
        : await admin.from("user_tournament_roles").upsert(
            {
              user_id: userId,
              tournament_id: tournamentId!,
              role_id: marshalRoleId,
              is_active: true,
            },
            { onConflict: "user_id,tournament_id,role_id" }
          );

    if (roleAssign.error) {
      created.push({
        email: m.email,
        status: `ERROR rol (${effectiveScope}): ${roleAssign.error.message}`,
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
