"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveEntryToGroupPosition } from "./actions";

type Group = {
  id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  notes: string | null;
};

type Member = {
  entry_id: string;
  position: number;
  name: string;
  hi: number | null;
};

type Props = {
  tournamentId: string;
  roundId: string;
  groupSize: number;
  groups: Group[];
  membersByGroup: Record<string, Member[]>;
  maxPos: number; // ej 8
};

function entryKey(entry_id: string) {
  return `entry:${entry_id}`;
}
function groupKey(group_id: string) {
  return `group:${group_id}`;
}
function parseKey(key: string) {
  const [kind, id] = key.split(":");
  return { kind, id };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function SortablePlayerRow(props: {
  id: string; // entry:<uuid>
  label: string;
  sublabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded px-3 py-2 bg-white flex items-center justify-between"
      {...attributes}
      {...listeners}
      title="Arrastra para mover"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{props.label}</div>
        {props.sublabel ? <div className="text-xs opacity-70 truncate">{props.sublabel}</div> : null}
      </div>
      <div className="text-xs opacity-60 pl-3">⋮⋮</div>
    </div>
  );
}

function GroupColumn(props: {
  group: Group;
  items: string[]; // entry:<uuid>...
  renderLabel: (entryKey: string) => { label: string; sublabel?: string };
}) {
  return (
    <div className="border rounded-lg p-3 bg-neutral-50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Grupo #{props.group.group_no}</div>
          <div className="text-xs opacity-70">
            Tee: {props.group.tee_time ?? "-"} | Hole: {props.group.starting_hole ?? "-"}
          </div>
          {props.group.notes ? <div className="text-xs opacity-70">{props.group.notes}</div> : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <SortableContext items={props.items} strategy={verticalListSortingStrategy}>
          {props.items.map((ek) => {
            const x = props.renderLabel(ek);
            return <SortablePlayerRow key={ek} id={ek} label={x.label} sublabel={x.sublabel} />;
          })}
        </SortableContext>

        {/* Drop zone al final (solo visual) */}
        <div className="text-[11px] opacity-60 pt-1">
          Tip: suelta arriba/entre jugadores para insertar; suelta al final para agregar.
        </div>
      </div>
    </div>
  );
}

export default function TeeSheetDrag(props: Props) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // estado local para que se sienta inmediato (optimista)
  const [local, setLocal] = React.useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const g of props.groups) {
      const mem = props.membersByGroup[g.id] ?? [];
      out[g.id] = mem
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((m) => entryKey(m.entry_id));
    }
    return out;
  });

  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Lookup label
  const labelMap = React.useMemo(() => {
    const m = new Map<string, { label: string; sublabel?: string }>();
    for (const gid of Object.keys(props.membersByGroup)) {
      for (const row of props.membersByGroup[gid] ?? []) {
        m.set(entryKey(row.entry_id), {
          label: row.name,
          sublabel: row.hi == null ? "HI: -" : `HI: ${row.hi}`,
        });
      }
    }
    return m;
  }, [props.membersByGroup]);

  function findGroupOfEntry(eKey: string): string | null {
    for (const gid of Object.keys(local)) {
      if (local[gid]?.includes(eKey)) return gid;
    }
    return null;
  }

  async function persistMove(entryId: string, toGroupId: string, targetPos: number) {
    const fd = new FormData();
    fd.set("tournament_id", props.tournamentId);
    fd.set("round_id", props.roundId);
    fd.set("group_size", String(props.groupSize));
    fd.set("entry_id", entryId);
    fd.set("to_group_id", toGroupId);
    fd.set("target_position", String(targetPos));

    await moveEntryToGroupPosition(fd);
  }

  async function onDragEnd(e: DragEndEvent) {
    const active = e.active?.id?.toString() ?? "";
    const over = e.over?.id?.toString() ?? "";

    setActiveId(null);
    if (!active || !over) return;
    if (active === over) return;

    const a = parseKey(active);
    if (a.kind !== "entry") return;

    // ¿dónde estaba?
    const fromGroup = findGroupOfEntry(active);
    if (!fromGroup) return;

    // ¿a dónde cayó?
    // over puede ser entry:<id> o group:<id> (si lo implementáramos). Aquí usamos entry.
    const o = parseKey(over);
    let toGroup = fromGroup;
    let toIndex = -1;

    if (o.kind === "entry") {
      // cae sobre un jugador -> insert antes de ese jugador, en su grupo
      const overKey = over;
      const overGroup = findGroupOfEntry(overKey);
      if (!overGroup) return;
      toGroup = overGroup;
      toIndex = local[toGroup].indexOf(overKey);
      if (toIndex < 0) toIndex = local[toGroup].length; // fallback
    } else if (o.kind === "group") {
      // si algún día hacemos droppable por grupo
      toGroup = o.id;
      toIndex = local[toGroup]?.length ?? 0;
    } else {
      return;
    }

    // límites por maxPos (8)
    const fromItems = local[fromGroup] ?? [];
    const toItems = local[toGroup] ?? [];

    // Si mueves a otro grupo y está lleno, no hacemos nada
    if (toGroup !== fromGroup && toItems.length >= props.maxPos) {
      // puedes mejorar con toast; por ahora no hace nada
      router.refresh();
      return;
    }

    // Actualización optimista (UI)
    setLocal((prev) => {
      const next: Record<string, string[]> = { ...prev };
      next[fromGroup] = [...(prev[fromGroup] ?? [])];
      next[toGroup] = [...(prev[toGroup] ?? [])];

      // remover del origen
      const fromIdx = next[fromGroup].indexOf(active);
      if (fromIdx >= 0) next[fromGroup].splice(fromIdx, 1);

      // ajustar index si mismo grupo y venía antes
      let insertIndex = toIndex;
      if (fromGroup === toGroup) {
        const oldIndex = fromIdx;
        if (oldIndex >= 0 && oldIndex < toIndex) insertIndex = toIndex - 1;
      }

      insertIndex = clamp(insertIndex, 0, next[toGroup].length);
      next[toGroup].splice(insertIndex, 0, active);

      // recortar si por alguna razón se pasa
      if (next[toGroup].length > props.maxPos) {
        next[toGroup] = next[toGroup].slice(0, props.maxPos);
      }

      return next;
    });

    // Persistir en server action (target_position es 1-based)
    try {
      const targetPosition = clamp(toIndex + 1, 1, props.maxPos);
      await persistMove(a.id, toGroup, targetPosition);
      router.refresh();
    } catch (err) {
      // si falla, refrescamos para volver a la verdad del server
      router.refresh();
      throw err;
    }
  }

  const overlayLabel =
    activeId && labelMap.get(activeId)
      ? labelMap.get(activeId)!.label
      : activeId
      ? activeId
      : "";

  return (
    <div className="space-y-3">
      <div className="text-sm opacity-80">
        Drag & Drop activo. Máximo por grupo: <b>{props.maxPos}</b>.
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id.toString())}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.groups.map((g) => (
            <GroupColumn
              key={g.id}
              group={g}
              items={local[g.id] ?? []}
              renderLabel={(k) => labelMap.get(k) ?? { label: k, sublabel: "" }}
            />
          ))}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="border rounded px-3 py-2 bg-white shadow">
              <div className="text-sm font-medium">{overlayLabel}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}