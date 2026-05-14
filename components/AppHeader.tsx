import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";

export default async function AppHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user?.email ?? "Usuario";
  const initial = displayName.charAt(0).toUpperCase();

  const pillBase =
    "inline-flex min-h-10 min-w-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:rounded-[18px] sm:px-5 sm:text-base";

  return (
    <header className="border-b border-white/10 bg-[#08111f]/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
        <Link href="/" className="flex min-w-0 shrink-0 items-center">
          <Image
            src="/logo-main.png"
            alt="List.golf"
            width={150}
            height={50}
            priority
            className="h-auto w-auto max-w-[min(140px,42vw)] sm:max-w-[150px]"
          />
        </Link>

        <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {!user && (
            <Link href="/login" className={pillBase}>
              Entrar
            </Link>
          )}

          {user && (
            <>
              <Link href="/tournaments" className={pillBase}>
                Torneos
              </Link>

              <Link href="/users" className={pillBase}>
                Usuarios
              </Link>

              <div className="inline-flex min-h-10 max-w-full min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white sm:gap-3 sm:rounded-[18px] sm:px-4 sm:py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-sm font-bold text-[#08111f]">
                  {initial}
                </div>

                <span className="min-w-0 max-w-[min(12rem,45vw)] truncate text-sm font-semibold sm:max-w-[14rem] sm:text-base">
                  {displayName}
                </span>
              </div>

              <form action="/auth/signout" method="post" className="shrink-0">
                <button type="submit" className={pillBase}>
                  Salir
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
