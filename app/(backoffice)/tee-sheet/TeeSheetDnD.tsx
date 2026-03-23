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
import { useRouter } from "next/navigation";
import { moveEntryToGroupPosition, balanceGroupsByCategory } from "./actions";

type MemberUI = {
  entry_id: string;
  group_id: string;
  position: number;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
};

type GroupUI = {
  id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  notes: string | null;
  members: MemberUI[];
};

type Props = {
  tournamentId: string;
  roundId: string;
  targetGroupSize: number;
  maxGroupSize: number;
  groups: GroupUI[];
  initialCategory?: string;
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function nameOf(m: MemberUI) {
  const ln = (m.last_name ?? "").trim();
  const fn = (m.first_name ?? "").trim();
  return `${ln} ${fn}`.trim() || "Jugador";
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

  const groupsSorted = useMemo(() => [...groups].sort((a, b) => a.group_no - b.group_no), [groups]);

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

    await moveEntryToGroupPosition(fd);
    router.refresh();
  }

  async function runAutoBalanceRPC() {
    setLastError("");
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
      <section className="border rounded-md p-2 bg-white">
        <div className="text-sm text-gray-600">Cargando grupos…</div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="border rounded-md p-2 bg-white">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="text-sm font-semibold">Grupos</div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="border rounded px-2 py-1 text-xs w-[160px]"
            />

            <label className="flex items-center gap-1 text-xs select-none">
              <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
              Huecos
            </label>

            <label className="flex items-center gap-1 text-xs select-none">
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
                className="text-xs underline"
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

          <div className="text-[11px] text-gray-600">
            G: <span className="font-semibold">{visibleGroups.length}</span> · J:{" "}
            <span className="font-semibold">{visiblePlayersCount}</span>
          </div>
        </div>

        {qn ? (
          <div className="mt-2 border rounded p-2 bg-gray-50">
            <div className="text-[11px] text-gray-700 mb-1">Resultados</div>
            {searchResults.length === 0 ? (
              <div className="text-[11px] text-gray-600">Sin resultados.</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {searchResults.map((r) => (
                  <button
                    key={r.entry_id}
                    type="button"
                    className="border bg-white rounded px-2 py-1 text-[11px] hover:bg-gray-100"
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

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="border rounded px-2 py-1 text-xs"
            onClick={() =>
              startTransition(() => {
                runAutoBalanceRPC().catch((e: any) => setLastError(e?.message ?? "Error auto-balance"));
              })
            }
          >
            Auto-balance
          </button>

          <div className="text-[11px] text-gray-600">
            Huecos usa objetivo {targetGroupSize} · máximo manual {maxGroupSize}
          </div>
        </div>

        {lastError ? (
          <div className="mt-2 border border-red-300 bg-red-50 text-red-800 px-2 py-1 rounded text-xs">
            {lastError}
          </div>
        ) : null}

        {isPending ? <div className="mt-1 text-[11px] text-gray-600">Procesando…</div> : null}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetection={rectIntersection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <div className="grid gap-2 md:grid-cols-2">
          {visibleGroups.map((g) => {
            const mem = [...g.members].sort((a, b) => a.position - b.position);

            return (
              <DroppableGroupCard
                key={g.id}
                group={g}
                mem={mem}
                maxGroupSize={maxGroupSize}
                qn={qn}
                highlight={highlightGroupId === g.id}
                setRef={(el) => groupElById.current.set(g.id, el)}
              />
            );
          })}
        </div>

        <DragOverlay adjustScale={false}>
          {activeDrag ? (
            <div className="bg-white shadow-lg rounded border px-2 py-1 touch-none min-w-[180px]">
              <div className="flex items-center gap-2 text-[11px] leading-none whitespace-nowrap overflow-hidden">
                <div className="w-4 shrink-0">{activeDrag.position}</div>
                <div className="min-w-0 flex-1 truncate font-medium">{nameOf(activeDrag)}</div>
                <div className="w-8 shrink-0 text-right text-[10px] text-gray-600">
                  {activeDrag.handicap_index ?? "-"}
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
  highlight,
  setRef,
}: {
  group: GroupUI;
  mem: MemberUI[];
  maxGroupSize: number;
  qn: string;
  highlight: boolean;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const { setNodeRef: setGroupDropRef, isOver: isOverGroup } = useDroppable({
    id: groupDropId(group.id),
  });

  return (
    <div
      ref={(el) => {
        setRef(el);
        setGroupDropRef(el);
      }}
      className={[
        "border rounded-md bg-white p-1",
        highlight ? "ring-2 ring-black" : "",
        isOverGroup ? "ring-2 ring-blue-500" : "",
      ].join(" ")}
      title="Suelta aquí para mandar al final del grupo"
    >
      <div className="border rounded-sm px-2 py-1 bg-gray-50">
        <div className="flex items-center gap-2 text-[11px] leading-none whitespace-nowrap overflow-hidden">
          <div className="w-8 shrink-0 font-semibold">G{group.group_no}</div>
          <div className="w-8 shrink-0 text-gray-700">H{group.starting_hole ?? "-"}</div>
          <div className="min-w-0 flex-1 truncate text-gray-700">
            {(group.notes ?? "SIN CATEGORÍA").trim()}
          </div>
          <div className="w-10 shrink-0 text-right text-gray-600">
            {mem.length}/{maxGroupSize}
          </div>
        </div>
      </div>

      <div className="mt-1 max-h-[220px] overflow-auto pr-1">
        <DroppableLine id={dropId(group.id, 1)} />

        <ul className="space-y-1 mt-1">
          {mem.map((m, idx) => {
            const posAfter = idx + 2;
            const isMatch = qn ? norm(nameOf(m)).includes(qn) : false;

            return (
              <li key={m.entry_id} className="space-y-1">
                <DraggableMember id={entryDragId(m.entry_id)} member={m} highlight={isMatch} />
                <DroppableLine id={dropId(group.id, posAfter)} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DroppableLine({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        "h-2 rounded-sm border border-dashed",
        isOver ? "bg-black border-black" : "bg-gray-50 border-gray-300",
      ].join(" ")}
      title="Suelta aquí para insertar"
    />
  );
}

function DraggableMember({
  id,
  member,
  highlight,
}: {
  id: string;
  member: MemberUI;
  highlight?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  const label = nameOf(member);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        "border rounded-sm px-2 py-1 select-none touch-none",
        "cursor-grab active:cursor-grabbing",
        "text-[11px] leading-none",
        isDragging ? "opacity-40" : "",
        highlight ? "bg-yellow-50 border-yellow-300" : "",
      ].join(" ")}
      title="Arrastra para mover"
    >
      <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
        <div className="w-4 shrink-0 text-gray-600">{member.position}</div>
        <div className="min-w-0 flex-1 truncate font-medium">{label}</div>
        <div className="w-8 shrink-0 text-right text-[10px] text-gray-600">
          {member.handicap_index ?? "-"}
        </div>
      </div>
    </div>
  );
}