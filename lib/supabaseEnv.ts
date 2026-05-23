/** Variables mínimas para cliente Supabase en servidor/edge. */
export function hasPublicSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function missingPublicSupabaseEnvMessage(): string {
  return (
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno " +
    "(revisa Vercel → Settings → Environment Variables para Production)."
  );
}
