"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export async function setUserLocale(locale: Locale) {
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    /** Safari móvil en HTTPS suele ignorar cookies sin Secure en producción. */
    secure: process.env.NODE_ENV === "production",
  });
}
