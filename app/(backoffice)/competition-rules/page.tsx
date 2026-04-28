import type { CSSProperties, ReactNode } from "react";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import CompetitionRulesEditor from "./CompetitionRulesEditor";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type CompetitionRuleRow = {
  id: string;
  tournament_id: string;
  category_id: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  is_active: boolean;
  notes: string | null;
  updated_at: string | null;
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

export default async function CompetitionRulesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = createAdminClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id : "";

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tournamentsError) throw new Error(tournamentsError.message);

  const tournamentList = (tournaments ?? []) as Tournament[];

  const effectiveTournamentId =
    tournamentId || (tournamentList.length > 0 ? tournamentList[0].id : "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/competition-rules?tournament_id=${effectiveTournamentId}`);
  }

  const { data: categories, error: categoriesError } = effectiveTournamentId
    ? await supabase
        .from("categories")
        .select("id, code, name, sort_order")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true })
    : { data: [], error: null };

  if (categoriesError) throw new Error(categoriesError.message);

  const { data: rules, error: rulesError } = effectiveTournamentId
    ? await supabase
        .from("category_competition_rules")
        .select(
          "id, tournament_id, category_id, scoring_format, leaderboard_basis, prize_basis, handicap_percentage, is_active, notes, updated_at"
        )
        .eq("tournament_id", effectiveTournamentId)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (rulesError) throw new Error(rulesError.message);

  const categoriesList = (categories ?? []) as CategoryRow[];
  const rulesList = (rules ?? []) as CompetitionRuleRow[];

  const editorKey = `${effectiveTournamentId}-${rulesList
    .map((rule) => `${rule.category_id}:${rule.updated_at ?? ""}`)
    .join("|")}`;

  if (!effectiveTournamentId) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold leading-none text-white">
          Reglas de Competencia
        </h1>

        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          No hay torneos creados todavía. Primero crea un torneo para configurar
          reglas de competencia.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">
        Reglas de Competencia
      </h1>

      <div className="flex flex-wrap gap-1.5">
        <a href={`/categories?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Categorías
        </a>
        <a href={`/cut-rules?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Cortes
        </a>
        <a href={`/prize-rules?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Premios
        </a>
        <a href={`/rounds?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Rondas
        </a>
      </div>

      <form method="GET" action="/competition-rules" className="space-y-2">
        <HeaderBlock
          title="TORNEO"
          actions={
            <button type="submit" style={buttonStyle}>
              Cambiar
            </button>
          }
        >
          <div className="min-w-0">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              style={selectStyle}
              className="w-full"
            >
              {tournamentList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <CompetitionRulesEditor
        key={editorKey}
        tournamentId={effectiveTournamentId}
        categories={categoriesList}
        rules={rulesList}
      />
    </div>
  );
}
