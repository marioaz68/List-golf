import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import CutRulesEditor from "./CutRulesEditor";
import HeaderBar from "@/components/ui/HeaderBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
  sort_order: number | null;
};

type TieBreakProfileRow = {
  id: string;
  name: string | null;
  applies_to: "cut" | "trophy" | "general";
};

type CutRuleRow = {
  id: string;
  from_round_no: number;
  to_round_no: number;
  scope_type: "category" | "category_group" | "category_code_list" | "overall";
  scope_value: string;
  ranking_basis:
    | "gross_total"
    | "net_total"
    | "points_total"
    | "gross_round"
    | "net_round"
    | "points_round";
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  advancement_type: "top_n" | "top_percent";
  advancement_value: number;
  include_ties: boolean;
  tie_break_profile_id: string | null;
  sort_order: number | null;
  is_active: boolean;
  notes: string | null;
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

export default async function CutRulesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id : "";
  const saved = typeof sp.saved === "string" ? sp.saved : "";

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tournamentsError) {
    throw new Error(tournamentsError.message);
  }

  const tournamentList = (tournaments ?? []) as Tournament[];

  const effectiveTournamentId =
    tournamentId || (tournamentList.length > 0 ? tournamentList[0].id : "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/cut-rules?tournament_id=${effectiveTournamentId}`);
  }

  const { data: rounds, error: roundsError } = effectiveTournamentId
    ? await supabase
        .from("rounds")
        .select("id, round_no, round_date")
        .eq("tournament_id", effectiveTournamentId)
        .order("round_no", { ascending: true })
    : { data: [], error: null };

  if (roundsError) throw new Error(roundsError.message);

  const { data: categories, error: categoriesError } = effectiveTournamentId
    ? await supabase
        .from("categories")
        .select("id, code, name, sort_order")
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (categoriesError) throw new Error(categoriesError.message);

  const { data: tieBreakProfiles, error: tieBreakProfilesError } =
    effectiveTournamentId
      ? await supabaseAdmin
          .from("tie_break_profiles")
          .select("id, name, applies_to")
          .eq("tournament_id", effectiveTournamentId)
          .eq("is_active", true)
          .in("applies_to", ["cut", "general"])
          .order("name", { ascending: true })
      : { data: [], error: null };

  if (tieBreakProfilesError) throw new Error(tieBreakProfilesError.message);

  const { data: rules, error: rulesError } = effectiveTournamentId
    ? await supabase
        .from("round_advancement_rules")
        .select(
          "id, from_round_no, to_round_no, scope_type, scope_value, ranking_basis, ranking_mode, advancement_type, advancement_value, include_ties, tie_break_profile_id, sort_order, is_active, notes"
        )
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
        .order("from_round_no", { ascending: true })
        .order("to_round_no", { ascending: true })
    : { data: [], error: null };

  if (rulesError) throw new Error(rulesError.message);

  if (!effectiveTournamentId) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold leading-none text-white">
          Reglas de Corte
        </h1>

        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          No hay torneos creados todavía. Primero crea un torneo para configurar
          reglas de corte.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">
        Reglas de Corte
      </h1>

      <div className="flex flex-wrap gap-1.5">
        <a
          href={`/rounds?tournament_id=${effectiveTournamentId}`}
          style={buttonStyle}
        >
          Rondas
        </a>

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

        <a
          href={`/competition-rules?tournament_id=${effectiveTournamentId}`}
          style={buttonStyle}
        >
          Competencia
        </a>

        <a
          href={`/prize-rules?tournament_id=${effectiveTournamentId}`}
          style={buttonStyle}
        >
          Premios
        </a>
      </div>

      <form method="GET" action="/cut-rules" className="space-y-2">
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

      {saved === "1" ? (
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-[11px] font-semibold leading-snug text-green-800">
          Reglas guardadas correctamente.
        </div>
      ) : null}

      <CutRulesEditor
        tournamentId={effectiveTournamentId}
        rounds={(rounds ?? []) as RoundRow[]}
        categories={(categories ?? []) as CategoryRow[]}
        tieBreakProfiles={(tieBreakProfiles ?? []) as TieBreakProfileRow[]}
        rules={(rules ?? []) as CutRuleRow[]}
      />
    </div>
  );
}
