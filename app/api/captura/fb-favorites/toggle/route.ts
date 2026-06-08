/**
 * POST /api/captura/fb-favorites/toggle
 *
 * Cliente fija o oculta un item de sus favoritos.
 *
 * Body:
 *   {
 *     entry_id?: string,
 *     caddie_id?: string,
 *     menu_item_id: string,
 *     action: 'pin' | 'unpin' | 'hide' | 'unhide'
 *   }
 *
 * Reglas:
 *  - 'pin'   → upsert (pinned). Si tenía hidden, se borra (no puede tener ambos).
 *  - 'hide'  → upsert (hidden). Si tenía pinned, se borra.
 *  - 'unpin' / 'unhide' → borra la fila correspondiente.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

type Action = "pin" | "unpin" | "hide" | "unhide";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const entryId = o.entry_id ? String(o.entry_id).trim() : null;
  const caddieId = o.caddie_id ? String(o.caddie_id).trim() : null;
  const menuItemId = String(o.menu_item_id ?? "").trim();
  const action = String(o.action ?? "").trim() as Action;

  if (!entryId && !caddieId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id o caddie_id." },
      { status: 400 }
    );
  }
  if (!menuItemId) {
    return NextResponse.json({ ok: false, error: "Falta menu_item_id." }, { status: 400 });
  }
  if (!["pin", "unpin", "hide", "unhide"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "action debe ser pin|unpin|hide|unhide." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const ownerCol = entryId ? "entry_id" : "caddie_id";
  const ownerVal = entryId ?? caddieId!;

  // unpin / unhide → DELETE
  if (action === "unpin" || action === "unhide") {
    const targetAction = action === "unpin" ? "pinned" : "hidden";
    const { error } = await admin
      .from("fb_favorite_actions")
      .delete()
      .eq(ownerCol, ownerVal)
      .eq("menu_item_id", menuItemId)
      .eq("action", targetAction);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // pin / hide → DELETE el opuesto si existe, INSERT el nuevo
  const newAction = action === "pin" ? "pinned" : "hidden";

  // Borrar cualquier acción anterior del cliente sobre este item (limpio).
  const { error: delErr } = await admin
    .from("fb_favorite_actions")
    .delete()
    .eq(ownerCol, ownerVal)
    .eq("menu_item_id", menuItemId);
  if (delErr) {
    console.error("FB FAV toggle delete:", delErr);
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  // Insertar el nuevo
  const { error: insErr } = await admin.from("fb_favorite_actions").insert({
    entry_id: entryId,
    caddie_id: caddieId,
    menu_item_id: menuItemId,
    action: newAction,
  });
  if (insErr) {
    console.error("FB FAV toggle insert:", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
