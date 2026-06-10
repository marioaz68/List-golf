import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function PagoExitosoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const back = new URLSearchParams();
  if (sp.me) back.set("me", sp.me);
  if (sp.caddie) back.set("caddie", sp.caddie);
  if (sp.player) back.set("player", sp.player);
  if (sp.u) back.set("u", sp.u);
  const menuHref = `/captura/menu${back.toString() ? `?${back.toString()}` : ""}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 p-6">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
        <div className="text-4xl">✅</div>
        <h1 className="mt-3 text-lg font-bold text-slate-900">Pago recibido</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tu tarjeta fue cobrada correctamente. El club ya tiene tu pago
          registrado.
        </p>
        <Link
          href={menuHref}
          className="mt-5 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Volver al menú
        </Link>
      </div>
    </div>
  );
}
