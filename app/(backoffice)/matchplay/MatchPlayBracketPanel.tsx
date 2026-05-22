"use client";

import { roundLabel } from "@/lib/matchplay/bracketUtils";
import type { BracketView } from "@/lib/matchplay/loadBracketView";
import { MATCHPLAY_SEEDING_LABELS } from "@/lib/matchplay/types";
import type { MatchPlayRulesSnapshot } from "@/lib/matchplay/teamTypes";
import {
  deleteMatchPlayBracket,
  generateMatchPlayBracket,
  publishMatchPlayBracket,
} from "./actions";

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "11px",
  cursor: "pointer",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#0891b2, #0e7490)",
  border: "1px solid #155e75",
};

const dangerStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#dc2626, #991b1b)",
  border: "1px solid #7f1d1d",
};

type Props = {
  tournamentId: string;
  teamCount: number;
  rules: MatchPlayRulesSnapshot | null;
  bracket: BracketView | null;
  seedingMethod: string;
  flashStatus?: string | null;
  flashMessage?: string | null;
};

export default function MatchPlayBracketPanel({
  tournamentId,
  teamCount,
  rules,
  bracket,
  seedingMethod,
  flashStatus,
  flashMessage,
}: Props) {
  const bracketSize = (bracket?.config_json?.bracket_size as number) ?? 0;
  const seedLabel =
    MATCHPLAY_SEEDING_LABELS[
      seedingMethod as keyof typeof MATCHPLAY_SEEDING_LABELS
    ] ?? seedingMethod;

  const matchesByRound = bracket
    ? Array.from({ length: bracket.roundCount }, (_, i) => {
        const roundNo = i + 1;
        return {
          roundNo,
          label: roundLabel(roundNo, bracket.roundCount, bracketSize),
          matches: bracket.matches.filter((m) => m.round_no === roundNo),
        };
      })
    : [];

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-[#0f172a] p-3">
      <div>
        <h2 className="text-sm font-bold text-white">Cuadro / Bracket</h2>
        <p className="mt-1 text-[11px] text-slate-400">
          Siembra: <strong className="text-slate-200">{seedLabel}</strong>
          {seedingMethod === "auction"
            ? " — registra postura en cada equipo antes de generar."
            : ""}
          · Draw estándar CCQ: 1-16, 8-9, 4-13, 5-12, 2-15, 7-10, 3-14, 6-11.
        </p>
      </div>

      {flashMessage ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={generateMatchPlayBracket}>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <button
            type="submit"
            style={primaryStyle}
            disabled={teamCount < 2}
            title={teamCount < 2 ? "Mínimo 2 equipos" : undefined}
          >
            {bracket ? "Regenerar cuadro" : "Generar cuadro"}
          </button>
        </form>
        {bracket?.status === "draft" ? (
          <form action={publishMatchPlayBracket}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button type="submit" style={buttonStyle}>
              Publicar cuadro
            </button>
          </form>
        ) : null}
        {bracket ? (
          <form
            action={deleteMatchPlayBracket}
            onSubmit={(e) => {
              if (!confirm("¿Eliminar el cuadro y todos los partidos?")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button type="submit" style={dangerStyle}>
              Eliminar cuadro
            </button>
          </form>
        ) : null}
      </div>

      {bracket ? (
        <>
          <div className="flex flex-wrap gap-3 text-[11px] text-cyan-100">
            <span>
              <strong>Estado:</strong> {bracket.status}
            </span>
            <span>
              <strong>Tamaño:</strong> {bracketSize} plazas
            </span>
            <span>
              <strong>Equipos:</strong>{" "}
              {String(bracket.config_json.team_count ?? teamCount)}
            </span>
            {(bracket.config_json.bye_count as number) > 0 ? (
              <span>
                <strong>BYEs:</strong> {String(bracket.config_json.bye_count)}
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4">
              {matchesByRound.map(({ roundNo, label, matches }) => (
                <div
                  key={roundNo}
                  className="w-[200px] shrink-0 rounded border border-white/10 bg-[#0a1220] p-2"
                >
                  <div className="mb-2 border-b border-white/10 pb-1 text-center text-[11px] font-bold text-cyan-300">
                    {label}
                  </div>
                  <div className="space-y-2">
                    {matches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-slate-500">
          {teamCount < 2
            ? "Forma al menos 2 equipos arriba para generar el cuadro."
            : "Pulsa «Generar cuadro» para crear el draw con siembra automática."}
        </p>
      )}
    </div>
  );
}

function MatchCard({
  match,
}: {
  match: {
    id: string;
    position_no: number;
    top_label: string;
    bottom_label: string;
    status: string;
    result_text: string | null;
    winner_label: string | null;
  };
}) {
  const isBye = match.status === "bye";
  return (
    <div
      className={`rounded border px-1.5 py-1 text-[10px] ${
        isBye
          ? "border-slate-600/50 bg-slate-900/50 text-slate-500"
          : "border-white/15 bg-[#111827] text-slate-200"
      }`}
    >
      <div className="mb-0.5 text-[9px] text-slate-500">M{match.position_no}</div>
      <div
        className={
          match.winner_label === match.top_label
            ? "font-semibold text-green-300"
            : ""
        }
      >
        {match.top_label}
      </div>
      <div className="my-0.5 text-center text-[9px] text-slate-600">vs</div>
      <div
        className={
          match.winner_label === match.bottom_label
            ? "font-semibold text-green-300"
            : ""
        }
      >
        {match.bottom_label}
      </div>
      {match.result_text ? (
        <div className="mt-1 text-center text-[9px] text-amber-400/90">
          {match.result_text}
        </div>
      ) : null}
    </div>
  );
}
