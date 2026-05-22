/** Consultas `.in()` por lotes para evitar URLs PostgREST demasiado largas. */
export async function queryInChunks<T>(
  ids: string[],
  chunkSize: number,
  run: (
    chunk: string[]
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };

  const collected: T[] = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await run(chunk);
    if (error) {
      return { data: collected, error: error.message };
    }
    collected.push(...(data ?? []));
  }

  return { data: collected, error: null };
}
