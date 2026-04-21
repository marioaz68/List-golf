import { createClient } from "@/utils/supabase/server";
import PlayerRowActions from "@/components/PlayerRowActions";
import NewPlayerSection from "./NewPlayerSection";
import { unstable_noStore as noStore } from "next/cache";
import { assignTeeSet } from "@/lib/tee-assignment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type Category = {
  id: string;
  tournament_id: string;
  gender: "M" | "F" | "X";
  code: string;
  name: string;
  handicap_min: number;
  handicap_max: number;
  handicap_percent_override: number | null;
  allow_multiple_prizes_per_player: boolean;
  default_prize_count: number | null;
};

type TeeSet = {
  id: string;
  code: string;
  name: string;
};

type TeeRule = {
  id: string;
  category_id: string;
  tee_set_id: string;
  priority: number;
  age_min: number | null;
  age_max: number | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
};

type ClubRef = {
  name: string | null;
  short_name: string | null;
};

type Player = {
  id: number | string;
  first_name: string | null;
  last_name: string | null;
  initials: string | null;
  gender: "M" | "F" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club_id: string | null;
  clubs: ClubRef[] | null;
  birth_year: number | null;
  ghin_number: string | null;
  shirt_size: string | null;
  shoe_size: string | number | null;
};

type PlayerWithCategory = Player & {
  categoryLabel: string;
  categorySortKey: number;
  teeLabel: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  lineHeight: 1,
  textDecoration: "none",
  boxShadow: "0 3px 0 #1f2937, 0 4px 8px rgba(0,0,0,0.22)",
  whiteSpace: "nowrap",
};

function normalizeName(p: Player) {
  const fn = (p.first_name ?? "").trim();
  const ln = (p.last_name ?? "").trim();
  return `${ln} ${fn}`.trim().toLowerCase();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeGender(g: unknown): "M" | "F" {
  return g === "F" ? "F" : "M";
}

function categoryForPlayer(
  categories: Category[],
  playerGender: "M" | "F",
  hcp: number | null
) {
  if (hcp === null || !Number.isFinite(hcp)) return null;

  const relevant = categories.filter(
    (c) => c.gender === playerGender || c.gender === "X"
  );

  return (
    relevant.find((c) => hcp >= c.handicap_min && hcp <= c.handicap_max) ?? null
  );
}

function clubLabelFromClub(clubs: ClubRef[] | null | undefined) {
  const club = Array.isArray(clubs) ? (clubs[0] ?? null) : null;
  const v = (club?.short_name ?? club?.name ?? "").trim();
  return v || "—";
}

function findPreferredTournament(tournaments: Tournament[]) {
  const preferred = tournaments.find((t) =>
    normalizeText(t.name).includes("torneo prueba 2")
  );

  return preferred ?? tournaments[0] ?? null;
}

function displayCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

export default async function PlayersPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  noStore();
  const supabase = await createClient();

  const sp = props.searchParams ? await props.searchParams : {};

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "handicap";
  const cat = typeof sp.cat === "string" ? sp.cat.trim().toUpperCase() : "";
  const genderFilter =
    typeof sp.gender === "string" ? sp.gender.trim().toUpperCase() : "ALL";

  const tournamentIdParam =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { data: tData, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (tErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-lg font-bold leading-none">Players</h1>
        <p className="text-sm text-red-600">Error torneos: {tErr.message}</p>
      </div>
    );
  }

  const tournaments: Tournament[] = (tData ?? []) as Tournament[];
  const preferredTournament = findPreferredTournament(tournaments);

  const effectiveTournamentId =
    tournamentIdParam || preferredTournament?.id || "";

  const tournamentLabel = (t: Tournament) =>
    (t.name ?? "").trim() || `Torneo ${t.id.slice(0, 8)}`;

  const { data: catData, error: catErr } = effectiveTournamentId
    ? await supabase
        .from("categories")
        .select(
          "id, tournament_id, gender, code, name, handicap_min, handicap_max, handicap_percent_override, allow_multiple_prizes_per_player, default_prize_count"
        )
        .eq("tournament_id", effectiveTournamentId)
        .order("gender", { ascending: true })
        .order("handicap_min", { ascending: true })
        .order("code", { ascending: true })
    : { data: [], error: null };

  if (catErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-lg font-bold leading-none">Players</h1>
        <p className="text-sm text-red-600">Error categorías: {catErr.message}</p>
      </div>
    );
  }

  const categories: Category[] = (catData ?? []).map((c: any) => ({
    ...c,
    tournament_id: String(c.tournament_id),
    gender: String(c.gender ?? "X").toUpperCase() as "M" | "F" | "X",
    code: String(c.code ?? "").toUpperCase(),
    name: String(c.name ?? ""),
    handicap_min: Number(c.handicap_min),
    handicap_max: Number(c.handicap_max),
    handicap_percent_override:
      c.handicap_percent_override === null
        ? null
        : Number(c.handicap_percent_override),
    default_prize_count:
      c.default_prize_count === null ? null : Number(c.default_prize_count),
  }));

  const { data: teeSetsData, error: teeSetsErr } = effectiveTournamentId
    ? await supabase
        .from("tee_sets")
        .select("id, code, name")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true })
    : { data: [], error: null };

  if (teeSetsErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-lg font-bold leading-none">Players</h1>
        <p className="text-sm text-red-600">Error salidas: {teeSetsErr.message}</p>
      </div>
    );
  }

  const teeSets: TeeSet[] = (teeSetsData ?? []).map((t: any) => ({
    id: String(t.id),
    code: String(t.code ?? "").toUpperCase(),
    name: String(t.name ?? ""),
  }));

  const categoryIds = categories.map((c) => c.id);

  const { data: rulesData, error: rulesErr } =
    categoryIds.length > 0
      ? await supabase
          .from("category_tee_rules")
          .select(
            "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
          )
          .in("category_id", categoryIds)
          .order("priority", { ascending: true })
      : { data: [], error: null };

  if (rulesErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-lg font-bold leading-none">Players</h1>
        <p className="text-sm text-red-600">
          Error reglas de salidas: {rulesErr.message}
        </p>
      </div>
    );
  }

  const teeRules: TeeRule[] = (rulesData ?? []).map((r: any) => ({
    id: String(r.id),
    category_id: String(r.category_id),
    tee_set_id: String(r.tee_set_id),
    priority: Number(r.priority ?? 999),
    age_min: r.age_min === null ? null : Number(r.age_min),
    age_max: r.age_max === null ? null : Number(r.age_max),
    gender:
      r.gender === null
        ? null
        : (String(r.gender).toUpperCase() as "M" | "F" | "X"),
    handicap_min: r.handicap_min === null ? null : Number(r.handicap_min),
    handicap_max: r.handicap_max === null ? null : Number(r.handicap_max),
  }));

  const categoriesForFilter =
    genderFilter === "M" || genderFilter === "F"
      ? categories.filter((c) => c.gender === genderFilter || c.gender === "X")
      : categories;

  const selectedCat = cat
    ? categoriesForFilter.find((c) => c.code === cat) ?? null
    : null;

  let playersQuery = supabase.from("players").select(`
      id,
      first_name,
      last_name,
      initials,
      gender,
      handicap_index,
      handicap_torneo,
      phone,
      email,
      birth_year,
      ghin_number,
      shirt_size,
      shoe_size,
      club_id,
      clubs:clubs (
        name,
        short_name
      )
    `);

  if (q) {
    playersQuery = playersQuery.or(
      [
        `first_name.ilike.%${q}%`,
        `last_name.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        `initials.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `ghin_number.ilike.%${q}%`,
      ].join(",")
    );
  }

  if (genderFilter === "M" || genderFilter === "F") {
    playersQuery = playersQuery.eq("gender", genderFilter);
  }

  if (selectedCat) {
    playersQuery = playersQuery
      .gte("handicap_index", selectedCat.handicap_min)
      .lte("handicap_index", selectedCat.handicap_max);
  }

  const { data: playersData, error: playersErr } = await playersQuery;

  if (playersErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-lg font-bold leading-none">Players</h1>
        <p className="text-sm text-red-600">Error players: {playersErr.message}</p>
      </div>
    );
  }

  const players = (playersData ?? []) as unknown as Player[];

  const playersWithCategory: PlayerWithCategory[] = players.map((p) => {
    const g = normalizeGender(p.gender);
    const catObj = categoryForPlayer(categories, g, p.handicap_index);

    const categorySortKey = catObj ? catObj.handicap_min : 999999;
    const categoryLabel = catObj ? `${catObj.code} - ${catObj.name}` : "—";

    const tee = catObj
      ? assignTeeSet(
          {
            id: String(p.id),
            gender: g,
            handicap_index: Number(p.handicap_index ?? 0),
            birth_year: p.birth_year,
            category_id: catObj.id,
          },
          teeRules,
          teeSets
        )
      : null;

    const teeLabel = tee ? `${tee.code} - ${tee.name}` : "—";

    return {
      ...p,
      categoryLabel,
      categorySortKey,
      teeLabel,
      gender: g,
    };
  });

  const sorted = [...playersWithCategory].sort((a, b) => {
    if (sort === "name") {
      return normalizeName(a).localeCompare(normalizeName(b));
    }

    if (sort === "category") {
      const d1 = a.categorySortKey - b.categorySortKey;
      if (d1 !== 0) return d1;

      const ha = a.handicap_index ?? 999999;
      const hb = b.handicap_index ?? 999999;
      const d2 = ha - hb;
      if (d2 !== 0) return d2;

      return normalizeName(a).localeCompare(normalizeName(b));
    }

    const ha = a.handicap_index ?? 999999;
    const hb = b.handicap_index ?? 999999;
    const d = ha - hb;
    if (d !== 0) return d;

    return normalizeName(a).localeCompare(normalizeName(b));
  });

  const genderLabel = (g: "M" | "F") => (g === "M" ? "Caballeros" : "Damas");
  const inputClass =
    "h-7 rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-none text-black";

  return (
    <div className="space-y-2 p-2 md:p-3">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-none text-white">Players</h1>
          <p className="mt-1 text-[11px] leading-snug text-white/90">
            Mostrando {sorted.length} jugadores {q ? `(búsqueda: "${q}")` : ""}
            {effectiveTournamentId
              ? ` (torneo: ${effectiveTournamentId.slice(0, 8)})`
              : ""}
            {genderFilter !== "ALL"
              ? ` (${genderFilter === "M" ? "Caballeros" : "Damas"})`
              : ""}
            {selectedCat ? ` (categoría: ${selectedCat.code})` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <form action="/players" method="GET" className="flex flex-wrap gap-1.5">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className={inputClass}
            >
              {tournaments.length === 0 ? (
                <option value="">Sin torneos</option>
              ) : (
                tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tournamentLabel(t)}
                  </option>
                ))
              )}
            </select>

            <select
              name="gender"
              defaultValue={genderFilter}
              className={inputClass}
            >
              <option value="ALL">Género: Todos</option>
              <option value="M">Género: Caballeros</option>
              <option value="F">Género: Damas</option>
            </select>

            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar..."
              className={`${inputClass} min-w-[120px]`}
            />

            <select name="cat" defaultValue={cat} className={inputClass}>
              <option value="">Todas las categorías</option>
              {categoriesForFilter.map((c) => (
                <option key={c.id} value={c.code}>
                  [{c.gender}] {c.code} - {c.name}
                </option>
              ))}
            </select>

            <select name="sort" defaultValue={sort} className={inputClass}>
              <option value="handicap">Orden: Handicap</option>
              <option value="name">Orden: Nombre</option>
              <option value="category">Orden: Categoría</option>
            </select>

            <button style={buttonStyle}>Aplicar</button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            <a
              href={`/categories?tournament_id=${effectiveTournamentId}`}
              style={buttonStyle}
            >
              Categorías
            </a>

            <a
              href={`/tee-sets?tournament_id=${effectiveTournamentId}`}
              style={buttonStyle}
            >
              Salidas
            </a>

            <a
              href={`/category-tee-rules?tournament_id=${effectiveTournamentId}`}
              style={buttonStyle}
            >
              Reglas de Salidas
            </a>
          </div>
        </div>
      </header>

      <NewPlayerSection />

      <section className="overflow-auto rounded-lg border border-gray-300 bg-white/95 p-1.5 shadow-sm">
        <table className="min-w-[1900px] w-full border-collapse text-[11px] leading-none">
          <thead>
            <tr className="bg-gray-200 text-left text-gray-900">
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Nombre
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Iniciales
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Género
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Handicap
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Año Nac.
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Categoría
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Salida
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Teléfono
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                GHIN
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Talla Playera
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Talla Zapatos
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Club
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Email
              </th>
              <th className="border border-gray-300 px-1.5 py-1 font-semibold">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((p) => {
              const club = Array.isArray(p.clubs) ? (p.clubs[0] ?? null) : null;

              return (
                <tr key={String(p.id)} className="bg-white">
                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.initials)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {genderLabel(normalizeGender(p.gender))}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.handicap_index)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.birth_year)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.categoryLabel)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.teeLabel)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.phone)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.ghin_number)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.shirt_size)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.shoe_size)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {clubLabelFromClub(p.clubs)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    {displayCell(p.email)}
                  </td>

                  <td className="border border-gray-300 px-1.5 py-[3px] text-black">
                    <PlayerRowActions
                      player={{
                        id: String(p.id),
                        first_name: p.first_name,
                        last_name: p.last_name,
                        initials: p.initials,
                        gender: p.gender,
                        handicap_index: p.handicap_index,
                        handicap_torneo: p.handicap_torneo,
                        phone: p.phone,
                        email: p.email,
                        club: club?.name ?? null,
                        club_id: p.club_id ?? null,
                        shirt_size:
                          p.shirt_size == null ? null : String(p.shirt_size),
                        shoe_size:
                          p.shoe_size == null ? null : String(p.shoe_size),
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {sorted.length === 0 ? (
              <tr>
                <td
                  className="border border-gray-300 px-2 py-2 text-[11px] text-black"
                  colSpan={14}
                >
                  Sin resultados
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}