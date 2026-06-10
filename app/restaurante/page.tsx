/**
 * Página pública del Restaurante Hoyo 6 (Club Campestre de Querétaro).
 *
 * Cumple el requisito de Stripe de tener un sitio público que describa el
 * negocio: qué se vende (menú + precios), cómo se pide, cómo se paga, la
 * política de cancelación/reembolso y datos de contacto.
 *
 * Es pública (sin login). Lee el menú real de la base de datos.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  groupMenuByCategory,
  listCategories,
  listMenuItems,
  listVenues,
} from "@/lib/fb/queries";
import { formatPrice } from "@/lib/fb/types";
import { iconForCategory, iconForMenuItem } from "@/lib/fb/icons";
import {
  DEFAULT_BUSINESS_PROFILE,
  rowToBusinessProfile,
} from "@/lib/fb/businessProfile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Restaurante Hoyo 6 · List.Golf",
  description:
    "Menú del Restaurante Hoyo 6: comida, bebidas y snacks. Pide y paga con tarjeta desde tu celular: recoger en el restaurante, carrito bar en el campo o reparto a domicilio en el fraccionamiento.",
};

export default async function RestaurantePublicPage() {
  const admin = createAdminClient();
  const [venues, categories, items, profileRes] = await Promise.all([
    listVenues(admin, { onlyActive: true }),
    listCategories(admin, { onlyActive: true }),
    listMenuItems(admin, { onlyActive: true }),
    admin.from("fb_business_profile").select("*").limit(1).maybeSingle(),
  ]);
  const menu = groupMenuByCategory(categories, items);

  const profile = profileRes.data
    ? rowToBusinessProfile(profileRes.data as Record<string, unknown>)
    : DEFAULT_BUSINESS_PROFILE;
  const BUSINESS_NAME = profile.businessName;
  const CONTACT_EMAIL = profile.contactEmail ?? DEFAULT_BUSINESS_PROFILE.contactEmail!;
  const CONTACT_PHONE = profile.contactPhone ?? DEFAULT_BUSINESS_PROFILE.contactPhone!;
  const INTRO = profile.intro ?? DEFAULT_BUSINESS_PROFILE.intro!;
  const ADDRESS = profile.address ?? DEFAULT_BUSINESS_PROFILE.address!;
  const REFUND = profile.refundPolicy ?? DEFAULT_BUSINESS_PROFILE.refundPolicy!;

  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      {/* Barra superior: regreso al sistema de torneos */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-2.5">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
          >
            ← List.Golf · Torneos
          </Link>
          <span className="text-[11px] text-slate-500">Restaurante</span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-5 py-10">
          <div className="text-4xl">🍔⛳</div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {BUSINESS_NAME}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
            {INTRO}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              💳 Pago con tarjeta
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              💲 Precios en pesos mexicanos (MXN)
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              📲 Pedidos por Telegram
            </span>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-b border-white/10 bg-[#0b1526]">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <h2 className="text-lg font-bold">Cómo funciona</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">🏠</div>
              <h3 className="mt-2 text-sm font-semibold">Recoger en restaurante</h3>
              <p className="mt-1 text-xs text-slate-400">
                Pide y paga con tarjeta por adelantado. Recoge tu pedido en el
                Hoyo 6 cuando esté listo.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">🚚</div>
              <h3 className="mt-2 text-sm font-semibold">Carrito bar en el campo</h3>
              <p className="mt-1 text-xs text-slate-400">
                El carrito te lleva tu pedido al hoyo donde vas jugando. Pagas
                con tarjeta al cerrar tu cuenta.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl">🏡</div>
              <h3 className="mt-2 text-sm font-semibold">Reparto a domicilio</h3>
              <p className="mt-1 text-xs text-slate-400">
                Entrega dentro del fraccionamiento. Pago con tarjeta por
                adelantado.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <h3 className="font-semibold text-white">Pedidos y pagos</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-400">
              <li>
                Abre el menú en Telegram con el bot del club (escribe{" "}
                <span className="font-mono text-slate-200">menu</span>).
              </li>
              <li>Elige tus productos y el modo de entrega.</li>
              <li>
                Pagas con tarjeta de forma segura mediante Stripe (Visa,
                Mastercard, American Express).
              </li>
              <li>
                Recibes confirmación de tu pago y de tu pedido por Telegram.
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Menú */}
      <section className="bg-[#08111f]">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <h2 className="text-lg font-bold">Menú y precios</h2>
          <p className="mt-1 text-xs text-slate-400">
            Precios en pesos mexicanos (MXN), IVA incluido. Disponibilidad
            sujeta a existencias.
          </p>

          {menu.length === 0 ? (
            <p className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
              El menú se está actualizando. Vuelve pronto.
            </p>
          ) : (
            <div className="mt-6 space-y-8">
              {menu.map((g) => (
                <div key={g.category.id}>
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-cyan-300">
                    <span className="text-lg">{iconForCategory(g.category.code)}</span>
                    {g.category.name}
                  </h3>
                  <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {g.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-start justify-between gap-3 p-3"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="text-xl leading-none">
                            {it.displayEmoji ??
                              iconForMenuItem(it.name, g.category.code)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">
                              {it.name}
                            </div>
                            {it.description ? (
                              <p className="mt-0.5 text-xs text-slate-400">
                                {it.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-emerald-400">
                          {formatPrice(it.priceCents)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Políticas */}
      <section className="border-t border-white/10 bg-[#0b1526]">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <h2 className="text-lg font-bold">Cancelaciones y reembolsos</h2>
          <div className="mt-3 space-y-2 whitespace-pre-line text-xs text-slate-400">
            {REFUND}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section className="border-t border-white/10 bg-[#08111f]">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <h2 className="text-lg font-bold">Contacto</h2>
          <div className="mt-3 space-y-1 text-sm text-slate-300">
            <p>
              <span className="text-slate-500">Negocio:</span> {BUSINESS_NAME}
            </p>
            <p>
              <span className="text-slate-500">Correo:</span>{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-cyan-300 underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>
              <span className="text-slate-500">Teléfono:</span>{" "}
              <a href={`tel:${CONTACT_PHONE}`} className="text-cyan-300 underline">
                {CONTACT_PHONE}
              </a>
            </p>
          </div>
          <p className="mt-6 text-[11px] text-slate-500">
            Pagos procesados de forma segura por Stripe. {BUSINESS_NAME} ·{" "}
            {ADDRESS}.
          </p>
        </div>
      </section>
    </main>
  );
}
