import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function PagoCanceladoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const back = new URLSearchParams();
  if (sp.me) back.set("me", sp.me);
  if (sp.caddie) back.set("caddie", sp.caddie);
  if (sp.player) back.set("player", sp.player);
  if (sp.u) back.set("u", sp.u);
  const menuHref = `/captura/menu${back.toString() ? `?${back.toString()}` : ""}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 p-6">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
        <div className="text-4xl">↩️</div>
        <h1 className="mt-3 text-lg font-bold text-slate-900">Pago cancelado</h1>
        <p className="mt-2 text-sm text-slate-600">
          No se cobró tu tarjeta. Puedes intentar de nuevo cuando quieras.
        </p>
        <Link
          href={menuHref}
          className="mt-5 inline-block rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900"
        >
          Volver al menú
        </Link>
      </div>
    </div>
  );
}
