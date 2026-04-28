import type { CSSProperties, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import HeaderBar from "@/components/ui/HeaderBar";
import PrizeRulesEditor from "./PrizeRulesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type PrizeRuleRow = {
  id: string;
  scope_type: "overall" | "category_group" | "category_code_list" | "category";
  scope_value: string;
  prize_label: string;
  prize_position: number;
  ranking_basis: "gross" | "net" | "stableford";
  priority: number;
  unique_winner: boolean;
  show_on_leaderboard: boolean;
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  round_nos: number[] | null;
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

export default async function PrizeRulesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId = typeof sp.tournament_id === "string" ? sp.tournament_id : "";

  const { data: tournaments, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tournamentsError) throw new Error(tournamentsError.message);

  const tournamentList = (tournaments ?? []) as Tournament[];
  const effectiveTournamentId = tournamentId || (tournamentList.length > 0 ? tournamentList[0].id : "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/prize-rules?tournament_id=${effectiveTournamentId}`);
  }

  const { data: rules, error: rulesError } = effectiveTournamentId
    ? await supabase
        .from("category_prize_rules")
        .select(
          "id, scope_type, scope_value, prize_label, prize_position, ranking_basis, priority, unique_winner, show_on_leaderboard, ranking_mode, round_nos, sort_order, is_active, notes"
        )
        .eq("tournament_id", effectiveTournamentId)
        .order("sort_order", { ascending: true })
        .order("priority", { ascending: true })
    : { data: [], error: null };

  if (rulesError) throw new Error(rulesError.message);

  if (!effectiveTournamentId) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold leading-none text-white">Reglas de Premios</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          No hay torneos creados todavía. Primero crea un torneo para configurar premios.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 md:p-3">
      <h1 className="text-lg font-bold leading-none text-white">Reglas de Premios</h1>

      <div className="flex flex-wrap gap-1.5">
        <a href={`/cut-rules?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Reglas de Corte
        </a>
        <a href={`/categories?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Categorías
        </a>
        <a href={`/rounds?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Rondas
        </a>
        <a href={`/leaderboard?tournament_id=${effectiveTournamentId}`} style={buttonStyle}>
          Leaderboard
        </a>
      </div>

      <form method="GET" action="/prize-rules" className="space-y-2">
        <HeaderBlock
          title="TORNEO"
          actions={
            <button type="submit" style={buttonStyle}>
              Cambiar
            </button>
          }
        >
          <div className="min-w-0">
            <select name="tournament_id" defaultValue={effectiveTournamentId} style={selectStyle} className="w-full">
              {tournamentList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </HeaderBlock>
      </form>

      <PrizeRulesEditor tournamentId={effectiveTournamentId} rules={(rules ?? []) as PrizeRuleRow[]} />
    </div>
  );
}
