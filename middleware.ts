import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getUserRoles } from "@/lib/auth/getUserRoles";
import { getModuleFromPath, canAccessModule } from "@/lib/auth/permissions";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const module = getModuleFromPath(pathname);

  if (!module) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const roles = await getUserRoles(supabase, user.id);

  if (!canAccessModule(roles, module)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/users/:path*",
    "/tournaments/:path*",
    "/entries/:path*",
    "/rounds/:path*",
    "/score-entry/:path*",
  ],
};