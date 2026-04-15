import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function PublicNavbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  const initial = email ? email.charAt(0).toUpperCase() : "U";

  return (
    <header className="border-b border-white/10 bg-[#08111f]">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center">
          <img
            src="/logo-list-golf.png"
            alt="List Golf"
            className="h-24 w-auto object-contain"
          />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-cyan-400 px-6 text-base font-semibold text-[#08111f] transition hover:opacity-90"
          >
            Entrar
          </Link>

          {user ? (
            <>
              <Link
                href="/users"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-base font-medium text-white transition hover:bg-white/10"
              >
                Usuarios
              </Link>

              <div className="hidden md:flex h-12 items-center gap-4 rounded-full border border-white/10 bg-white/5 px-5 text-white">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 text-base font-bold text-[#08111f]">
                  {initial}
                </div>
                <span className="whitespace-nowrap text-base font-medium">
                  {email}
                </span>
              </div>

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-6 text-base font-semibold text-[#08111f] transition hover:opacity-90"
                >
                  Salir
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}