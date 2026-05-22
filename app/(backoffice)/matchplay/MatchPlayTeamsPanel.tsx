"use client";

import { useMemo, useState } from "react";
import type { MatchPlayEntryRow, MatchPlayRulesSnapshot, MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import {
  createMatchPlayTeam,
  deleteMatchPlayTeam,
  syncIndividualTeamsFromEntries,
  updateMatchPlayTeam,
  updateTeamAuctionBid,
} from "./actions";

const inputClass =
  "w-full min-w-0 rounded border border-white/15 bg-[#0a1220] px-1.5 py-1 text-[11px] text-white";

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
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #166534",
};

const dangerStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#dc2626, #991b1b)",
  border: "1px solid #7f1d1d",
};

type Props = {
  tournamentId: string;
  matchType: "individual" | "pairs";
  rules: MatchPlayRulesSnapshot | null;
  categories: Array<{ id: string; code: string | null; name: string | null }>;
  entries: MatchPlayEntryRow[];
  teams: MatchPlayTeamRow[];
  assignedEntryIds: string[];
  seedingMethod?: string;
  flashStatus?: string | null;
  flashMessage?: string | null;
};

function entryLabel(e: MatchPlayEntryRow) {
  const num = e.player_number != null ? `#${e.player_number} ` : "";
  const g = e.player.gender === "M" ? "M" : e.player.gender === "F" ? "F" : "X";
  return `${num}${formatPlayerName(e.player)} (${g}, HI ${e.effective_hi})`;
}

export default function MatchPlayTeamsPanel({
  tournamentId,
  matchType,
  rules,
  categories,
  entries,
  teams,
  assignedEntryIds,
  seedingMethod = "hi_combined",
  flashStatus,
  flashMessage,
}: Props) {
  const showAuction = seedingMethod === "auction";
  const assignedSet = useMemo(
    () => new Set(assignedEntryIds),
    [assignedEntryIds]
  );

  const unassigned = useMemo(
    () => entries.filter((e) => !assignedSet.has(e.id)),
    [entries, assignedSet]
  );

  const [search, setSearch] = useState("");
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [teamName, setTeamName] = useState("");
  const [seed, setSeed] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  const filteredUnassigned = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return unassigned;
    return unassigned.filter((e) => entryLabel(e).toLowerCase().includes(q));
  }, [unassigned, search]);

  const maxTeams = rules?.max_teams;
  const unitLabel = matchType === "individual" ? "jugadores" : "parejas";

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-[#0f172a] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            Equipos del cuadro ({matchType === "individual" ? "individual" : "parejas"})
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-400">
            Los jugadores se inscriben en{" "}
            <strong className="text-slate-300">Inscripciones</strong> (catálogo{" "}
            <code className="text-cyan-300">players</code>). Aquí formas equipos
            desde esos inscritos.
          </p>
        </div>
        <a href={`/entries?tournament_id=${tournamentId}`} style={buttonStyle}>
          + Inscribir jugadores
        </a>
      </div>

      {flashMessage ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : flashStatus === "warning"
                ? "border border-amber-500/40 bg-amber-950/40 text-amber-100"
                : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Inscritos" value={entries.length} />
        <Stat label={`Equipos (${unitLabel})`} value={teams.length} />
        <Stat label="Sin asignar" value={unassigned.length} />
        <Stat
          label="Límite cuadro"
          value={maxTeams != null ? String(maxTeams) : "Variable"}
        />
      </div>

      {rules?.combined_hi_min != null || rules?.combined_hi_max != null ? (
        <p className="text-[11px] text-cyan-200/90">
          Validación HI combinado:{" "}
          {rules.combined_hi_min ?? "—"} a {rules.combined_hi_max ?? "—"}
          {rules.pair_composition === "mixed_one_each"
            ? " · pareja mixta (1M + 1F)"
            : ""}
        </p>
      ) : null}

      {matchType === "individual" && unassigned.length > 0 ? (
        <form action={syncIndividualTeamsFromEntries}>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <button type="submit" style={primaryStyle}>
            Importar {unassigned.length} inscrito(s) como equipos
          </button>
        </form>
      ) : null}

      {matchType === "individual" && unassigned.length > 0 ? (
        <form action={createMatchPlayTeam} className="flex flex-wrap items-end gap-2 rounded border border-white/10 p-2">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <label className="min-w-[200px] flex-1 text-[11px] text-slate-400">
            Agregar un jugador al cuadro
            <select
              name="player_a_entry_id"
              required
              className={inputClass}
            >
              <option value="">Seleccionar inscrito…</option>
              {unassigned.map((e) => (
                <option key={e.id} value={e.id}>
                  {entryLabel(e)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={buttonStyle}>
            Agregar equipo
          </button>
        </form>
      ) : null}

      {matchType === "pairs" ? (
        <form action={createMatchPlayTeam} className="space-y-2 rounded border border-white/10 p-2">
          <p className="text-[11px] font-semibold text-slate-300">Nueva pareja</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-slate-400">
              Jugador A (inscrito)
              <select
                name="player_a_entry_id"
                required
                className={inputClass}
                value={playerA}
                onChange={(e) => setPlayerA(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {filteredUnassigned.map((e) => (
                  <option key={e.id} value={e.id}>
                    {entryLabel(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Jugador B (inscrito)
              <select
                name="player_b_entry_id"
                required
                className={inputClass}
                value={playerB}
                onChange={(e) => setPlayerB(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {filteredUnassigned
                  .filter((e) => e.id !== playerA)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Nombre equipo (opcional)
              <input
                name="team_name"
                className={inputClass}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ej. Pareja Mixta 12"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              Siembra (opcional)
              <input
                name="seed"
                type="number"
                min={1}
                className={inputClass}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
            {categories.length > 0 ? (
              <label className="text-[11px] text-slate-400 sm:col-span-2">
                Categoría
                <select
                  name="category_id"
                  className={inputClass}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <input
            type="search"
            className={inputClass}
            placeholder="Buscar inscrito sin asignar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <button
            type="submit"
            style={primaryStyle}
            disabled={!playerA || !playerB || unassigned.length < 2}
          >
            Crear pareja
          </button>
        </form>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-[12px] text-amber-200">
          No hay inscritos en este torneo. Ve a Inscripciones y agrega jugadores
          desde el listado actual.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[11px] text-slate-200">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="p-1.5">Seed</th>
              <th className="p-1.5">Equipo</th>
              <th className="p-1.5">Jugadores</th>
              <th className="p-1.5">HI</th>
              {showAuction ? <th className="p-1.5">Subasta</th> : null}
              <th className="p-1.5">Cat.</th>
              <th className="p-1.5" />
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 ? (
              <tr>
                <td colSpan={showAuction ? 7 : 6} className="p-3 text-slate-500">
                  Sin equipos aún.
                </td>
              </tr>
            ) : (
              teams.map((t) => (
                <TeamRow
                  key={t.id}
                  team={t}
                  tournamentId={tournamentId}
                  categories={categories}
                  matchType={matchType}
                  showAuction={showAuction}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {unassigned.length > 0 ? (
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer font-semibold text-slate-300">
            Inscritos sin equipo ({unassigned.length})
          </summary>
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto">
            {unassigned.map((e) => (
              <li key={e.id}>{entryLabel(e)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-white/10 bg-[#0a1220] px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function TeamRow({
  team,
  tournamentId,
  categories,
  matchType,
  showAuction,
}: {
  team: MatchPlayTeamRow;
  tournamentId: string;
  categories: Array<{ id: string; code: string | null; name: string | null }>;
  matchType: "individual" | "pairs";
  showAuction: boolean;
}) {
  const players =
    matchType === "pairs" && team.player_b
      ? `${formatPlayerName(team.player_a?.player ?? {})} + ${formatPlayerName(team.player_b.player)}`
      : formatPlayerName(team.player_a?.player ?? {});

  const cat =
    categories.find((c) => c.id === team.category_id)?.code ??
    team.player_a?.category_code ??
    "—";

  return (
    <tr className="border-b border-white/5">
      <td className="p-1.5">
        <form action={updateMatchPlayTeam} className="flex gap-1">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="team_id" value={team.id} />
          <input type="hidden" name="team_name" value={team.team_name ?? ""} />
          <input type="hidden" name="category_id" value={team.category_id ?? ""} />
          <input
            name="seed"
            type="number"
            className={inputClass}
            style={{ width: 56 }}
            defaultValue={team.seed ?? ""}
          />
          <button type="submit" style={buttonStyle} title="Guardar seed">
            ✓
          </button>
        </form>
      </td>
      <td className="p-1.5 font-medium">{team.team_name ?? "—"}</td>
      <td className="p-1.5">{players}</td>
      <td className="p-1.5">{team.combined_hi ?? "—"}</td>
      {showAuction ? (
        <td className="p-1.5">
          <form action={updateTeamAuctionBid} className="flex gap-1">
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input type="hidden" name="team_id" value={team.id} />
            <input
              name="auction_bid"
              type="number"
              step="1000"
              className={inputClass}
              style={{ width: 88 }}
              placeholder="MXN"
              defaultValue={team.auction_bid ?? ""}
            />
            <button type="submit" style={buttonStyle} title="Guardar postura">
              $
            </button>
          </form>
        </td>
      ) : null}
      <td className="p-1.5">{cat}</td>
      <td className="p-1.5">
        <form action={deleteMatchPlayTeam}>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="team_id" value={team.id} />
          <button type="submit" style={dangerStyle}>
            Quitar
          </button>
        </form>
      </td>
    </tr>
  );
}
