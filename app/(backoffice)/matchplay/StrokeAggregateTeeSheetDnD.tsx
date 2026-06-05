"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  StrokeAggregateGroup,
  StrokeAggregatePlayerRow,
} from "@/lib/matchplay/strokeAggregateStandings";

type Payload = {
  ok: boolean;
  roundNo: number | null;
  allowancePct: number;
  groups: StrokeAggregateGroup[];
  message: string;
};

const MAX_GROUP_SIZE = 5;

function genderTint(label: string): { bg: string; border: string; chip: string } {
  const l = label.toLowerCase();
  if (l.startsWith("hombre")) {
    return { bg: "#0c2438", border: "#1d4ed8", chip: "#1d4ed8" };
  }
  if (l.startsWith("mujer")) {
    return { bg: "#2a0c24", border: "#be185d", chip: "#be185d" };
  }
  return { bg: "#13202e", border: "#334155", chip: "#475569" };
}

function netLabel(m: StrokeAggregatePlayerRow): string {
  if (m.holesPlayed === 0) return "—";
  if (m.net == null) return "—";
  return String(m.net);
}

export default function StrokeAggregateTeeSheetDnD({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<StrokeAggregatePlayerRow | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/matchplay/stroke-aggregate-standings?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as Payload;
      setData(json);
      setError("");
    } catch {
      setError("Error de red cargando salidas.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const groups = useMemo(
    () => [...(data?.groups ?? [])].sort((a, b) => a.groupNo - b.groupNo),
    [data]
  );

  const memberByEntry = useMemo(() => {
    const m = new Map<string, StrokeAggregatePlayerRow>();
    for (const g of groups) for (const mem of g.members) m.set(mem.entryId, mem);
    return m;
  }, [groups]);

  async function persistMove(
    entryId: string,
    toGroupId: string,
    targetPosition: number
  ) {
    setError("");
    try {
      const res = await fetch("/api/matchplay/stroke-aggregate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          entry_id: entryId,
          to_group_id: toGroupId,
          target_position: targetPosition,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Error moviendo jugador.");
      }
    } catch {
      setError("Error de red moviendo jugador.");
    } finally {
      await refresh();
    }
  }

  function onDragStart(ev: DragStartEvent) {
    const id = String(ev.active.id);
    if (id.startsWith("entry:")) {
      setActive(memberByEntry.get(id.slice(6)) ?? null);
    }
  }

  function onDragEnd(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : "";
    setActive(null);
    if (!activeId.startsWith("entry:") || !overId) return;
    const entryId = activeId.slice(6);

    let toGroupId = "";
    let pos = 1;
    if (overId.startsWith("slot:")) {
      const [, gid, posStr] = overId.split(":");
      toGroupId = gid;
      pos = Number(posStr) || 1;
    } else if (overId.startsWith("group:")) {
      toGroupId = overId.slice(6);
      const g = groups.find((x) => x.groupId === toGroupId);
      pos = (g?.members.length ?? 0) + 1;
    }
    if (!toGroupId) return;

    const dest = groups.find((g) => g.groupId === toGroupId);
    const fromSame = dest?.members.some((m) => m.entryId === entryId);
    if (!fromSame && (dest?.members.length ?? 0) >= MAX_GROUP_SIZE) {
      setError(`Esa salida ya tiene ${MAX_GROUP_SIZE} jugadores.`);
      return;
    }

    startTransition(() => {
      void persistMove(entryId, toGroupId, pos);
    });
  }

  if (loading) {
    return <p className="text-[11px] text-slate-400">Cargando salidas…</p>;
  }
  if (!data?.ok) {
    return <p className="text-[11px] text-slate-400">{data?.message ?? "Sin datos."}</p>;
  }
  if (groups.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Aún no hay salidas de Stroke Agregado. Usa «Crear salidas Stroke Agregado».
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-amber-100/80">
          Arrastra jugadores entre salidas · R{data.roundNo ?? "—"} · neto{" "}
          {data.allowancePct}% HI
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-white/10"
        >
          ↻ Recargar
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-500/40 bg-red-950/40 px-2 py-1 text-[11px] text-red-100">
          {error}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.groupId} group={g} />
          ))}
        </div>

        <DragOverlay>
          {active ? (
            <div className="rounded border border-sky-400 bg-[#0c1728] px-2 py-1 text-[11px] text-white shadow-lg">
              {active.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function GroupCard({ group }: { group: StrokeAggregateGroup }) {
  const tint = genderTint(group.label);
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.groupId}` });
  const members = [...group.members];

  return (
    <div
      ref={setNodeRef}
      className="rounded-lg border p-1.5 transition-colors"
      style={{
        backgroundColor: tint.bg,
        borderColor: isOver ? "#38bdf8" : tint.border,
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold text-white">
          G{group.groupNo}
          <span
            className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold text-white"
            style={{ backgroundColor: tint.chip }}
          >
            {group.label}
          </span>
        </span>
        <span className="text-[10px] text-slate-300">
          {group.teeTime ?? "—"} · {members.length}/{MAX_GROUP_SIZE}
        </span>
      </div>

      <div className="space-y-0.5">
        {members.map((m, idx) => (
          <div key={m.entryId}>
            <DropSlot groupId={group.groupId} pos={idx + 1} />
            <PlayerRow member={m} pos={idx + 1} />
          </div>
        ))}
        <DropSlot groupId={group.groupId} pos={members.length + 1} finalSlot />
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
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${groupId}:${pos}` });
  return (
    <div
      ref={setNodeRef}
      className="rounded border border-dashed transition-all"
      style={{
        height: finalSlot ? 16 : 6,
        borderColor: isOver ? "#38bdf8" : "rgba(148,163,184,0.25)",
        backgroundColor: isOver ? "rgba(56,189,248,0.15)" : "transparent",
      }}
    />
  );
}

function PlayerRow({
  member,
  pos,
}: {
  member: StrokeAggregatePlayerRow;
  pos: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `entry:${member.entryId}` });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex cursor-grab items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-100"
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      title="Arrastra para mover de salida"
    >
      <span className="w-3 shrink-0 text-[10px] font-bold text-sky-300">{pos}</span>
      <span className="min-w-0 flex-1 truncate">{member.name}</span>
      <span className="shrink-0 text-[10px] text-slate-400">
        PH {member.playingHandicap}
      </span>
      <span className="w-8 shrink-0 text-right font-bold tabular-nums text-emerald-300">
        {netLabel(member)}
      </span>
    </div>
  );
}
