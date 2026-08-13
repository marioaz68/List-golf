/** Votación de un torneo concreto (liga del poster). */
export function committeeVotePath(tournamentId: string): string {
  return `/comite-handicap?tournament_id=${encodeURIComponent(tournamentId)}`;
}

const TOURNAMENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Si el miembro solo-comité llegó desde el poster público
 * (`/torneos/{id}` o ya `/comite-handicap?tournament_id=`), úsalo.
 * No acepta URLs absolutas ni `//`.
 */
export function committeeLandingFromNext(raw: string | null | undefined): string | null {
  const next = String(raw ?? "").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return null;
  }

  const qIndex = next.indexOf("?");
  const pathname = (qIndex >= 0 ? next.slice(0, qIndex) : next).replace(/\/+$/, "") || "/";
  const search = qIndex >= 0 ? next.slice(qIndex + 1) : "";

  if (pathname === "/comite-handicap" || pathname.startsWith("/comite-handicap/")) {
    const tid = new URLSearchParams(search).get("tournament_id")?.trim() ?? "";
    if (tid && TOURNAMENT_ID_RE.test(tid)) return committeeVotePath(tid);
    return pathname === "/comite-handicap" ? "/comite-handicap" : null;
  }

  const pub = pathname.match(/^\/torneos\/([^/]+)/);
  const tourId = pub?.[1] ? decodeURIComponent(pub[1]).trim() : "";
  if (tourId && TOURNAMENT_ID_RE.test(tourId)) {
    return committeeVotePath(tourId);
  }

  return null;
}
