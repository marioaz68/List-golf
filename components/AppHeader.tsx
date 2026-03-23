import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function AppHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = user?.email ?? "Usuario";

  return (
    <header className="border-b border-white/20 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">

        <Link href="/" className="text-lg font-bold text-gray-900">
          Golf Torneos
        </Link>

        <div className="flex items-center gap-3">

          {user ? (
            <>
              <Link
                href="/users"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Usuarios
              </Link>

              <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-700 text-sm font-bold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                <span className="text-sm font-semibold text-gray-900">
                  {displayName}
                </span>
              </div>

              <form action="/auth/signout" method="post">
                <button className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
                  Salir
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Login
            </Link>
          )}

        </div>
      </div>
    </header>
  );
}