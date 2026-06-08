/**
 * Vista del COMITÉ para resolver disputas de pedidos F&B.
 *
 * Lista todos los pedidos con status='disputed' — el cliente recibió el pedido
 * pero rechazó el cobro desde su Mini App (no le llegó, le dieron incorrecto,
 * etc.). El comité ve quién es el cliente, qué pidió, el motivo de la queja,
 * y decide:
 *   - Cargar al cliente igual (la queja no procede)  → status='delivered'
 *   - Cancelar el pedido (la queja procede)          → status='cancelled'
 *
 * Solo accesible para owner/super_admin/club_admin/tournament_director.
 * Operadores de venue (restaurante/carrito) NO ven esta página.
 */
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import DisputasClient from "./DisputasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMMITTEE_ROLES = new Set([
  "super_admin",
  "club_admin",
  "tournament_director",
]);

export interface DisputeRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  deliveredAt: string | null;
  pendingAcceptanceAt: string | null;
  disputedAt: string | null;
  disputedReason: string | null;
  clientName: string;
  clientKind: "player" | "caddie" | "anon";
  groupNo: number | null;
  venueName: string;
  items: { id: string; qty: number; name: string }[];
  history: HistoryEntry[];
}

export interface HistoryEntry {
  label: string;
  at: string;
}

export default async function FbDisputasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";
  if (!userId) redirect("/login?next=/fb-disputas");

  const admin = createAdminClient();
  const userRoles = await getUserRoles(admin, userId);
  const isCommittee = userRoles.some((r) => COMMITTEE_ROLES.has(r));
  if (!isCommittee) {
    redirect("/inicio");
  }

  // Cargar disputas activas + las últimas 30 resueltas (histórico de auditoría)
  const { data: activeRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, delivered_at, pending_acceptance_at, disputed_at, disputed_reason, dispute_resolution, dispute_resolved_at, entry_id, caddie_id, client_label, venue_id, accepted_at, ready_at, paid_at, cancelled_at"
    )
    .eq("status", "disputed")
    .order("disputed_at", { ascending: false });

  const { data: resolvedRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, delivered_at, pending_acceptance_at, disputed_at, disputed_reason, dispute_resolution, dispute_resolved_at, entry_id, caddie_id, client_label, venue_id, accepted_at, ready_at, paid_at, cancelled_at"
    )
    .not("disputed_at", "is", null)
    .neq("status", "disputed")
    .order("dispute_resolved_at", { ascending: false, nullsFirst: false })
    .limit(30);

  const all = [
    ...((activeRaw ?? []) as Array<Record<string, unknown>>),
    ...((resolvedRaw ?? []) as Array<Record<string, unknown>>),
  ];

  if (all.length === 0) {
    return <DisputasClient active={[]} resolved={[]} />;
  }

  // Cargar items
  const orderIds = all.map((o) => String(o.id));
  const linesByOrder = new Map<
    string,
    { id: string; qty: number; name: string }[]
  >();
  const { data: linesRaw } = await admin
    .from("fb_order_items")
    .select("id, order_id, qty, item_name_snapshot")
    .in("order_id", orderIds);
  for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
    const oid = String(l.order_id);
    const arr = linesByOrder.get(oid) ?? [];
    arr.push({
      id: String(l.id),
      qty: Number(l.qty ?? 0),
      name: String(l.item_name_snapshot ?? ""),
    });
    linesByOrder.set(oid, arr);
  }

  // Cargar venues
  const venueIds = Array.from(new Set(all.map((o) => String(o.venue_id))));
  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: vs } = await admin
      .from("fb_venues")
      .select("id, name")
      .in("id", venueIds);
    for (const v of (vs ?? []) as Array<Record<string, unknown>>) {
      venueNameById.set(String(v.id), String(v.name));
    }
  }

  // Cargar clientes (jugadores + caddies)
  const entryIds = Array.from(
    new Set(all.map((o) => o.entry_id).filter(Boolean) as string[])
  );
  const caddieIds = Array.from(
    new Set(all.map((o) => o.caddie_id).filter(Boolean) as string[])
  );
  const playerNameByEntry = new Map<string, string>();
  const groupNoByEntry = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("id, players ( first_name, last_name )")
      .in("id", entryIds);
    for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
      const id = String(e.id);
      const p = e.players as
        | { first_name?: string; last_name?: string }
        | { first_name?: string; last_name?: string }[]
        | null;
      const player = Array.isArray(p) ? p[0] : p;
      if (player) {
        const full = [player.first_name, player.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ");
        if (full) playerNameByEntry.set(id, full);
      }
    }
    const { data: gm } = await admin
      .from("pairing_group_members")
      .select("entry_id, pairing_groups ( group_no )")
      .in("entry_id", entryIds);
    for (const row of (gm ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.entry_id);
      const g = row.pairing_groups as
        | { group_no?: number }
        | { group_no?: number }[]
        | null;
      const grp = Array.isArray(g) ? g[0] : g;
      if (grp?.group_no != null) groupNoByEntry.set(id, Number(grp.group_no));
    }
  }
  const caddieNameById = new Map<string, string>();
  if (caddieIds.length > 0) {
    const { data: cs } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .in("id", caddieIds);
    for (const c of (cs ?? []) as Array<Record<string, unknown>>) {
      const full = [c.first_name, c.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (full) caddieNameById.set(String(c.id), full);
    }
  }

  function toRow(o: Record<string, unknown>): DisputeRow {
    const entryId = o.entry_id ? String(o.entry_id) : null;
    const caddieId = o.caddie_id ? String(o.caddie_id) : null;
    let name = "—";
    let kind: "player" | "caddie" | "anon" = "anon";
    let groupNo: number | null = null;
    if (entryId) {
      name =
        playerNameByEntry.get(entryId) ||
        String(o.client_label ?? "") ||
        "Jugador";
      kind = "player";
      groupNo = groupNoByEntry.get(entryId) ?? null;
    } else if (caddieId) {
      name =
        caddieNameById.get(caddieId) ||
        String(o.client_label ?? "") ||
        "Caddie";
      kind = "caddie";
    } else if (o.client_label) {
      name = String(o.client_label);
    }

    const history: HistoryEntry[] = [];
    if (o.created_at) history.push({ label: "Pedido creado", at: String(o.created_at) });
    if (o.accepted_at) history.push({ label: "Aceptado por venue", at: String(o.accepted_at) });
    if (o.ready_at) history.push({ label: "Listo en cocina", at: String(o.ready_at) });
    if (o.pending_acceptance_at)
      history.push({ label: "Entregado (esperando OK del cliente)", at: String(o.pending_acceptance_at) });
    if (o.delivered_at && o.status === "delivered")
      history.push({ label: "Cliente confirmó entrega", at: String(o.delivered_at) });
    if (o.disputed_at)
      history.push({ label: "Cliente reclamó pedido", at: String(o.disputed_at) });
    if (o.dispute_resolved_at)
      history.push({
        label: `Comité resolvió: ${String(o.dispute_resolution ?? "—")}`,
        at: String(o.dispute_resolved_at),
      });
    if (o.cancelled_at && o.status === "cancelled")
      history.push({ label: "Pedido cancelado", at: String(o.cancelled_at) });
    if (o.paid_at) history.push({ label: "Pagado", at: String(o.paid_at) });

    return {
      id: String(o.id),
      status: String(o.status),
      totalCents: Number(o.total_cents ?? 0),
      createdAt: String(o.created_at),
      deliveredAt: o.delivered_at ? String(o.delivered_at) : null,
      pendingAcceptanceAt: o.pending_acceptance_at
        ? String(o.pending_acceptance_at)
        : null,
      disputedAt: o.disputed_at ? String(o.disputed_at) : null,
      disputedReason: o.disputed_reason ? String(o.disputed_reason) : null,
      clientName: name,
      clientKind: kind,
      groupNo,
      venueName: venueNameById.get(String(o.venue_id)) ?? "—",
      items: linesByOrder.get(String(o.id)) ?? [],
      history,
    };
  }

  const active = ((activeRaw ?? []) as Array<Record<string, unknown>>).map(toRow);
  const resolved = ((resolvedRaw ?? []) as Array<Record<string, unknown>>).map(toRow);

  return <DisputasClient active={active} resolved={resolved} />;
}
