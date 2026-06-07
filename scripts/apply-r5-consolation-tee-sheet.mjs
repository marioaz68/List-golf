/**
 * Aplica salidas R5 (07/06/2026) según PDFs:
 * - Consolación MP: MATCH H1 · hoyo 1 · 08:36
 * - Stroke Hombres: CABALLEROS H10 · hoyo 10
 * - Stroke Mujeres: DH10 · hoyo 10
 */
import { createClient } from "@supabase/supabase-js";

const ROUND_ID = "b3d12db1-1265-48b1-ada4-e675ed2dcc96";

const GROUPS = {
  consolMp: "6c5ad768-5131-4bff-a6ba-bc016c655f7a",
  hombres: [
    "a2bdeb9c-20a9-4ee6-864a-0a24a5030fe8", // G3 → 07:30
    "7a91cb4e-500f-467f-81fa-f38972760507", // G4 → 07:42
    "f11ae066-6700-476c-8f6c-c164bf634893", // G5 → 07:54
    "9dba41dc-8ab9-4b8e-b40d-621c05e7b0e8", // G6 → 08:06
  ],
  hombresDelete: "691b0ff7-0e4f-4973-9f2a-7712016f342b", // G7
  mujeres: [
    "d41d101e-61b9-4fdb-aa98-f2e7a29627e9", // G8 → 08:18
    "e42512d0-3eef-41a8-a37d-50668f701487", // G9 → 08:30
    "37905253-420c-4981-9f2b-54bf4f2b11ae", // G10 → 08:42
    "095bbec0-9de2-44f9-b98b-fbfe13fec03d", // G11 → 08:54
  ],
  mujeresDelete: "d9ed1bed-068f-4f13-b8af-abf7eeeb8154", // G12
};

const SCHEDULE = {
  consolMp: { tee: "08:36:00", hole: 1, members: [
    "3d6b5f11-a656-438e-969d-b16a12135d70", // Carolina
    "3bc78f84-b3c8-4d11-9aa7-f6c4b3ef5045", // Diego
    "14679285-3928-4c68-b795-d2cb631c2bc1", // Adriana
    "cb2b7c05-35c5-486b-a803-d8e706912680", // José Alberto
  ]},
  hombres: [
    { tee: "07:30:00", hole: 10, members: [
      "60250b53-f1c9-4a97-b2d9-3dccdb228163", // Mario Álvarez
      "9ff508b9-af4e-481d-9c8e-0ed15cd4317c", // Eduardo Urbiola
      "20132ba6-fd73-45f5-9034-67019b75dbd7", // Arturo De Echavarri
      "381de397-ef64-48aa-a356-563ca850877b", // Mario Ramírez
    ]},
    { tee: "07:42:00", hole: 10, members: [
      "51bad24f-75fb-4d91-b4c1-12dea69cc6f8", // Sergio Borbolla
      "9297dd7a-a509-4bf7-8935-58e9bb3d420b", // Alfonso Suarez
      "7cad7fdb-9668-4ee3-9824-ebe7fb35ab52", // Humberto Urquiza
      "2e033de0-4045-4e19-b8ad-77b38ce183f7", // Gerardo Urquiza
    ]},
    { tee: "07:54:00", hole: 10, members: [
      "860bdd4c-28c8-42f1-b543-30ced329a444", // Mario Urquiza
      "21e5db28-54e2-42e6-8843-b81a550f6ac6", // Samuel Sandoval
      "ac8117bc-5c23-4a02-a402-68f7446d679a", // Faro Niembro
      "d675af78-4d52-466d-b444-53fa956f2c81", // Ruy Trinidad
      "b3357877-7fa0-4391-a50e-5e027ea2c6ca", // Agustín Sañudo
    ]},
    { tee: "08:06:00", hole: 10, members: [
      "d4d83eb5-3e32-4577-8c58-bf399adc1298", // Juan Diego Pimentel
      "4fb4b3e1-6af8-4505-bd07-8962c69de52c", // Regis Bigorgne
      "813c915c-c0cb-4914-95b0-05f8b5a855a8", // Jorge Altamirano
      "a920c02f-9461-497b-bdb8-773894a8d7e5", // Roberto Gutiérrez
      "42d3ff05-b4fe-476b-9dbc-f5fa3245a8d4", // Francisco Maciel
    ]},
  ],
  mujeres: [
    { tee: "08:18:00", hole: 10, members: [
      "ef028c81-d868-4e31-af4f-240c0e02f656", // Yuyes Soto
      "897fc75d-e4e9-4fe1-9f0d-37088ee98d38", // Esther Perrusquia
      "2d9ed060-e2d9-4001-b4b8-663a3c4a3c28", // María Teresa Roiz
      "ed5ff379-b957-47b8-8514-9267debffec8", // Laura Suarez
    ]},
    { tee: "08:30:00", hole: 10, members: [
      "6fc9e793-af04-4cb2-bf48-43b1607ebbc4", // Alejandra Olvera
      "36fb3e21-f8d9-4335-bf65-42947b8d87e6", // Camila de Echavarri
      "2af264cc-555e-454d-a0ce-c21c3ae02dc8", // Cristina Urquiza
      "d8b47f97-e091-4ca4-8c9b-341ebd612227", // Natalia Maciel
      "003e623a-a9a3-4e75-becc-df0b149d4c58", // Diana Perez
    ]},
    { tee: "08:42:00", hole: 10, members: [
      "563132cd-2f42-4bc2-8d72-325ed21e3b1d", // Paulina Septien
      "6d416323-1273-43f3-a32c-225ca8ca5bef", // Lucia Perez Silva
      "5c9f7abf-a78d-47f5-9bd9-f6929ef0597a", // Tere Goyenche
      "3d6f9b94-10df-44f3-b0de-04fbb2975dff", // Cecilia Mosti
      "b53b4d14-de64-422a-8455-bc03db1062f2", // Raquel Marín
    ]},
    { tee: "08:54:00", hole: 10, members: [
      "a4285c53-7381-4d40-ad86-5c8889015d47", // Miriam Rodriguez
      "2a924367-e97c-4c24-9f4a-a09dd6ec9cf7", // Daniela Rivera
      "50b20e46-302c-4f37-a1a3-45508e49936f", // Gabriela Osornio
      "c1d3c5d9-422a-4984-9b36-dd0ac7db45b5", // Erica Garduño
    ]},
  ],
};

async function applyGroup(admin, groupId, { tee, hole, members, notes }) {
  await admin.from("pairing_group_members").delete().eq("group_id", groupId);
  const { error: upErr } = await admin
    .from("pairing_groups")
    .update({ tee_time: tee, starting_hole: hole, ...(notes ? { notes } : {}) })
    .eq("id", groupId);
  if (upErr) throw new Error(`update ${groupId}: ${upErr.message}`);

  const rows = members.map((entry_id, i) => ({
    group_id: groupId,
    entry_id,
    position: i + 1,
  }));
  const { error: insErr } = await admin.from("pairing_group_members").insert(rows);
  if (insErr) throw new Error(`members ${groupId}: ${insErr.message}`);
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Consolación MP
  await applyGroup(admin, GROUPS.consolMp, SCHEDULE.consolMp);
  console.log("✓ Consolación MP G1 → 08:36 hoyo 1");

  // Stroke Hombres
  for (let i = 0; i < GROUPS.hombres.length; i++) {
    await applyGroup(admin, GROUPS.hombres[i], SCHEDULE.hombres[i]);
    console.log(`✓ Stroke Hombres G${i + 3} → ${SCHEDULE.hombres[i].tee} hoyo 10 (${SCHEDULE.hombres[i].members.length} jug.)`);
  }

  // Eliminar G7 vacío
  await admin.from("pairing_group_members").delete().eq("group_id", GROUPS.hombresDelete);
  await admin.from("pairing_groups").delete().eq("id", GROUPS.hombresDelete);
  console.log("✓ Eliminado G7 stroke hombres (consolidado en 4 salidas)");

  // Stroke Mujeres
  for (let i = 0; i < GROUPS.mujeres.length; i++) {
    await applyGroup(admin, GROUPS.mujeres[i], SCHEDULE.mujeres[i]);
    console.log(`✓ Stroke Mujeres G${i + 8} → ${SCHEDULE.mujeres[i].tee} hoyo 10 (${SCHEDULE.mujeres[i].members.length} jug.)`);
  }

  await admin.from("pairing_group_members").delete().eq("group_id", GROUPS.mujeresDelete);
  await admin.from("pairing_groups").delete().eq("id", GROUPS.mujeresDelete);
  console.log("✓ Eliminado G12 stroke mujeres (consolidado en 4 salidas)");

  // Verificación
  const { data: groups } = await admin
    .from("pairing_groups")
    .select("id,group_no,tee_time,starting_hole,notes")
    .eq("round_id", ROUND_ID)
    .order("group_no");
  const consol = (groups ?? []).filter(
    (g) =>
      String(g.notes ?? "").includes("CONSOLACIÓN") ||
      String(g.notes ?? "").includes("STROKE AGREGADO")
  );
  console.log("\n--- Verificación ---");
  for (const g of consol) {
    const { data: mems } = await admin
      .from("pairing_group_members")
      .select("position, tournament_entries(players(first_name,last_name))")
      .eq("group_id", g.id)
      .order("position");
    const names = (mems ?? []).map((m) => {
      const e = m.tournament_entries;
      const p = Array.isArray(e?.players) ? e.players[0] : e?.players;
      return `${m.position}. ${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    });
    console.log(`G${g.group_no} ${g.tee_time?.slice(0, 5)} H${g.starting_hole} · ${g.notes}`);
    names.forEach((n) => console.log("  ", n));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
