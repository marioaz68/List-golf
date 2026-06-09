"use client";

import {
  useState,
  useTransition,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  addPlayerToSalida,
  removePlayerFromSalida,
  assignCaddieToSalida,
  removeCaddieFromSalida,
  startAndNotifySalida,
} from "../actions";

export type SalidaPlayer = {
  memberId: string;
  entryId: string;
  playerId: string;
  name: string;
  handicapIndex: number | null;
  hasTelegram: boolean;
  caddieId: string | null;
  caddieName: string | null;
  caddieLinked: boolean;
};

export type SalidaRow = {
  groupId: string;
  groupNo: number | null;
  teeTime: string | null;
  startingHole: number | null;
  notes: string | null;
  startedAt: string | null;
  players: SalidaPlayer[];
};

type PlayerSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
};

type CaddieSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
};

function fmtHi(hi: number | null): string {
  if (hi == null) return "S/H";
  return Number(hi).toFixed(1);
}

export default function SalidasClient({
  tournamentId,
  tournamentName,
  roundId,
  roundDate,
  groupSize,
  clubId,
  salidas,
}: {
  tournamentId: string;
  tournamentName: string;
  roundId: string;
  roundDate: string | null;
  groupSize: number;
  clubId: string | null;
  salidas: SalidaRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [onlyWithPlayers, setOnlyWithPlayers] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const occupied = salidas.filter((s) => s.players.length > 0).length;
  const totalPlayers = salidas.reduce((a, s) => a + s.players.length, 0);

  const visible = onlyWithPlayers
    ? salidas.filter((s) => s.players.length > 0)
    : salidas;

  // Agrupar por banda (texto antes de "·" en notes), ej. "Mañana", "Mediodía".
  const bands = useMemo(() => {
    const map = new Map<string, SalidaRow[]>();
    for (const s of visible) {
      const band =
        (s.notes ?? "").split("·")[0].trim() ||
        (s.teeTime && s.teeTime < "11:00" ? "Mañana" : "Mediodía");
      const arr = map.get(band) ?? [];
      arr.push(s);
      map.set(band, arr);
    }
    return Array.from(map.entries());
  }, [visible]);

  const showFlash = useCallback((kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 5000);
  }, []);

  const handleAdd = (groupId: string, playerId: string) => {
    startTransition(async () => {
      const res = await addPlayerToSalida({ tournamentId, groupId, playerId });
      if (!res.ok) return showFlash("err", res.error ?? "No se pudo agregar.");
      router.refresh();
    });
  };

  const handleRemove = (memberId: string) => {
    startTransition(async () => {
      const res = await removePlayerFromSalida({ tournamentId, memberId });
      if (!res.ok) return showFlash("err", res.error ?? "No se pudo quitar.");
      router.refresh();
    });
  };

  const handleAssignCaddie = (
    groupId: string,
    entryId: string,
    caddieId: string
  ) => {
    startTransition(async () => {
      const res = await assignCaddieToSalida({
        tournamentId,
        roundId,
        groupId,
        entryId,
        caddieId,
      });
      if (!res.ok) return showFlash("err", res.error ?? "No se pudo asignar caddie.");
      router.refresh();
    });
  };

  const handleRemoveCaddie = (entryId: string) => {
    startTransition(async () => {
      const res = await removeCaddieFromSalida({
        tournamentId,
        roundId,
        entryId,
      });
      if (!res.ok) return showFlash("err", res.error ?? "No se pudo quitar caddie.");
      router.refresh();
    });
  };

  const handleStart = (groupId: string) => {
    startTransition(async () => {
      const res = await startAndNotifySalida({ tournamentId, roundId, groupId });
      if (!res.ok) return showFlash("err", res.error ?? "No se pudo avisar.");
      const sent = res.sent ?? 0;
      const failed = res.failed ?? 0;
      const skipped = res.skipped ?? 0;
      const parts = [`${sent} aviso(s) enviado(s)`];
      if (failed) parts.push(`${failed} fallido(s)`);
      if (skipped) parts.push(`${skipped} sin Telegram`);
      showFlash("ok", `Telegram enviado · ${parts.join(" · ")}`);
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3">
          <Link
            href="/rondas-diarias"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            ← Rondas diarias
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            {tournamentName}
          </h1>
          <p className="text-sm text-slate-500">
            {roundDate ? `${roundDate} · ` : ""}
            {totalPlayers} jugadores en {occupied} salida(s)
          </p>
        </div>

        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 ring-1 ring-emerald-200">
          Agenda de salidas. Toca una hora para agregar jugadores y caddies.
          Cuando esté lista, <strong>Avisar Telegram</strong> manda el link de
          captura. Todo se guarda al instante.
        </div>

        {flash && (
          <div
            className={`mb-3 rounded-lg p-3 text-sm ring-1 ${
              flash.kind === "ok"
                ? "bg-emerald-600 text-white ring-emerald-700"
                : "bg-red-600 text-white ring-red-700"
            }`}
          >
            {flash.text}
          </div>
        )}

        {!roundId && (
          <div className="rounded-lg bg-white p-6 text-sm text-red-600 shadow ring-1 ring-slate-200">
            Esta ronda no tiene salidas configuradas. Vuelve a crear la ronda
            del día desde el panel.
          </div>
        )}

        {roundId && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {visible.length} de {salidas.length} horas
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyWithPlayers}
                  onChange={(e) => setOnlyWithPlayers(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Solo salidas con jugadores
              </label>
            </div>

            <div className="space-y-4">
              {bands.map(([band, rows]) => (
                <div key={band}>
                  <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {band}
                  </div>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
                    {rows.map((s) => (
                      <SalidaItem
                        key={s.groupId}
                        salida={s}
                        groupSize={groupSize}
                        clubId={clubId}
                        busy={pending}
                        open={openId === s.groupId}
                        onToggle={() =>
                          setOpenId((cur) =>
                            cur === s.groupId ? null : s.groupId
                          )
                        }
                        onAdd={handleAdd}
                        onRemove={handleRemove}
                        onAssignCaddie={handleAssignCaddie}
                        onRemoveCaddie={handleRemoveCaddie}
                        onStart={handleStart}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow ring-1 ring-slate-200">
                  No hay salidas para mostrar.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SalidaItem({
  salida,
  groupSize,
  clubId,
  busy,
  open,
  onToggle,
  onAdd,
  onRemove,
  onAssignCaddie,
  onRemoveCaddie,
  onStart,
}: {
  salida: SalidaRow;
  groupSize: number;
  clubId: string | null;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onAdd: (groupId: string, playerId: string) => void;
  onRemove: (memberId: string) => void;
  onAssignCaddie: (groupId: string, entryId: string, caddieId: string) => void;
  onRemoveCaddie: (entryId: string) => void;
  onStart: (groupId: string) => void;
}) {
  const started = Boolean(salida.startedAt);
  const count = salida.players.length;
  const full = count >= groupSize;

  return (
    <div className={started ? "bg-emerald-50/40" : ""}>
      {/* Fila resumen (agenda) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <span className="w-12 shrink-0 text-base font-bold text-slate-900">
          {salida.teeTime ?? "--:--"}
        </span>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          H{salida.startingHole ?? "?"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {count === 0 ? (
            <span className="italic text-slate-300">Libre</span>
          ) : (
            salida.players.map((p) => p.name.split(" ")[0]).join(", ")
          )}
        </span>
        {started && (
          <span className="shrink-0 text-[10px] font-bold text-emerald-600">
            ● EN JUEGO
          </span>
        )}
        <span className="shrink-0 text-xs font-semibold text-slate-400">
          {count}/{groupSize}
        </span>
        <span className="shrink-0 text-slate-300">{open ? "▴" : "▾"}</span>
      </button>

      {/* Panel expandido */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
          <div className="space-y-2">
            {salida.players.length === 0 && (
              <p className="text-xs italic text-slate-400">
                Sin jugadores en esta salida.
              </p>
            )}
            {salida.players.map((p, idx) => (
              <PlayerRow
                key={p.memberId}
                player={p}
                idx={idx}
                groupId={salida.groupId}
                clubId={clubId}
                busy={busy}
                onRemove={onRemove}
                onAssignCaddie={onAssignCaddie}
                onRemoveCaddie={onRemoveCaddie}
              />
            ))}
          </div>

          {!full ? (
            <PlayerSearch
              groupId={salida.groupId}
              existingPlayerIds={salida.players.map((p) => p.playerId)}
              busy={busy}
              onAdd={onAdd}
            />
          ) : (
            <p className="mt-2 text-xs text-amber-600">
              Salida completa ({groupSize}).
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={busy || count === 0}
              onClick={() => onStart(salida.groupId)}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {started ? "Reenviar Telegram" : "Avisar Telegram"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  idx,
  groupId,
  clubId,
  busy,
  onRemove,
  onAssignCaddie,
  onRemoveCaddie,
}: {
  player: SalidaPlayer;
  idx: number;
  groupId: string;
  clubId: string | null;
  busy: boolean;
  onRemove: (memberId: string) => void;
  onAssignCaddie: (groupId: string, entryId: string, caddieId: string) => void;
  onRemoveCaddie: (entryId: string) => void;
}) {
  const [showCaddie, setShowCaddie] = useState(false);

  return (
    <div className="rounded-md bg-white px-2.5 py-2 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
          <span className="w-4 text-right text-xs text-slate-400">
            {idx + 1}
          </span>
          <span className="truncate font-medium">{player.name}</span>
          <span className="shrink-0 text-xs text-slate-500">
            HI {fmtHi(player.handicapIndex)}
          </span>
          <span
            title={
              player.hasTelegram ? "Recibirá Telegram" : "Sin Telegram vinculado"
            }
            className={`shrink-0 text-xs ${
              player.hasTelegram ? "text-sky-500" : "text-slate-300"
            }`}
          >
            ✈
          </span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(player.memberId)}
          className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          Quitar
        </button>
      </div>

      {/* Caddie */}
      <div className="mt-1.5 flex items-center gap-2 pl-6">
        <span className="text-[11px] font-semibold uppercase text-slate-400">
          Caddie
        </span>
        {player.caddieName ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {player.caddieName}
            <span
              title={
                player.caddieLinked
                  ? "Recibirá Telegram"
                  : "Caddie sin Telegram vinculado"
              }
              className={
                player.caddieLinked ? "text-sky-500" : "text-slate-300"
              }
            >
              ✈
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemoveCaddie(player.entryId)}
              className="text-indigo-400 hover:text-indigo-700"
              title="Quitar caddie"
            >
              ✕
            </button>
          </span>
        ) : showCaddie ? (
          <CaddieSearch
            clubId={clubId}
            busy={busy}
            onPick={(caddieId) => {
              onAssignCaddie(groupId, player.entryId, caddieId);
              setShowCaddie(false);
            }}
            onCancel={() => setShowCaddie(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowCaddie(true)}
            className="rounded border border-dashed border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            + asignar caddie
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerSearch({
  groupId,
  existingPlayerIds,
  busy,
  onAdd,
}: {
  groupId: string;
  existingPlayerIds: string[];
  busy: boolean;
  onAdd: (groupId: string, playerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const existing = new Set(existingPlayerIds);

  const runSearch = useCallback((raw: string) => {
    const q = raw.replace(/[%,]/g, "").trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    setOpen(true);
    void (async () => {
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name, handicap_index")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order("last_name", { ascending: true })
        .limit(15);
      setResults((data ?? []) as PlayerSearchResult[]);
      setSearching(false);
    })();
  }, []);

  const onChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(v), 250);
  };

  return (
    <div className="relative mt-2">
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder="Agregar jugador por nombre…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {searching && (
            <div className="px-3 py-2 text-xs text-slate-400">Buscando…</div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">
              Sin resultados.
            </div>
          )}
          {results.map((r) => {
            const already = existing.has(r.id);
            const name =
              [r.first_name, r.last_name].filter(Boolean).join(" ") ||
              "(sin nombre)";
            return (
              <button
                key={r.id}
                type="button"
                disabled={already || busy}
                onClick={() => {
                  onAdd(groupId, r.id);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 disabled:opacity-40"
              >
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {already ? "ya está" : `HI ${fmtHi(r.handicap_index)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CaddieSearch({
  clubId,
  busy,
  onPick,
  onCancel,
}: {
  clubId: string | null;
  busy: boolean;
  onPick: (caddieId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaddieSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(
    (raw: string) => {
      const q = raw.replace(/[%,]/g, "").trim();
      setSearching(true);
      void (async () => {
        let qb = supabase
          .from("caddies")
          .select("id, first_name, last_name, nickname")
          .eq("is_active", true);
        if (clubId) qb = qb.eq("club_id", clubId);
        if (q.length >= 1) {
          qb = qb.or(
            `first_name.ilike.%${q}%,last_name.ilike.%${q}%,nickname.ilike.%${q}%`
          );
        }
        const { data } = await qb
          .order("first_name", { ascending: true })
          .limit(15);
        setResults((data ?? []) as CaddieSearchResult[]);
        setSearching(false);
      })();
    },
    [clubId]
  );

  // Cargar lista inicial al montar.
  useEffect(() => {
    runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(v), 250);
  };

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar caddie…"
          className="w-full rounded-md border border-indigo-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-1 text-xs text-slate-400 hover:text-slate-700"
        >
          cancelar
        </button>
      </div>
      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
        {searching && (
          <div className="px-3 py-2 text-xs text-slate-400">Buscando…</div>
        )}
        {!searching && results.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-400">Sin caddies.</div>
        )}
        {results.map((c) => {
          const name =
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.nickname ||
            "Caddie";
          return (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(c.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-indigo-50 disabled:opacity-40"
            >
              <span className="truncate">{name}</span>
              {c.nickname && (
                <span className="shrink-0 text-[10px] text-slate-400">
                  {c.nickname}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
