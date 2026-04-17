import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import TeeSetsEditor from "./TeeSetsEditor";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type CatalogRow = {
  id: string;
  code: string | null;
  name: string | null;
  color: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type AssignedRow = {
  sort_order: number | null;
  tee_set_catalog_id: string;
};

const buttonStyle: CSSProperties = {
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

const selectStyle: CSSProperties = {
  height: "28px",
  minWidth: "220px",
  borderRadius: "6px",
  border: "1px solid #9ca3af",
  background: "#f3f4f6",
  color: "#111827",
  padding: "0 8px",
  fontSize: "11px",
};

function HeaderBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <HeaderBar title={title} actions={actions} />
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export default async function TeeSetsPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id : "";

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name")
    .order("created_at", { ascending: false });

  const effectiveTournamentId =
    tournamentId || (tournaments && tournaments.length > 0 ? tournaments[0].id : "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/tee-sets?tournament_id=${effectiveTournamentId}`);
  }

  const { data: catalogRaw, error: catalogErr } = await supabase
    .from("tee_set_catalog")
    .select("id, code, name, color, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (catalogErr) {
    throw new Error(catalogErr.message);
  }

  const { data: assignedRaw, error: assignedErr } = effectiveTournamentId
    ? await supabase
        .from("tournament_tee_sets")
        .select("sort_order, tee_set_catalog_id")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (assignedErr) {
    throw new Error(assignedErr.message);
  }

  const assignedMap = new Map<string, number>();
  ((assignedRaw ?? []) as AssignedRow[]).forEach((r) => {
    assignedMap.set(r.tee_set_catalog_id, r.sort_order ?? 999);
  });

  const rows = ((catalogRaw ?? []) as CatalogRow[])
    .map((r, idx) => ({
      id: r.id,
      tournament_id: effectiveTournamentId,
      code: r.code ?? "",
      name: r.name ?? "",
      color: r.color ?? "",
      sort_order: assignedMap.get(r.id) ?? (r.sort_order ?? idx + 1),
      selected: assignedMap.has(r.id),
    }))
    .sort((a, b) => {
      if (a.selected && b.selected) return a.sort_order - b.sort_order;
      if (a.selected && !b.selected) return -1;
      if (!a.selected && b.selected) return 1;
      return a.sort_order - b.sort_order;
    });

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">Salidas</h1>

      <div className="flex flex-wrap gap-1.5">
        <a
          href={`/categories?tournament_id=${effectiveTournamentId}`}
          style={buttonStyle}
        >
          Categorías
        </a>

        <a
          href={`/category-tee-rules?tournament_id=${effectiveTournamentId}`}
          style={buttonStyle}
        >
          Reglas de Salidas
        </a>
      </div>

      <form method="GET" action="/tee-sets" className="space-y-2">
        <HeaderBlock
          title="TORNEO"
          actions={<button style={buttonStyle}>Cambiar</button>}
        >
          <div className="min-w-0">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              style={selectStyle}
              className="w-full"
            >
              {tournaments?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <TeeSetsEditor tournamentId={effectiveTournamentId} rows={rows} />
    </div>
  );
}