/**
 * GET /api/fb-reportes/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Exporta el corte de F&B en un rango de fechas a Excel (.xlsx).
 * Dos hojas: "Resumen" (totales) y "Pedidos" (detalle por pedido).
 *
 * Solo para owner (super_admin, club_admin, tournament_director, o
 * restaurante con is_owner=true).
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/fb/types";

export const dynamic = "force-dynamic";

function todayMexicoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DELIVERY_LABELS: Record<string, string> = {
  pickup: "Recoger",
  on_course: "En campo",
  dine_in: "Mesa",
  home: "Domicilio",
};

function pesos(cents: number): number {
  return Math.round(cents) / 100;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const userId = user?.id ?? "";
  const userRoles = userId ? await getUserRoles(admin, userId) : [];
  const scope = await resolveFbScope(admin, userId, userRoles);
  if (!scope.isOwner) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const today = todayMexicoDate();
  const fromParam = request.nextUrl.searchParams.get("from")?.trim() || today;
  const toParam = request.nextUrl.searchParams.get("to")?.trim() || today;
  const [startDate, endDate] =
    fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam];

  const startISO = new Date(`${startDate}T00:00:00-06:00`).toISOString();
  const endISO = new Date(`${endDate}T23:59:59-06:00`).toISOString();

  const { data: ordersRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, delivery_type, client_label, venue_id, paid_method, paid_at"
    )
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: true });

  const orders = (ordersRaw ?? []) as Array<{
    id: string;
    status: string;
    total_cents: number;
    created_at: string;
    delivery_type: string;
    client_label: string | null;
    venue_id: string;
    paid_method: string | null;
    paid_at: string | null;
  }>;

  // Nombres de venues
  const venueIds = Array.from(new Set(orders.map((o) => o.venue_id))).filter(
    Boolean
  );
  const venueName = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: vs } = await admin
      .from("fb_venues")
      .select("id, name")
      .in("id", venueIds);
    for (const v of (vs ?? []) as Array<{ id: string; name: string }>) {
      venueName.set(String(v.id), String(v.name));
    }
  }

  // Totales
  let totalCobrado = 0;
  let totalPorCobrar = 0;
  let totalCancelado = 0;
  let totalDisputa = 0;
  for (const o of orders) {
    switch (o.status) {
      case "paid":
        totalCobrado += o.total_cents;
        break;
      case "cancelled":
        totalCancelado += o.total_cents;
        break;
      case "disputed":
        totalDisputa += o.total_cents;
        break;
      default:
        totalPorCobrar += o.total_cents;
        break;
    }
  }

  const fmtFecha = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "List.golf";

  // -------- Hoja Resumen --------
  const resumen = workbook.addWorksheet("Resumen");
  resumen.addRow(["Corte F&B"]);
  resumen.getRow(1).font = { bold: true, size: 14 };
  resumen.addRow([
    "Rango",
    startDate === endDate ? startDate : `${startDate} a ${endDate}`,
  ]);
  resumen.addRow(["Pedidos", orders.length]);
  resumen.addRow([]);
  resumen.addRow(["Concepto", "Monto (MXN)"]);
  resumen.getRow(5).font = { bold: true };
  resumen.addRow(["Cobrado", pesos(totalCobrado)]);
  resumen.addRow(["Por cobrar", pesos(totalPorCobrar)]);
  resumen.addRow(["Cancelado", pesos(totalCancelado)]);
  resumen.addRow(["En disputa", pesos(totalDisputa)]);
  resumen.addRow([
    "Ventas (cobrado + por cobrar)",
    pesos(totalCobrado + totalPorCobrar),
  ]);
  resumen.getColumn(1).width = 32;
  resumen.getColumn(2).width = 18;
  resumen.getColumn(2).numFmt = "#,##0.00";

  // -------- Hoja Pedidos --------
  const sheet = workbook.addWorksheet("Pedidos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const columns = [
    "Fecha",
    "Pedido",
    "Cliente",
    "Venue",
    "Entrega",
    "Estado",
    "Método pago",
    "Total (MXN)",
  ] as const;
  sheet.addRow([...columns]);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2EFDA" },
  };

  for (const o of orders) {
    sheet.addRow([
      fmtFecha(o.created_at),
      o.id.slice(0, 8),
      o.client_label ?? "—",
      venueName.get(o.venue_id) ?? "—",
      DELIVERY_LABELS[o.delivery_type] ?? o.delivery_type,
      ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status,
      o.paid_method ?? "—",
      pesos(o.total_cents),
    ]);
  }

  // Fila total
  const totalRow = sheet.addRow([
    "",
    "",
    "",
    "",
    "",
    "",
    "TOTAL COBRADO",
    pesos(totalCobrado),
  ]);
  totalRow.font = { bold: true };

  const widths = [18, 12, 26, 18, 12, 24, 16, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
  sheet.getColumn(8).numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename =
    startDate === endDate
      ? `corte_fb_${startDate}.xlsx`
      : `corte_fb_${startDate}_a_${endDate}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
