"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getScoreClass,
  HOLES_BACK,
  HOLES_FRONT,
  HOLES_PLAYOFF,
  PAR_BY_HOLE,
} from "@/lib/captura/loadGroupCapture";
import type {
  CardSignaturePayload,
  GroupCapturePayload,
  GroupCapturePlayer,
  GroupMatchPlayCapture,
  HoleNumber,
  HoleScores,
} from "@/lib/captura/types";

type SignaturesByEntry = Record<string, CardSignaturePayload>;

function signaturesFromPlayers(
  players: GroupCapturePlayer[]
): SignaturesByEntry {
  const map: SignaturesByEntry = {};
  for (const p of players) {
    map[p.entryId] = {
      signedByPlayerAt: p.signatures?.signedByPlayerAt ?? null,
      signedByWitnessAt: p.signatures?.signedByWitnessAt ?? null,
      signedByWitnessEntryId: p.signatures?.signedByWitnessEntryId ?? null,
    };
  }
  return map;
}

/** Tarjeta lista para firmar: 18 hoyos o hasta el hoyo de decisión en match play. */
function isCardReadyForSigning(
  scores: HoleScores | undefined,
  pending: Partial<Record<HoleNumber, boolean>> | undefined,
  matchPlay: GroupMatchPlayCapture | null | undefined
): boolean {
  if (!scores) return false;
  const holesRequired = matchPlay?.holesRequired ?? 18;
  for (let h = 1; h <= holesRequired; h++) {
    const hole = h as HoleNumber;
    if (scores[hole] == null) return false;
    if (pending?.[hole]) return false;
  }
  return true;
}

type TableKind = "public" | "private";
type ActiveCell = { entryId: string; hole: HoleNumber; table: TableKind };

type ScoresByEntry = Record<string, HoleScores>;
type PendingByEntry = Record<string, Partial<Record<HoleNumber, boolean>>>;

function scoresFromPlayers(players: GroupCapturePlayer[]): ScoresByEntry {
  const map: ScoresByEntry = {};
  for (const p of players) {
    map[p.entryId] = { ...p.scores };
  }
  return map;
}

function pendingFromPlayers(players: GroupCapturePlayer[]): PendingByEntry {
  const map: PendingByEntry = {};
  for (const p of players) {
    map[p.entryId] = { ...(p.pending ?? {}) };
  }
  return map;
}

function privateScoresFromPlayers(players: GroupCapturePlayer[]): ScoresByEntry {
  const map: ScoresByEntry = {};
  for (const p of players) {
    if (p.privateScores) {
      map[p.entryId] = { ...p.privateScores };
    }
  }
  return map;
}

function PublicSection({
  title,
  holes,
  players,
  scoresByEntry,
  pendingByEntry,
  activeCell,
  savingKey,
  onCellTap,
  witnessEntryIdForMe,
  myEntryId,
  toneClass = "bg-[#0d2747]",
  labelForHole,
  rowAccent,
  disabledHoles,
  matchProgression,
}: {
  title: string;
  holes: HoleNumber[];
  players: GroupCapturePlayer[];
  scoresByEntry: ScoresByEntry;
  pendingByEntry: PendingByEntry;
  activeCell: ActiveCell | null;
  savingKey: string | null;
  onCellTap: (entryId: string, hole: HoleNumber, table: TableKind) => void;
  witnessEntryIdForMe: string | null;
  myEntryId: string | null;
  /** Color del header (para distinguir el tramo de desempate). */
  toneClass?: string;
  /** Permite mostrar etiqueta distinta al número de hoyo guardado
   *  (ej. en desempate guardamos 19-27 pero mostramos 1-9). */
  labelForHole?: (hole: HoleNumber) => string;
  /** Borde lateral del título (decorativo). */
  rowAccent?: string;
  /** Hoyos que NO permiten editar (después de decidir el desempate). */
  disabledHoles?: Set<HoleNumber>;
  /** Mapa hole_no → label "AS / T+1 / B+0.5". Si se proporciona,
   *  añadimos una fila MATCH al final con el estado por hoyo. */
  matchProgression?: Map<number, {
    label: string;
    top_cum: number;
    bottom_cum: number;
  }>;
}) {
  const isHoleComplete = (hole: HoleNumber) =>
    players.length > 0 &&
    players.every((p) => {
      const v = (scoresByEntry[p.entryId] ?? p.scores)[hole];
      return v != null;
    });

  return (
    <div className="rounded-lg bg-white p-2 shadow-sm">
      <div
        className={[
          "mb-1 text-[11px] font-bold tracking-[0.04em] text-slate-500",
          rowAccent ?? "",
        ].join(" ")}
      >
        {title}
      </div>
      <div className="overflow-hidden rounded">
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className={`${toneClass} text-white`}>
              <th className="w-10 px-1 py-1 text-left font-bold">H</th>
              {holes.map((hole) => {
                const done = isHoleComplete(hole);
                return (
                  <th
                    key={hole}
                    className="relative px-0 py-1 text-center font-bold"
                  >
                    <div className="leading-none">
                      {labelForHole ? labelForHole(hole) : hole}
                    </div>
                    {done ? (
                      <span
                        aria-label="Hoyo completo"
                        className="absolute -right-0.5 -top-0.5 inline-flex h-[14px] w-[14px] items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black leading-none text-white shadow-sm"
                      >
                        ✓
                      </span>
                    ) : null}
                  </th>
                );
              })}
              <th className="w-8 px-0 py-1 text-center font-bold">TOT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-300 bg-slate-100">
              <td className="px-1 py-1 font-bold text-slate-800">PAR</td>
              {holes.map((hole) => (
                <td
                  key={`par-${title}-${hole}`}
                  className="px-0 py-1 text-center text-slate-800"
                >
                  {PAR_BY_HOLE[hole]}
                </td>
              ))}
              <td className="px-0 py-1 text-center font-bold text-slate-800">
                {holes.reduce((acc, hole) => acc + PAR_BY_HOLE[hole], 0)}
              </td>
            </tr>
            {players.map((player) => {
              const scores = scoresByEntry[player.entryId] ?? player.scores;
              const pending = pendingByEntry[player.entryId] ?? {};
              const isMyWitnessTarget =
                witnessEntryIdForMe != null &&
                witnessEntryIdForMe === player.entryId;
              const isMe = myEntryId != null && myEntryId === player.entryId;
              const total = holes.reduce(
                (acc, hole) => acc + (scores[hole] ?? 0),
                0
              );
              // Fondo de fila: el jugador identificado se pinta en azul cielo,
              // el jugador al que YO atestiguo, en ámbar.
              const rowBg = isMe
                ? "bg-sky-50"
                : isMyWitnessTarget
                  ? "bg-amber-50"
                  : "";
              return (
                <tr
                  key={player.entryId}
                  className={[
                    "border-b border-slate-300 last:border-b-0",
                    rowBg,
                  ].join(" ")}
                >
                  <td className="px-1 py-2 font-bold text-slate-900">
                    {player.initials}
                  </td>
                  {holes.map((hole) => {
                    const val = scores[hole];
                    const isActive =
                      activeCell?.entryId === player.entryId &&
                      activeCell.hole === hole &&
                      activeCell.table === "public";
                    const key = `${player.entryId}-${hole}`;
                    const isSaving = savingKey === `pub:${key}`;
                    const isPending = pending[hole];
                    const disabled = disabledHoles?.has(hole) ?? false;
                    return (
                      <td key={key} className="px-0 py-1 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (disabled) return;
                            onCellTap(player.entryId, hole, "public");
                          }}
                          className={[
                            "inline-flex h-6 w-6 items-center justify-center text-[10px] font-bold",
                            getScoreClass(val ?? null, PAR_BY_HOLE[hole]),
                            isPending
                              ? "bg-red-500 text-white"
                              : "text-slate-900",
                            isActive ? "ring-2 ring-sky-500 ring-offset-1" : "",
                            isSaving ? "opacity-60" : "",
                            disabled ? "cursor-not-allowed opacity-30" : "",
                          ].join(" ")}
                        >
                          {val ?? ""}
                        </button>
                      </td>
                    );
                  })}
                  <td
                    className={[
                      "px-0 py-1 text-center font-bold text-slate-900",
                      isMe
                        ? "bg-sky-100"
                        : isMyWitnessTarget
                          ? "bg-amber-100"
                          : "",
                    ].join(" ")}
                  >
                    {total > 0 ? total : ""}
                  </td>
                </tr>
              );
            })}

            {/* Fila MATCH: progresión del match hoyo por hoyo. Solo se
                muestra si el grupo es match play (matchProgression
                presente). Verde tenue como cabecera de pareja vs pareja. */}
            {matchProgression && matchProgression.size > 0 ? (
              <tr className="border-t-2 border-emerald-400 bg-emerald-50">
                <td
                  className="px-1 py-1.5 text-[10px] font-bold tracking-wide text-emerald-900"
                  title="Estado del match tras cada hoyo (puntos acumulados). AS = empate · T+N = top arriba · B+N = bottom arriba"
                >
                  MATCH
                </td>
                {holes.map((hole) => {
                  const row = matchProgression.get(hole);
                  if (!row) {
                    return (
                      <td
                        key={`mp-${title}-${hole}`}
                        className="px-0 py-1.5 text-center text-[9px] text-slate-400"
                      >
                        —
                      </td>
                    );
                  }
                  const tint =
                    row.label === "AS"
                      ? "text-slate-700"
                      : row.label.startsWith("T+")
                        ? "text-cyan-700 font-bold"
                        : "text-fuchsia-700 font-bold";
                  return (
                    <td
                      key={`mp-${title}-${hole}`}
                      className={[
                        "px-0 py-1.5 text-center text-[9px] leading-none",
                        tint,
                      ].join(" ")}
                      title={`${row.top_cum}–${row.bottom_cum} pts`}
                    >
                      {row.label}
                    </td>
                  );
                })}
                <td className="px-0 py-1.5 text-center text-[9px] text-slate-500">
                  {(() => {
                    const lastHole = [...holes]
                      .reverse()
                      .find((h) => matchProgression.has(h));
                    if (lastHole == null) return "—";
                    const last = matchProgression.get(lastHole)!;
                    return `${last.top_cum}–${last.bottom_cum}`;
                  })()}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrivateSection({
  title,
  holes,
  player,
  scores,
  activeCell,
  savingKey,
  onCellTap,
  ownerLabel,
}: {
  title: string;
  holes: HoleNumber[];
  player: GroupCapturePlayer;
  scores: HoleScores;
  activeCell: ActiveCell | null;
  savingKey: string | null;
  onCellTap: (entryId: string, hole: HoleNumber, table: TableKind) => void;
  ownerLabel: string;
}) {
  const total = holes.reduce((acc, hole) => acc + (scores[hole] ?? 0), 0);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold tracking-[0.04em] text-amber-800">
        <span>{title}</span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-900">
          Privada · {ownerLabel}
        </span>
      </div>
      <div className="overflow-hidden rounded">
        <table className="w-full table-fixed text-[10px]">
          <thead>
            <tr className="bg-amber-700 text-white">
              <th className="w-10 px-1 py-1 text-left font-bold">H</th>
              {holes.map((hole) => (
                <th
                  key={`priv-${title}-h-${hole}`}
                  className="px-0 py-1 text-center font-bold"
                >
                  {hole}
                </th>
              ))}
              <th className="w-8 px-0 py-1 text-center font-bold">TOT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-amber-300 bg-amber-100">
              <td className="px-1 py-1 font-bold text-amber-900">{player.initials}</td>
              {holes.map((hole) => {
                const val = scores[hole];
                const isActive =
                  activeCell?.entryId === player.entryId &&
                  activeCell.hole === hole &&
                  activeCell.table === "private";
                const key = `${player.entryId}-${hole}`;
                const isSaving = savingKey === `priv:${key}`;
                return (
                  <td
                    key={`priv-cell-${player.entryId}-${hole}`}
                    className="px-0 py-1 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => onCellTap(player.entryId, hole, "private")}
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center text-[10px] font-bold text-amber-950",
                        getScoreClass(val ?? null, PAR_BY_HOLE[hole]),
                        isActive ? "ring-2 ring-sky-500 ring-offset-1" : "",
                        isSaving ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      {val ?? ""}
                    </button>
                  </td>
                );
              })}
              <td className="px-0 py-1 text-center font-bold text-amber-900">
                {total > 0 ? total : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TarjetaCaptureClient({
  initial,
}: {
  initial: GroupCapturePayload;
}) {
  const [meta, setMeta] = useState(initial);
  const [scoresByEntry, setScoresByEntry] = useState<ScoresByEntry>(() =>
    scoresFromPlayers(initial.players)
  );
  const [pendingByEntry, setPendingByEntry] = useState<PendingByEntry>(() =>
    pendingFromPlayers(initial.players)
  );
  const [privateScoresByEntry, setPrivateScoresByEntry] = useState<ScoresByEntry>(
    () => privateScoresFromPlayers(initial.players)
  );
  const [signaturesByEntry, setSignaturesByEntry] = useState<SignaturesByEntry>(
    () => signaturesFromPlayers(initial.players)
  );
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [draftScore, setDraftScore] = useState<string>("");
  const [draftFresh, setDraftFresh] = useState<boolean>(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Visibilidad del bloque "Mi Tarjeta" + banner del testigo (toggle manual). */
  const [showMyCard, setShowMyCard] = useState<boolean>(true);
  const [signingFor, setSigningFor] = useState<string | null>(null);
  const activeCellRef = useRef<ActiveCell | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    activeCellRef.current = activeCell;
  }, [activeCell]);

  // Listas y mapas derivados
  const witnessAssignmentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of meta.witnesses ?? []) {
      m.set(w.entryId, w.witnessEntryId);
    }
    return m;
  }, [meta.witnesses]);

  const playersById = useMemo(() => {
    const m = new Map<string, GroupCapturePlayer>();
    for (const p of meta.players) m.set(p.entryId, p);
    return m;
  }, [meta.players]);

  /** Lista de entries cuya tarjeta privada puede ver/editar el visitante. */
  const privateEntryIds = useMemo(() => {
    const ids: string[] = [];
    if (meta.myEntryId) ids.push(meta.myEntryId);
    for (const eid of meta.caddieForEntryIds ?? []) {
      if (!ids.includes(eid)) ids.push(eid);
    }
    return ids.filter((eid) => playersById.has(eid));
  }, [meta.myEntryId, meta.caddieForEntryIds, playersById]);

  /** A quién atestigua el visitante (si es jugador). */
  const witnessTargetForMe = useMemo(() => {
    if (!meta.myEntryId) return null;
    for (const w of meta.witnesses ?? []) {
      if (w.witnessEntryId === meta.myEntryId) return w.entryId;
    }
    return null;
  }, [meta.myEntryId, meta.witnesses]);

  /** Quién es MI testigo (otro jugador). */
  const myWitnessEntryId = useMemo(() => {
    if (!meta.myEntryId) return null;
    return witnessAssignmentMap.get(meta.myEntryId) ?? null;
  }, [meta.myEntryId, witnessAssignmentMap]);

  /**
   * Progresión del match hoyo por hoyo (match play). Mapa hole_no →
   * { label, top_cum, bottom_cum } que se inyecta en cada PublicSection
   * para dibujar la fila "MATCH" al pie de cada tramo.
   */
  const matchProgressionMap = useMemo(() => {
    const map = new Map<
      number,
      { label: string; top_cum: number; bottom_cum: number }
    >();
    for (const row of meta.matchPlay?.progression ?? []) {
      map.set(row.hole_no, {
        label: row.label,
        top_cum: row.top_cum,
        bottom_cum: row.bottom_cum,
      });
    }
    return map.size > 0 ? map : undefined;
  }, [meta.matchPlay?.progression]);

  const refresh = useCallback(async () => {
    if (savingRef.current) return;
    try {
      const qs = new URLSearchParams({ group_id: meta.groupId });
      if (meta.myEntryId) qs.set("me", meta.myEntryId);
      // caddieForEntryIds del payload ya fue resuelto; basta con incluir
      // el caddie_id de la URL si seguimos en sesión de caddie. Como no
      // tenemos acceso directo desde el cliente, leemos searchParams.
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const caddie = params.get("caddie")?.trim();
        if (caddie) qs.set("caddie", caddie);
      }
      const res = await fetch(`/api/captura/group?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: GroupCapturePayload;
      };
      if (!json.ok || !json.data) return;
      setMeta(json.data);

      const remote = scoresFromPlayers(json.data.players);
      const remotePending = pendingFromPlayers(json.data.players);
      const remotePrivate = privateScoresFromPlayers(json.data.players);

      setScoresByEntry((prev) => {
        const next: ScoresByEntry = { ...prev };
        const editing = activeCellRef.current;
        for (const p of json.data!.players) {
          const entryId = p.entryId;
          if (!next[entryId]) next[entryId] = { ...p.scores };
          for (const h of [...HOLES_FRONT, ...HOLES_BACK]) {
            if (
              editing?.entryId === entryId &&
              editing.hole === h &&
              editing.table === "public"
            )
              continue;
            next[entryId][h] = remote[entryId]?.[h] ?? null;
          }
        }
        return next;
      });

      setPendingByEntry(() => remotePending);

      const remoteSignatures = signaturesFromPlayers(json.data.players);
      setSignaturesByEntry(remoteSignatures);

      setPrivateScoresByEntry((prev) => {
        const next: ScoresByEntry = { ...prev };
        const editing = activeCellRef.current;
        for (const eid of Object.keys(remotePrivate)) {
          const remoteScores = remotePrivate[eid];
          if (!remoteScores) continue;
          if (!next[eid]) next[eid] = { ...remoteScores };
          for (const h of [...HOLES_FRONT, ...HOLES_BACK]) {
            if (
              editing?.entryId === eid &&
              editing.hole === h &&
              editing.table === "private"
            )
              continue;
            next[eid][h] = remoteScores[h] ?? null;
          }
        }
        // Limpiar entries que ya no son visibles
        for (const eid of Object.keys(next)) {
          if (!remotePrivate[eid]) delete next[eid];
        }
        return next;
      });

      setSyncHint(
        new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch {
      // polling silencioso
    }
  }, [meta.groupId, meta.myEntryId]);

  useEffect(() => {
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const activePlayer = activeCell
    ? playersById.get(activeCell.entryId) ?? null
    : null;

  function openCell(entryId: string, hole: HoleNumber, table: TableKind) {
    const existing =
      table === "public"
        ? scoresByEntry[entryId]?.[hole] ?? null
        : privateScoresByEntry[entryId]?.[hole] ?? null;
    setActiveCell({ entryId, hole, table });
    setDraftScore(existing != null ? String(existing) : "");
    setDraftFresh(true);
  }

  function closeKeypad() {
    setActiveCell(null);
    setDraftScore("");
    setDraftFresh(false);
  }

  async function persistPublicScore(
    entryId: string,
    hole: HoleNumber,
    strokes: number | null,
    mode: "modify" | "approve"
  ) {
    const key = `pub:${entryId}-${hole}`;
    setSavingKey(key);
    savingRef.current = true;
    setSaveError(null);

    const hadPreviousScore =
      (scoresByEntry[entryId]?.[hole] ?? null) != null;

    // Optimistic update
    setScoresByEntry((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [hole]: strokes,
      },
    }));
    if (mode === "approve") {
      setPendingByEntry((prev) => {
        const cur = { ...(prev[entryId] ?? {}) };
        delete cur[hole];
        return { ...prev, [entryId]: cur };
      });
    } else if (mode === "modify" && strokes != null && hadPreviousScore) {
      setPendingByEntry((prev) => ({
        ...prev,
        [entryId]: { ...(prev[entryId] ?? {}), [hole]: true },
      }));
    }

    // Determinar mi rol respecto al jugador objetivo P:
    // jugador, caddie de P, testigo de P, caddie del testigo o ninguno.
    const caddieForEntries = meta.caddieForEntryIds ?? [];
    const iAmThePlayer = meta.myEntryId === entryId;
    const iAmTheirCaddie = caddieForEntries.includes(entryId);
    const iAmTheirWitness =
      witnessTargetForMe != null && witnessTargetForMe === entryId;
    const witnessOfTarget = (meta.witnesses ?? []).find(
      (w) => w.entryId === entryId
    )?.witnessEntryId;
    const iAmTheWitnessCaddie =
      witnessOfTarget != null && caddieForEntries.includes(witnessOfTarget);
    const role: "player" | "caddie" | "witness" | null = iAmThePlayer
      ? "player"
      : iAmTheirCaddie
        ? "caddie"
        : iAmTheirWitness
          ? "witness"
          : iAmTheWitnessCaddie
            ? "caddie"
            : null;

    try {
      const res = await fetch("/api/captura/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: meta.groupId,
          entry_id: entryId,
          hole,
          strokes,
          mode,
          role,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pendingWitness?: boolean;
      };
      if (!json.ok) {
        setSaveError(json.error ?? "No se pudo guardar.");
        await refresh();
        return;
      }
      // Actualizar pending según respuesta del servidor.
      setPendingByEntry((prev) => {
        const cur = { ...(prev[entryId] ?? {}) };
        if (json.pendingWitness) cur[hole] = true;
        else delete cur[hole];
        return { ...prev, [entryId]: cur };
      });
    } catch {
      setSaveError("Error de red al guardar.");
    } finally {
      setSavingKey(null);
      savingRef.current = false;
    }
  }

  async function persistPrivateScore(
    entryId: string,
    hole: HoleNumber,
    strokes: number | null
  ) {
    const key = `priv:${entryId}-${hole}`;
    setSavingKey(key);
    savingRef.current = true;
    setSaveError(null);

    setPrivateScoresByEntry((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [hole]: strokes,
      },
    }));

    try {
      const params = new URLSearchParams(window.location.search);
      const caddieIdFromUrl = params.get("caddie")?.trim() ?? "";
      const meFromUrl = params.get("me")?.trim() ?? "";
      const res = await fetch("/api/captura/private-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: meta.groupId,
          entry_id: entryId,
          hole,
          strokes,
          me: meFromUrl || meta.myEntryId || "",
          caddie: caddieIdFromUrl || "",
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setSaveError(json.error ?? "No se pudo guardar tarjeta privada.");
        await refresh();
      }
    } catch {
      setSaveError("Error de red al guardar.");
    } finally {
      setSavingKey(null);
      savingRef.current = false;
    }
  }

  /**
   * "Autoridad" del jugador objetivo P (no marca rojo):
   *  - el propio jugador P,
   *  - su caddie (asignado a P),
   *  - su testigo W,
   *  - el caddie de W (acttúa de parte del testigo).
   * Cualquier otra persona del grupo deja la celda en rojo si la celda
   * ya tenía valor antes (mode=modify).
   */
  function publicSaveMode(entryId: string): "modify" | "approve" {
    const caddieForEntries = meta.caddieForEntryIds ?? [];
    const iAmThePlayer = meta.myEntryId === entryId;
    const iAmTheirCaddie = caddieForEntries.includes(entryId);
    const iAmTheirWitness =
      witnessTargetForMe != null && witnessTargetForMe === entryId;
    // Testigo del jugador objetivo P (entry de W).
    const witnessOfTarget = (meta.witnesses ?? []).find(
      (w) => w.entryId === entryId
    )?.witnessEntryId;
    const iAmTheWitnessCaddie =
      witnessOfTarget != null && caddieForEntries.includes(witnessOfTarget);

    return iAmThePlayer ||
      iAmTheirCaddie ||
      iAmTheirWitness ||
      iAmTheWitnessCaddie
      ? "approve"
      : "modify";
  }

  function pickScore(strokes: number | null) {
    if (!activeCell) return;
    const { entryId, hole, table } = activeCell;
    if (table === "private") {
      void persistPrivateScore(entryId, hole, strokes);
    } else {
      void persistPublicScore(entryId, hole, strokes, publicSaveMode(entryId));
    }
    closeKeypad();
  }

  function pressDigit(n: number) {
    if (!activeCell) return;
    const base = draftFresh ? "" : draftScore;
    const next = `${base}${n}`.replace(/^0+(?=\d)/, "");
    setDraftScore(next);
    if (draftFresh) setDraftFresh(false);
  }

  function pressBackspace() {
    if (!activeCell) return;
    setDraftFresh(false);
    setDraftScore((cur) => cur.slice(0, -1));
  }

  function pressEnter() {
    if (!activeCell) return;
    const numeric = Number(draftScore);
    if (Number.isFinite(numeric) && numeric > 0) {
      const { entryId, hole, table } = activeCell;
      if (table === "private") {
        void persistPrivateScore(entryId, hole, numeric);
      } else {
        void persistPublicScore(
          entryId,
          hole,
          numeric,
          publicSaveMode(entryId)
        );
      }
    }
    closeKeypad();
  }

  const mobileUrl = useMemo(() => {
    const sp = new URLSearchParams({ group_id: meta.groupId });
    if (meta.myEntryId) sp.set("me", meta.myEntryId);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const caddie = params.get("caddie")?.trim();
      if (caddie) sp.set("caddie", caddie);
    }
    sp.set("tab", "anotar");
    // Ruta pública (sin login) — espejo del módulo backoffice.
    return `/captura/mobile?${sp.toString()}`;
  }, [meta.groupId, meta.myEntryId]);

  /**
   * Link a resultados en vivo (página pública del torneo). Si el visitante
   * es jugador (?me=...) intenta ir directo a su categoría; si es caddie
   * usa la categoría del primer jugador que supervisa; si no, no se
   * agrega category_id (mostrará la pestaña por defecto).
   */
  const liveLeaderboardUrl = useMemo(() => {
    const tid = meta.tournamentId?.trim();
    if (!tid) return null;
    let preferredEntryId: string | null = null;
    if (meta.myEntryId) preferredEntryId = meta.myEntryId;
    else if (meta.caddieForEntryIds.length > 0) {
      preferredEntryId = meta.caddieForEntryIds[0] ?? null;
    }
    const targetPlayer = preferredEntryId
      ? meta.players.find((p) => p.entryId === preferredEntryId) ?? null
      : null;
    const categoryId = targetPlayer?.categoryId ?? null;
    const sp = new URLSearchParams();
    if (categoryId) sp.set("category_id", categoryId);
    sp.set("view", "live");
    const qs = sp.toString();
    return `/torneos/${tid}${qs ? `?${qs}` : ""}`;
  }, [meta.tournamentId, meta.myEntryId, meta.caddieForEntryIds, meta.players]);

  // Cantidad de pendientes que ME tocan aprobar
  const pendingForMeCount = useMemo(() => {
    if (!witnessTargetForMe) return 0;
    const pendingMap = pendingByEntry[witnessTargetForMe] ?? {};
    return Object.values(pendingMap).filter(Boolean).length;
  }, [witnessTargetForMe, pendingByEntry]);

  const witnessTargetPlayer = witnessTargetForMe
    ? playersById.get(witnessTargetForMe) ?? null
    : null;
  const myWitnessPlayer = myWitnessEntryId
    ? playersById.get(myWitnessEntryId) ?? null
    : null;

  /** ¿La tarjeta del jugador identificado (yo) está llena (18 hoyos)? */
  const myCardComplete = useMemo(() => {
    if (!meta.myEntryId) return false;
    return isCardReadyForSigning(
      scoresByEntry[meta.myEntryId],
      pendingByEntry[meta.myEntryId],
      meta.matchPlay
    );
  }, [meta.myEntryId, meta.matchPlay, scoresByEntry, pendingByEntry]);

  /** ¿La tarjeta del jugador al que atestiguo está lista para firmar? */
  const witnessCardComplete = useMemo(() => {
    if (!witnessTargetForMe) return false;
    return isCardReadyForSigning(
      scoresByEntry[witnessTargetForMe],
      pendingByEntry[witnessTargetForMe],
      meta.matchPlay
    );
  }, [witnessTargetForMe, meta.matchPlay, scoresByEntry, pendingByEntry]);

  const mySignatures = meta.myEntryId
    ? signaturesByEntry[meta.myEntryId] ?? null
    : null;
  const witnessSignatures = witnessTargetForMe
    ? signaturesByEntry[witnessTargetForMe] ?? null
    : null;

  /** Notificación "tarjeta entregada y firmada" para una tarjeta dada. */
  function cardFullySigned(entryId: string | null): boolean {
    if (!entryId) return false;
    const s = signaturesByEntry[entryId];
    return Boolean(s?.signedByPlayerAt && s?.signedByWitnessAt);
  }

  const myCardFullySigned = cardFullySigned(meta.myEntryId);
  const witnessCardFullySigned = cardFullySigned(witnessTargetForMe);

  async function signCard(targetEntryId: string, role: "player" | "witness") {
    if (!meta.myEntryId) return;
    const key = `${targetEntryId}:${role}`;
    setSigningFor(key);
    setSaveError(null);
    try {
      const res = await fetch("/api/captura/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: meta.groupId,
          entry_id: targetEntryId,
          role,
          me: meta.myEntryId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        signedByPlayerAt?: string | null;
        signedByWitnessAt?: string | null;
        signedByWitnessEntryId?: string | null;
      };
      if (!json.ok) {
        setSaveError(json.error ?? "No se pudo firmar la tarjeta.");
        return;
      }
      // Optimista
      setSignaturesByEntry((prev) => ({
        ...prev,
        [targetEntryId]: {
          signedByPlayerAt: json.signedByPlayerAt ?? null,
          signedByWitnessAt: json.signedByWitnessAt ?? null,
          signedByWitnessEntryId: json.signedByWitnessEntryId ?? null,
        },
      }));
    } catch {
      setSaveError("Error de red al firmar.");
    } finally {
      setSigningFor(null);
    }
  }

  return (
    <div className="w-full bg-slate-100">
      <div className="flex w-full justify-center bg-slate-100">
        <div className="w-full max-w-[390px] bg-slate-100 pb-28">
          <div className="bg-black px-2 py-2 text-white">
            <div className="text-sm font-semibold">List.golf</div>
            <div className="text-[10px] opacity-70">
              Captura grupal · tiempo real
            </div>
          </div>

          <div className="space-y-2 p-2">
            <div className="rounded-lg bg-white p-2 text-center text-[11px] shadow-sm">
              {meta.tournamentName ? (
                <div className="font-semibold text-slate-900">
                  {meta.tournamentName}
                </div>
              ) : null}
              <div className="text-slate-600">
                Grupo #{meta.groupNo ?? "?"}
                {meta.startingHole != null
                  ? ` · Salida hoyo ${meta.startingHole}`
                  : ""}
                {meta.teeTime ? ` · ${meta.teeTime}` : ""}
              </div>
              {syncHint ? (
                <div className="mt-1 text-[10px] text-emerald-700">
                  Sincronizado {syncHint}
                </div>
              ) : null}

              {showMyCard && witnessTargetPlayer ? (
                <div
                  className={[
                    "mt-2 rounded-md border px-2 py-1 text-[10px]",
                    pendingForMeCount > 0
                      ? "border-red-400 bg-red-50 text-red-900"
                      : "border-emerald-400 bg-emerald-50 text-emerald-900",
                  ].join(" ")}
                >
                  Eres testigo de <b>{witnessTargetPlayer.name}</b>.{" "}
                  {pendingForMeCount > 0
                    ? `Hay ${pendingForMeCount} cambio${pendingForMeCount === 1 ? "" : "s"} por aprobar (celdas rojas). Toca la celda y vuelve a escribir el score para liberarla.`
                    : "Sin cambios pendientes por aprobar."}
                </div>
              ) : null}
              {showMyCard && myWitnessPlayer ? (
                <div className="mt-1 text-[10px] text-slate-500">
                  Tu testigo: {myWitnessPlayer.name}
                </div>
              ) : null}

              <p className="mt-1 text-[10px] text-slate-500">
                Toca un score para anotar. Si modificas un score con valor,
                queda en rojo hasta que el testigo del jugador lo confirme.
              </p>

              {meta.matchPlay?.needsPlayoff ? (
                <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 px-2 py-1.5 text-center text-[11px] font-semibold text-amber-900">
                  Empate al 18 (AS). Procedan al desempate en muerte súbita
                  (hoyos 1-9). Cada hoyo sigue valiendo hasta 2 puntos
                  (1 bola baja + 1 bola alta). El match termina en el
                  primer hoyo donde una pareja saque <b>ventaja en
                  puntos</b>; si quedan 1-1 (cada pareja se llevó una
                  sub-competencia) el hoyo está empatado y siguen al
                  próximo.
                </div>
              ) : null}
              {meta.matchPlay && !meta.matchPlay.needsPlayoff && meta.matchPlay.decidedAtHole != null ? (
                <div className="mt-2 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-semibold text-emerald-900">
                  Match decidido: {meta.matchPlay.resultText}. Puedes firmar
                  tu tarjeta con los hoyos jugados hasta el H
                  {meta.matchPlay.viaPlayoff && meta.matchPlay.playoffHole != null
                    ? `${meta.matchPlay.playoffHole} del desempate`
                    : meta.matchPlay.decidedAtHole}{" "}
                  (no hace falta completar el 18).
                </div>
              ) : null}

              {/* Firmas: mis iniciales + testigo del jugador que me toca. */}
              {meta.myEntryId ? (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {myCardComplete ? (
                    mySignatures?.signedByPlayerAt ? (
                      <span className="inline-flex rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
                        ✓ Firmado: {playersById.get(meta.myEntryId)?.initials}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => signCard(meta.myEntryId!, "player")}
                        disabled={signingFor === `${meta.myEntryId}:player`}
                        className="inline-flex rounded-lg border border-sky-500 bg-sky-100 px-3 py-1.5 text-[11px] font-bold text-sky-900 disabled:opacity-60"
                      >
                        Firmar: {playersById.get(meta.myEntryId)?.initials}
                      </button>
                    )
                  ) : null}

                  {witnessTargetForMe && witnessCardComplete ? (
                    witnessSignatures?.signedByWitnessAt ? (
                      <span className="inline-flex rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
                        ✓ Testigo:{" "}
                        {playersById.get(witnessTargetForMe)?.initials}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          signCard(witnessTargetForMe, "witness")
                        }
                        disabled={signingFor === `${witnessTargetForMe}:witness`}
                        className="inline-flex rounded-lg border border-amber-500 bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-900 disabled:opacity-60"
                      >
                        Testigo:{" "}
                        {playersById.get(witnessTargetForMe)?.initials}
                      </button>
                    )
                  ) : null}
                </div>
              ) : null}

              {/* Notificaciones "tarjeta entregada y firmada". */}
              {myCardFullySigned ? (
                <div className="mt-2 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-bold text-emerald-900">
                  ✓ TU TARJETA ESTÁ ENTREGADA Y FIRMADA
                </div>
              ) : null}
              {witnessTargetForMe && witnessCardFullySigned ? (
                <div className="mt-1 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-bold text-emerald-900">
                  ✓ Tarjeta de {playersById.get(witnessTargetForMe)?.name} ·
                  entregada y firmada
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link
                  href={mobileUrl}
                  className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-900"
                >
                  Anotar por hoyo
                </Link>
                {liveLeaderboardUrl ? (
                  <a
                    href={liveLeaderboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-900"
                  >
                    Resultados en vivo
                  </a>
                ) : null}
                {privateEntryIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowMyCard((v) => !v)}
                    className={[
                      "inline-flex rounded-lg border px-3 py-1.5 text-[11px] font-semibold",
                      showMyCard
                        ? "border-amber-400 bg-amber-100 text-amber-900"
                        : "border-slate-300 bg-white text-slate-900",
                    ].join(" ")}
                    aria-pressed={showMyCard}
                  >
                    {showMyCard ? "Ocultar Mi Tarjeta" : "Mostrar Mi Tarjeta"}
                  </button>
                ) : null}
              </div>
            </div>

            {saveError ? (
              <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                {saveError}
              </div>
            ) : null}

            {meta.players.length === 0 ? (
              <div className="rounded-lg bg-white p-3 text-center text-[11px] text-slate-500 shadow-sm">
                No hay jugadores en este grupo.
              </div>
            ) : (
              <>
                <PublicSection
                  title="FRONT 9"
                  holes={HOLES_FRONT}
                  players={meta.players}
                  scoresByEntry={scoresByEntry}
                  pendingByEntry={pendingByEntry}
                  activeCell={activeCell}
                  savingKey={savingKey}
                  onCellTap={openCell}
                  witnessEntryIdForMe={witnessTargetForMe}
                  myEntryId={meta.myEntryId}
                  matchProgression={matchProgressionMap}
                />
                <PublicSection
                  title="BACK 9"
                  holes={HOLES_BACK}
                  players={meta.players}
                  scoresByEntry={scoresByEntry}
                  pendingByEntry={pendingByEntry}
                  activeCell={activeCell}
                  savingKey={savingKey}
                  onCellTap={openCell}
                  witnessEntryIdForMe={witnessTargetForMe}
                  myEntryId={meta.myEntryId}
                  matchProgression={matchProgressionMap}
                />

                {/* Desempate (muerte súbita): se muestra solo si la
                    competencia detectó AS al 18 o ya hay hoyos de
                    desempate capturados. Se etiquetan visualmente como
                    H1-H9 aunque internamente se guardan como 19-27. */}
                {(() => {
                  const showPlayoff =
                    Boolean(meta.matchPlay?.needsPlayoff) ||
                    Boolean(meta.matchPlay?.viaPlayoff) ||
                    meta.players.some((p) =>
                      HOLES_PLAYOFF.some(
                        (h) => (scoresByEntry[p.entryId] ?? p.scores)[h] != null
                      )
                    );
                  if (!showPlayoff) return null;
                  // Si ya se decidió, bloqueamos los hoyos posteriores al de
                  // decisión (los anteriores se mantienen visibles).
                  const decidedAt = meta.matchPlay?.decidedAtHole ?? null;
                  const disabled = new Set<HoleNumber>();
                  if (decidedAt != null && decidedAt >= 19) {
                    for (const h of HOLES_PLAYOFF) {
                      if (h > decidedAt) disabled.add(h);
                    }
                  }
                  return (
                    <PublicSection
                      title="DESEMPATE · muerte súbita (1-9)"
                      holes={HOLES_PLAYOFF}
                      players={meta.players}
                      scoresByEntry={scoresByEntry}
                      pendingByEntry={pendingByEntry}
                      activeCell={activeCell}
                      savingKey={savingKey}
                      onCellTap={openCell}
                      witnessEntryIdForMe={witnessTargetForMe}
                      myEntryId={meta.myEntryId}
                      toneClass="bg-amber-700"
                      labelForHole={(h) => String(h - 18)}
                      rowAccent="text-amber-700"
                      disabledHoles={disabled}
                      matchProgression={matchProgressionMap}
                    />
                  );
                })()}

                {showMyCard && privateEntryIds.map((eid) => {
                  const player = playersById.get(eid);
                  if (!player) return null;
                  const privScores =
                    privateScoresByEntry[eid] ??
                    player.privateScores ??
                    ({} as HoleScores);
                  const ownerLabel =
                    meta.myEntryId === eid ? "Mi Tarjeta" : player.name;
                  return (
                    <div key={`priv-block-${eid}`} className="space-y-2 pt-1">
                      <PrivateSection
                        title="MI TARJETA · FRONT 9"
                        holes={HOLES_FRONT}
                        player={player}
                        scores={privScores}
                        activeCell={activeCell}
                        savingKey={savingKey}
                        onCellTap={openCell}
                        ownerLabel={ownerLabel}
                      />
                      <PrivateSection
                        title="MI TARJETA · BACK 9"
                        holes={HOLES_BACK}
                        player={player}
                        scores={privScores}
                        activeCell={activeCell}
                        savingKey={savingKey}
                        onCellTap={openCell}
                        ownerLabel={ownerLabel}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {activeCell && activePlayer ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white px-2 pb-3 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
          <div className="mx-auto max-w-[390px]">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                {activePlayer.initials} · Hoyo {activeCell.hole} (Par{" "}
                {PAR_BY_HOLE[activeCell.hole]})
                {activeCell.table === "private" ? " · Privada" : ""}
                {activeCell.table === "public" &&
                witnessTargetForMe === activeCell.entryId &&
                pendingByEntry[activeCell.entryId]?.[activeCell.hole]
                  ? " · Aprobar"
                  : ""}
              </span>
              <button
                type="button"
                onClick={closeKeypad}
                className="text-slate-500"
              >
                Cerrar
              </button>
            </div>
            <div
              className={[
                "mb-2 text-center text-3xl font-bold leading-tight",
                draftFresh ? "text-slate-400" : "text-black",
              ].join(" ")}
            >
              {draftScore || "—"}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pressDigit(n)}
                  className="h-11 rounded-lg bg-slate-100 text-lg font-bold text-slate-900"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickScore(null)}
                className="h-11 rounded-lg bg-red-100 text-sm font-semibold text-red-700"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => pressDigit(0)}
                className="h-11 rounded-lg bg-slate-100 text-lg font-bold text-slate-900"
              >
                0
              </button>
              <button
                type="button"
                onClick={pressBackspace}
                className="h-11 rounded-lg bg-slate-200 text-sm font-semibold text-slate-900"
              >
                ←
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => pickScore(PAR_BY_HOLE[activeCell.hole])}
                className="h-11 rounded-lg border-2 border-slate-800 text-sm font-bold text-slate-900"
              >
                Par
              </button>
              <button
                type="button"
                onClick={pressEnter}
                disabled={!draftScore || Number(draftScore) <= 0}
                className="h-11 rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {activeCell.table === "public" &&
                witnessTargetForMe === activeCell.entryId &&
                pendingByEntry[activeCell.entryId]?.[activeCell.hole]
                  ? "Aprobar"
                  : "Enter"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
