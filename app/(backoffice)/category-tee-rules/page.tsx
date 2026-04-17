import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CategoryTeeRulesEditor from "./CategoryTeeRulesEditor";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #010103",
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

export default async function CategoryTeeRulesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id : "";

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name")
    .order("created_at", { ascending: false });

  if (tournamentsError) {
    throw new Error(tournamentsError.message);
  }

  const effectiveTournamentId =
    tournamentId || (tournaments && tournaments.length > 0 ? tournaments[0].id : "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/category-tee-rules?tournament_id=${effectiveTournamentId}`);
  }

  const { data: categories, error: categoriesError } = effectiveTournamentId
    ? await supabase
        .from("categories")
        .select("id, code, name, gender, category_group, sort_order")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const { data: teeSets, error: teeSetsError } = effectiveTournamentId
    ? await supabase
        .from("tee_sets")
        .select("id, name, sort_order")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (teeSetsError) {
    throw new Error(teeSetsError.message);
  }

  const categoryIds = (categories ?? []).map((c) => c.id);

  const { data: rules, error: rulesError } =
    categoryIds.length > 0
      ? await supabase
          .from("category_tee_rules")
          .select("*")
          .eq("tournament_id", effectiveTournamentId)
          .in("category_id", categoryIds)
          .order("priority", { ascending: true })
      : { data: [], error: null };

  if (rulesError) {
    throw new Error(rulesError.message);
  }

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">
        Reglas de Salidas por Categoría
      </h1>

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
      </div>

      <form method="GET" action="/category-tee-rules" className="space-y-2">
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

      <CategoryTeeRulesEditor
        tournamentId={effectiveTournamentId}
        categories={categories ?? []}
        teeSets={teeSets ?? []}
        rules={rules ?? []}
      />
    </div>
  );
}