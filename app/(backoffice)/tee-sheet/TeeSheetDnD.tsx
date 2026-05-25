"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  MeasuringStrategy,
  rectIntersection,
} from "@dnd-kit/core";
import { FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { moveEntryToGroupPosition, balanceGroupsByCategory } from "./actions";
import { formatStartingHoleLabel } from "@/lib/tee-sheet/formatStartingHoleLabel";
import { formatGroupTeeScheduleLabel } from "./sessionBlock";

type MemberUI = {
  entry_id: string;
  group_id: string;
  position: number;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  standing_display: string | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name: string | null;
  club_logo_url: string | null;
  club_generated_logo_url: string | null;
  club_primary_color: string | null;
  /** Color del tee asignado al jugador (hex). null = sin regla. */
  tee_color: string | null;
  /** Nombre del tee asignado (Azules, Blancas, Doradas, Rojas, etc.). */
  tee_name: string | null;
};

type GroupUI = {
  id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  starting_label?: string | null;
  notes: string | null;
  members: MemberUI[];
  session_round_date?: string | null;
};

type Props = {
  tournamentId: string;
  roundId: string;
  targetGroupSize: number;
  maxGroupSize: number;
  groups: GroupUI[];
  initialCategory?: string;
  startingOrderConfirmed?: boolean;
  showPairingScore?: boolean;
  pairingScoreColumnLabel?: string;
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}


type CategoryColorClasses = {
  card: string;
  header: string;
  stripe: string;
  player: string;
  badge: string;
  cardStyle: React.CSSProperties;
  headerStyle: React.CSSProperties;
  stripeStyle: React.CSSProperties;
  playerStyle: React.CSSProperties;
  badgeStyle: React.CSSProperties;
};

const CATEGORY_COLOR_PALETTE = [
  { bg: "#e0f2fe", header: "#bae6fd", border: "#38bdf8", stripe: "#0284c7", badge: "#7dd3fc" },
  { bg: "#dcfce7", header: "#bbf7d0", border: "#4ade80", stripe: "#16a34a", badge: "#86efac" },
  { bg: "#fef3c7", header: "#fde68a", border: "#f59e0b", stripe: "#d97706", badge: "#fcd34d" },
  { bg: "#ede9fe", header: "#ddd6fe", border: "#8b5cf6", stripe: "#7c3aed", badge: "#c4b5fd" },
  { bg: "#ffe4e6", header: "#fecdd3", border: "#fb7185", stripe: "#e11d48", badge: "#fda4af" },
  { bg: "#cffafe", header: "#a5f3fc", border: "#22d3ee", stripe: "#0891b2", badge: "#67e8f9" },
  { bg: "#ecfccb", header: "#d9f99d", border: "#84cc16", stripe: "#65a30d", badge: "#bef264" },
  { bg: "#ffedd5", header: "#fed7aa", border: "#fb923c", stripe: "#ea580c", badge: "#fdba74" },
  { bg: "#fae8ff", header: "#f5d0fe", border: "#d946ef", stripe: "#c026d3", badge: "#f0abfc" },
  { bg: "#ccfbf1", header: "#99f6e4", border: "#2dd4bf", stripe: "#0d9488", badge: "#5eead4" },
];

function makeCategoryColor(index: number): CategoryColorClasses {
  const c = CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length];
  return {
    card: "",
    header: "",
    stripe: "",
    player: "",
    badge: "",
    cardStyle: {
      backgroundColor: c.bg,
      borderColor: c.border,
    },
    headerStyle: {
      backgroundColor: c.header,
      borderColor: c.border,
    },
    stripeStyle: {
      backgroundColor: c.stripe,
    },
    playerStyle: {
      backgroundColor: "rgba(255,255,255,0.78)",
      borderColor: c.border,
    },
    badgeStyle: {
      backgroundColor: c.badge,
      color: "#0f172a",
    },
  };
}

function getCategoryColorClasses(categoryLabel: string | null | undefined) {
  const key = catKey(categoryLabel ?? "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return makeCategoryColor(hash % CATEGORY_COLOR_PALETTE.length);
}

function nameOf(m: MemberUI) {
  const ln = (m.last_name ?? "").trim();
  const fn = (m.first_name ?? "").trim();
  return `${ln} ${fn}`.trim() || "Jugador";
}

function normalizeClubShort(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "CLB";

  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase() || "CLB";
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clubColorFromShort(value: string | null) {
  const palette = [
    "#0f766e",
    "#1d4ed8",
    "#7c3aed",
    "#be123c",
    "#b45309",
    "#15803d",
    "#0369a1",
    "#4338ca",
    "#a21caf",
    "#0f172a",
    "#166534",
    "#92400e",
  ];

  const seed = normalizeClubShort(value);
  return palette[hashString(seed) % palette.length];
}

function ClubMiniLogo({ member, size = 20 }: { member: MemberUI; size?: number }) {
  const logo = String(member.club_logo_url ?? "").trim();
  const shortName = normalizeClubShort(member.club_short_name || member.club_name);
  const color = member.club_primary_color || clubColorFromShort(shortName);
  const title = member.club_name || shortName;

  if (logo) {
    return (
      <span
        className="shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white shadow-[0_1px_1px_rgba(15,23,42,0.12)]"
        style={{ width: size, height: size }}
        title={title}
      >
        <img
          src={logo}
          alt={title}
          className="block h-full w-full"
          style={{ objectFit: "contain", padding: 2 }}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-slate-300 text-[8px] font-black text-white shadow-[0_1px_1px_rgba(15,23,42,0.12)]"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 25%, rgba(255,255,255,.32), ${color} 48%, rgba(2,6,23,.26))`,
        letterSpacing: 0.3,
      }}
      title={title}
    >
      {shortName}
    </span>
  );
}

function entryDragId(entryId: string) {
  return `entry:${entryId}`;
}

function dropId(groupId: string, pos: number) {
  return `drop:${groupId}:${pos}`;
}

function groupDropId(groupId: string) {
  return `group:${groupId}`;
}

function parseEntryDragId(id: string): { entryId: string } | null {
  if (!id.startsWith("entry:")) return null;
  return { entryId: id.slice("entry:".length) };
}

function parseDropId(id: string): { groupId: string; pos: number } | null {
  if (!id.startsWith("drop:")) return null;
  const rest = id.slice("drop:".length);
  const [groupId, posStr] = rest.split(":");
  const pos = Number(posStr);
  if (!groupId || !Number.isFinite(pos) || pos < 1) return null;
  return { groupId, pos };
}

function parseGroupDropId(id: string): { groupId: string } | null {
  if (!id.startsWith("group:")) return null;
  const groupId = id.slice("group:".length);
  if (!groupId) return null;
  return { groupId };
}

export default function TeeSheetDnD({
  tournamentId,
  roundId,
  targetGroupSize,
  maxGroupSize,
  groups,
  initialCategory = "ALL",
  startingOrderConfirmed = false,
  showPairingScore = false,
  pairingScoreColumnLabel = "HCP",
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastError, setLastError] = useState("");

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(initialCategory || "ALL");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyMatchGroups, setOnlyMatchGroups] = useState(false);

  const [activeDrag, setActiveDrag] = useState<MemberUI | null>(null);
  const [highlightGroupId, setHighlightGroupId] = useState("");

  const groupElById = useRef(new Map<string, HTMLDivElement | null>());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    })
  );

  useEffect(() => {
    setCategory(initialCategory || "ALL");
  }, [initialCategory]);

  const groupsSorted = useMemo(
    () => [...groups].sort((a, b) => a.group_no - b.group_no),
    [groups]
  );

  const categoryColorByLabel = useMemo(() => {
    const labels = Array.from(new Set(groupsSorted.map((g) => catKey(g.notes))));
    labels.sort((a, b) => {
      if (a === "SIN CATEGORÍA" && b !== "SIN CATEGORÍA") return 1;
      if (b === "SIN CATEGORÍA" && a !== "SIN CATEGORÍA") return -1;
      return a.localeCompare(b);
    });

    const map = new Map<string, CategoryColorClasses>();
    labels.forEach((label, index) => {
      map.set(label, makeCategoryColor(index));
    });

    return map;
  }, [groupsSorted]);

  const membersCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groupsSorted) m.set(g.id, g.members.length);
    return m;
  }, [groupsSorted]);

  const qn = useMemo(() => norm(q), [q]);

  const entryToMember = useMemo(() => {
    const m = new Map<string, MemberUI>();
    for (const g of groupsSorted) {
      for (const mem of g.members) {
        m.set(mem.entry_id, mem);
      }
    }
    return m;
  }, [groupsSorted]);

  const visibleGroups = useMemo(() => {
    return groupsSorted.filter((g) => {
      if (category !== "ALL" && catKey(g.notes) !== category) return false;
      if (onlyOpen && g.members.length >= targetGroupSize) return false;
      if (onlyMatchGroups && qn) {
        const hasMatch = g.members.some((m) => norm(nameOf(m)).includes(qn));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [groupsSorted, category, onlyOpen, onlyMatchGroups, qn, targetGroupSize]);

  const visiblePlayersCount = useMemo(() => {
    if (!qn) return visibleGroups.reduce((acc, g) => acc + g.members.length, 0);
    let c = 0;
    for (const g of visibleGroups) {
      for (const m of g.members) {
        if (norm(nameOf(m)).includes(qn)) c++;
      }
    }
    return c;
  }, [visibleGroups, qn]);

  const exportExcelHref = useMemo(
    () =>
      `/api/tee-sheet/export?tournament_id=${encodeURIComponent(tournamentId)}&round_id=${encodeURIComponent(roundId)}`,
    [tournamentId, roundId]
  );

  const searchResults = useMemo(() => {
    if (!qn) return [];
    const out: {
      entry_id: string;
      label: string;
      group_id: string;
      group_no: number;
      category_label: string;
    }[] = [];

    for (const g of groupsSorted) {
      for (const m of g.members) {
        const nm = nameOf(m);
        if (norm(nm).includes(qn)) {
          out.push({
            entry_id: m.entry_id,
            label: nm,
            group_id: g.id,
            group_no: g.group_no,
            category_label: catKey(g.notes),
          });
        }
      }
    }

    out.sort((a, b) => a.group_no - b.group_no);
    return out.slice(0, 25);
  }, [qn, groupsSorted]);

  function jumpToGroup(groupId: string) {
    setCategory("ALL");
    setOnlyOpen(false);
    setOnlyMatchGroups(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = groupElById.current.get(groupId);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setHighlightGroupId(groupId);
        window.setTimeout(() => setHighlightGroupId(""), 1200);
      });
    });
  }

  async function doMove(entryId: string, toGroupId: string, targetPos: number) {
    setLastError("");

    if (startingOrderConfirmed) {
      setLastError("El orden de salidas ya está confirmado. Reabre el orden antes de mover jugadores.");
      return;
    }

    const movingMember = entryToMember.get(entryId);
    const fromGroupId = movingMember?.group_id ?? "";
    const isSameGroup = fromGroupId === toGroupId;

    const count = membersCountByGroup.get(toGroupId) ?? 0;
    if (!isSameGroup && count >= maxGroupSize) {
      setLastError(`Ese grupo ya está lleno (máximo ${maxGroupSize}).`);
      return;
    }

    const fd = new FormData();
    fd.set("tournament_id", tournamentId);
    fd.set("round_id", roundId);
    fd.set("entry_id", entryId);
    fd.set("to_group_id", toGroupId);
    fd.set("target_position", String(targetPos));

    try {
      await moveEntryToGroupPosition(fd);
      router.refresh();
    } catch (e: any) {
      setLastError(e?.message ?? "Error moviendo jugador");
    }
  }

  async function runAutoBalanceRPC() {
    setLastError("");

    if (startingOrderConfirmed) {
      setLastError("El orden de salidas ya está confirmado. Reabre el orden antes de balancear grupos.");
      return;
    }

    const fd = new FormData();
    fd.set("tournament_id", tournamentId);
    fd.set("round_id", roundId);
    fd.set("group_size", String(targetGroupSize));
    await balanceGroupsByCategory(fd);
    router.refresh();
  }

  function onDragStart(ev: DragStartEvent) {
    const a = parseEntryDragId(String(ev.active.id));
    const entryId = a?.entryId ?? "";
    setActiveDrag(entryId ? entryToMember.get(entryId) ?? null : null);
  }

  function onDragEnd(ev: DragEndEvent) {
    const a = parseEntryDragId(String(ev.active.id));
    const overId = ev.over?.id ? String(ev.over.id) : "";

    const oLine = parseDropId(overId);
    const oGroup = parseGroupDropId(overId);

    const dragged = a?.entryId ?? "";
    setActiveDrag(null);

    if (!dragged) return;

    if (oLine) {
      startTransition(() => {
        doMove(dragged, oLine.groupId, oLine.pos).catch((e: any) =>
          setLastError(e?.message ? String(e.message) : "Error moviendo jugador")
        );
      });
      return;
    }

    if (oGroup) {
      const g = groupsSorted.find((x) => x.id === oGroup.groupId);
      const pos = (g?.members.length ?? 0) + 1;
      startTransition(() => {
        doMove(dragged, oGroup.groupId, pos).catch((e: any) =>
          setLastError(e?.message ? String(e.message) : "Error moviendo jugador")
        );
      });
    }
  }

  if (!mounted) {
    return (
      <section className="border rounded bg-white p-1.5">
        <div className="text-[11px] text-gray-600">Cargando grupos…</div>
      </section>
    );
  }

  return (
    <section className="space-y-1.5">
      <div className="border rounded bg-white p-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="text-[12px] font-semibold">Grupos</div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="h-6 w-[145px] rounded border px-1.5 text-[11px]"
            />

            <label className="flex items-center gap-1 text-[11px] select-none">
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(e) => setOnlyOpen(e.target.checked)}
              />
              Huecos
            </label>

            <label className="flex items-center gap-1 text-[11px] select-none">
              <input
                type="checkbox"
                checked={onlyMatchGroups}
                onChange={(e) => setOnlyMatchGroups(e.target.checked)}
                disabled={!qn}
              />
              Match
            </label>

            {(q || category !== "ALL" || onlyOpen || onlyMatchGroups) && (
              <button
                type="button"
                className="text-[11px] underline"
                onClick={() => {
                  setQ("");
                  setCategory(initialCategory || "ALL");
                  setOnlyOpen(false);
                  setOnlyMatchGroups(false);
                }}
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="text-[10px] text-gray-600">
            G: <span className="font-semibold">{visibleGroups.length}</span> · J:{" "}
            <span className="font-semibold">{visiblePlayersCount}</span>
          </div>
        </div>

        {qn ? (
          <div className="mt-1.5 rounded border bg-gray-50 p-1.5">
            <div className="mb-1 text-[10px] text-gray-700">Resultados</div>
            {searchResults.length === 0 ? (
              <div className="text-[10px] text-gray-600">Sin resultados.</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {searchResults.map((r) => (
                  <button
                    key={r.entry_id}
                    type="button"
                    className="rounded border bg-white px-1.5 py-0.5 text-[10px] hover:bg-gray-100"
                    onClick={() => jumpToGroup(r.group_id)}
                    title={`Grupo ${r.group_no} · ${r.category_label}`}
                  >
                    {r.label} · G{r.group_no} · {r.category_label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="rounded border px-1.5 py-0.5 text-[11px]"
            onClick={() =>
              startTransition(() => {
                runAutoBalanceRPC().catch((e: any) =>
                  setLastError(e?.message ?? "Error auto-balance")
                );
              })
            }
            disabled={startingOrderConfirmed}
          >
            Auto-balance
          </button>

          <div className="text-[10px] text-gray-600">
            Huecos objetivo {targetGroupSize} · máximo manual {maxGroupSize}
          </div>

          <a
            href={exportExcelHref}
            className="ml-auto inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            title="Descarga archivo Excel (.xlsx) de la ronda actual"
          >
            <FileSpreadsheet className="size-3.5 shrink-0 opacity-95" aria-hidden />
            Exportar Excel
          </a>
        </div>

        {lastError ? (
          <div className="mt-1.5 rounded border border-red-300 bg-red-50 px-1.5 py-1 text-[11px] text-red-800">
            {lastError}
          </div>
        ) : null}

        {isPending ? <div className="mt-1 text-[10px] text-gray-600">Procesando…</div> : null}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetection={rectIntersection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <div className="grid gap-1.5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleGroups.map((g) => {
            const mem = [...g.members].sort((a, b) => a.position - b.position);

            return (
              <DroppableGroupCard
                key={g.id}
                group={g}
                mem={mem}
                maxGroupSize={maxGroupSize}
                qn={qn}
                showPairingScore={showPairingScore}
                highlight={highlightGroupId === g.id}
                categoryColor={categoryColorByLabel.get(catKey(g.notes)) ?? getCategoryColorClasses(catKey(g.notes))}
                setRef={(el) => groupElById.current.set(g.id, el)}
              />
            );
          })}
        </div>

        <DragOverlay adjustScale={false}>
          {activeDrag ? (
            <div className="min-w-[170px] touch-none rounded border bg-white px-1.5 py-1 shadow-lg">
              <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] leading-none">
                <div className="w-4 shrink-0">{activeDrag.position}</div>
                <ClubMiniLogo member={activeDrag} size={20} />
                <div className="min-w-0 flex-1 truncate font-medium">
                  {nameOf(activeDrag)}
                </div>
                <div className="w-10 shrink-0 text-right text-[10px] text-gray-600">
                  {showPairingScore
                    ? activeDrag.standing_display ?? "-"
                    : activeDrag.handicap_index ?? "-"}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function DroppableGroupCard({
  group,
  mem,
  maxGroupSize,
  qn,
  showPairingScore,
  highlight,
  categoryColor,
  setRef,
}: {
  group: GroupUI;
  mem: MemberUI[];
  maxGroupSize: number;
  qn: string;
  showPairingScore: boolean;
  highlight: boolean;
  categoryColor: CategoryColorClasses;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const { setNodeRef: setGroupDropRef, isOver: isOverGroup } = useDroppable({
    id: groupDropId(group.id),
  });

  const categoryLabel = catKey(group.notes);
  const color = categoryColor;

  return (
    <div
      ref={(el) => {
        setRef(el);
        setGroupDropRef(el);
      }}
      className={[
        "rounded border p-0.5 shadow-sm transition-colors",
        color.card,
        highlight ? "ring-2 ring-black" : "",
        isOverGroup ? "ring-2 ring-blue-500" : "",
      ].join(" ")}
      style={color.cardStyle}
      title="Suelta aquí para mandar al final del grupo"
    >
      <div className={["rounded-sm border px-1 py-0.5", color.header].join(" ")} style={color.headerStyle}>
        <div className="flex items-center justify-between gap-1 border-b border-slate-200/70 pb-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="text-[10px] font-semibold text-slate-400">
              G{group.group_no}
            </div>

            <div className="text-[11px] font-semibold text-slate-900">
              {formatGroupTeeScheduleLabel(group.session_round_date, group.tee_time)}
            </div>

            <div className="text-[11px] font-semibold text-slate-700">
              {formatStartingHoleLabel(
                group.starting_label,
                group.starting_hole
              )}
            </div>

            <div className={["min-w-0 truncate rounded px-1 py-0.5 text-[10px] font-semibold", color.badge].join(" ")} style={color.badgeStyle}>
              {categoryLabel}
            </div>
          </div>

          <div className="shrink-0 text-[10px] font-semibold text-slate-600">
            {mem.length}/{maxGroupSize}
          </div>
        </div>

        <div className={["mt-0.5 h-1 rounded-full", color.stripe].join(" ")} style={color.stripeStyle} />

        <div className="mt-0.5 space-y-0.5">
          {mem.map((m, idx) => (
            <React.Fragment key={m.entry_id}>
              <DropSlot groupId={group.id} pos={idx + 1} />
              <PlayerRow
                member={m}
                qn={qn}
                showPairingScore={showPairingScore}
                colorClassName={color.player}
                colorStyle={color.playerStyle}
              />
            </React.Fragment>
          ))}

          <DropSlot groupId={group.id} pos={mem.length + 1} finalSlot />
        </div>
      </div>
    </div>
  );
}

function DropSlot({
  groupId,
  pos,
  finalSlot = false,
}: {
  groupId: string;
  pos: number;
  finalSlot?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId(groupId, pos),
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "rounded border border-dashed transition-all",
        finalSlot ? "h-5" : "h-2",
        isOver ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white",
      ].join(" ")}
      title={finalSlot ? "Suelta aquí para mandar al final del grupo" : "Suelta aquí"}
    >
      {finalSlot ? (
        <div className="text-center text-[9px] leading-5 text-slate-400">final</div>
      ) : null}
    </div>
  );
}

function PlayerRow({
  member,
  qn,
  showPairingScore,
  colorClassName,
  colorStyle,
}: {
  member: MemberUI;
  qn: string;
  showPairingScore: boolean;
  colorClassName: string;
  colorStyle: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: entryDragId(member.entry_id),
    });

  const style: React.CSSProperties = {
    ...colorStyle,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.45 : 1,
  };

  const fullName = nameOf(member);
  const isMatch = qn ? norm(fullName).includes(qn) : false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded border px-1.5 py-0.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        colorClassName,
        isMatch ? "ring-2 ring-black" : "",
      ].join(" ")}
      {...listeners}
      {...attributes}
      title="Arrastra para mover"
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-4">
        <div className="w-4 shrink-0 font-bold text-blue-700">
          {member.position}
        </div>

        <ClubMiniLogo member={member} size={20} />

        {member.tee_color ? (
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-slate-400/60"
            style={{ background: member.tee_color }}
            title={
              member.tee_name
                ? `Sale de: ${member.tee_name}`
                : "Marca de salida asignada"
            }
            aria-label={
              member.tee_name
                ? `Sale de ${member.tee_name}`
                : "Sale de tee asignado"
            }
          />
        ) : null}

        <div className="min-w-0 flex-1 truncate font-medium text-slate-900">
          {fullName}
        </div>

        <div className="w-10 shrink-0 text-right font-bold text-green-700">
          {showPairingScore
            ? member.standing_display ?? "-"
            : member.handicap_index ?? "-"}
        </div>
      </div>
    </div>
  );
}
