import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PlayersReportClient, {
  type PlayersReportGroup,
  type PlayersReportRow,
} from "./PlayersReportClient";

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };

type RawClub = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type RawPlayer = {
  id: string | number;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  handicap_index: number | null;
  phone: string | null;
  email: string | null;
  birth_year: number | null;
  ghin_number: string | null;
  shirt_size: string | null;
  shoe_size: string | null;
  club_id: string | null;
  clubs: RawClub | RawClub[] | null;
};

function clubLabel(c: RawClub | null | undefined): string {
  if (!c) return "Sin club";
  const v = (c.short_name ?? c.name ?? "").trim();
  return v || "Sin club";
}

function firstClub(
  clubs: RawClub | RawClub[] | null | undefined
): RawClub | null {
  if (!clubs) return null;
  if (Array.isArray(clubs)) return clubs[0] ?? null;
  return clubs;
}

export default async function PlayersReportPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: playersData, error: pErr } = await supabase
    .from("players")
    .select(
      `
        id,
        first_name,
        last_name,
        gender,
        handicap_index,
        phone,
        email,
        birth_year,
        ghin_number,
        shirt_size,
        shoe_size,
        club_id,
        clubs ( id, name, short_name )
      `
    );

  if (pErr) {
    return (
      <div className="space-y-3 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">
          Reporte de jugadores del sistema
        </h1>
        <p className="text-[12px] text-amber-200">
          Error al cargar jugadores: {pErr.message}
        </p>
      </div>
    );
  }

  const players = ((playersData ?? []) as unknown[]).map(
    (p) => p as RawPlayer
  );

  // Group by club
  const byClubId = new Map<string, PlayersReportRow[]>();
  const labelByClubId = new Map<string, string>();

  for (const p of players) {
    const c = firstClub(p.clubs);
    const cid = c?.id ?? "__no_club__";
    const label = c ? clubLabel(c) : "Sin club";
    if (!labelByClubId.has(cid)) labelByClubId.set(cid, label);

    const row: PlayersReportRow = {
      id: String(p.id),
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—",
      ghin: (p.ghin_number ?? "").trim() || null,
      gender: (p.gender ?? "—").toString().toUpperCase(),
      hi:
        p.handicap_index != null && Number.isFinite(Number(p.handicap_index))
          ? Number(p.handicap_index)
          : null,
      birth_year: p.birth_year,
      phone: (p.phone ?? "").trim() || null,
      email: (p.email ?? "").trim() || null,
      shirt_size: (p.shirt_size ?? "").trim() || null,
      shoe_size: (p.shoe_size ?? "").trim() || null,
    };

    const bucket = byClubId.get(cid) ?? [];
    bucket.push(row);
    byClubId.set(cid, bucket);
  }

  const sortRows = (a: PlayersReportRow, b: PlayersReportRow) => {
    const ha = a.hi ?? 999;
    const hb = b.hi ?? 999;
    if (ha !== hb) return ha - hb;
    return a.name.localeCompare(b.name, "es");
  };

  const groups: PlayersReportGroup[] = Array.from(byClubId.entries())
    .map(([id, rows]) => ({
      id,
      label: labelByClubId.get(id) ?? "Sin club",
      rows: rows.slice().sort(sortRows),
    }))
    .sort((a, b) => {
      // "Sin club" al final
      if (a.id === "__no_club__") return 1;
      if (b.id === "__no_club__") return -1;
      return a.label.localeCompare(b.label, "es");
    });

  const title = "Reporte de jugadores del sistema";
  // Use searchParams just to silence lint and keep route reactive
  void sp;

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold leading-none text-white">
            {title}
          </h1>
          <p className="mt-1 text-[11px] text-slate-400">
            {players.length} jugadores en total · agrupados por club
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 text-[11px] print:hidden">
          <a
            href="/reports"
            className="rounded border border-white/15 bg-[#1f2937] px-3 py-1 font-semibold text-white hover:bg-[#2a3447]"
          >
            ← Reportes por torneo
          </a>
          <a
            href="/players"
            className="rounded border border-white/15 bg-[#1f2937] px-3 py-1 font-semibold text-white hover:bg-[#2a3447]"
          >
            Módulo Jugadores
          </a>
        </nav>
      </header>

      <PlayersReportClient groups={groups} title={title} />
    </div>
  );
}
