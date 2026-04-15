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
    "inline-flex h-12 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.03] px-5 text-base font-semibold text-white transition hover:bg-white/10";

  return (
    <header className="border-b border-white/10 bg-[#08111f]/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 py-4">

        {/* LOGO */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo-main.png"
            alt="List.golf"
            width={150}
            height={50}
            priority
            className="h-auto w-auto max-w-[150px]"
          />
        </Link>

        <div className="flex items-center gap-3">

          {/* 🔓 NO LOGUEADO */}
          {!user && (
            <Link href="/login" className={pillBase}>
              Entrar
            </Link>
          )}

          {/* 🔒 LOGUEADO */}
          {user && (
            <>
              {/* 🔥 NUEVO BOTÓN */}
              <Link href="/tournaments" className={pillBase}>
                Torneos
              </Link>

              <Link href="/users" className={pillBase}>
                Usuarios
              </Link>

              {/* USER BADGE */}
              <div className="inline-flex h-12 items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 text-white">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-sm font-bold text-[#08111f]">
                  {initial}
                </div>

                <span className="whitespace-nowrap text-base font-semibold">
                  {displayName}
                </span>
              </div>

              <form action="/auth/signout" method="post">
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