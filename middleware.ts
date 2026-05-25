import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getUserRoles } from "@/lib/auth/getUserRoles";
import {
  canAccessAnyBackofficeModule,
  canAccessModule,
  getModuleFromPath,
  isBackofficePath,
} from "@/lib/auth/permissions";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const module = getModuleFromPath(pathname);
  const needsAuth = isBackofficePath(pathname);

  // Rutas públicas: no crear cliente Supabase (evita tumbar "/" si falla env/cookies).
  if (!needsAuth && !module) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!module) {
    return response;
  }

  const roles = await getUserRoles(supabase, user.id);

  if (!canAccessModule(roles, module)) {
    const fallback = roles.includes("handicap_committee")
      ? "/comite-handicap"
      : canAccessAnyBackofficeModule(roles)
        ? "/tournaments"
        : "/login";
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
