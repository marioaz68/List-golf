export type AppRole =
  | "super_admin"
  | "club_admin"
  | "tournament_director"
  | "score_capture"
  | "entries_operator"
  | "caddie_manager"
  | "checkin"
  | "viewer"
  | "handicap_committee";

export type AppModule =
  | "users"
  | "tournaments"
  | "tournaments-setup"
  | "catalog"
  | "entries"
  | "players"
  | "rounds"
  | "tee-sheet"
  | "score-entry"
  | "scorecards"
  | "leaderboard"
  | "caddies"
  | "reports"
  | "comite-handicap"
  | "captura-telegram";

const ENTRIES_ROLES: AppRole[] = [
  "super_admin",
  "club_admin",
  "tournament_director",
  "entries_operator",
  "score_capture",
  "caddie_manager",
  "checkin",
];

const SETUP_ROLES: AppRole[] = [
  "super_admin",
  "club_admin",
  "tournament_director",
];

export const MODULE_ACCESS: Record<AppModule, AppRole[]> = {
  users: ["super_admin", "club_admin", "tournament_director"],

  tournaments: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "entries_operator",
    "caddie_manager",
    "viewer",
  ],

  "tournaments-setup": SETUP_ROLES,

  catalog: SETUP_ROLES,

  entries: ENTRIES_ROLES,

  players: ENTRIES_ROLES,

  rounds: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "entries_operator",
    "score_capture",
    "caddie_manager",
  ],

  "tee-sheet": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "entries_operator",
    "score_capture",
    "caddie_manager",
  ],

  "score-entry": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],

  scorecards: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],

  leaderboard: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "viewer",
  ],

  caddies: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "caddie_manager",
  ],

  reports: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],

  "comite-handicap": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "handicap_committee",
  ],

  "captura-telegram": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "caddie_manager",
  ],
};

/** Rutas del backoffice que exigen sesión (cualquier módulo). */
export const BACKOFFICE_PATH_PREFIXES = [
  "/dashboard",
  "/players",
  "/entries",
  "/tee-sheet",
  "/score-entry",
  "/scorecards",
  "/leaderboard",
  "/caddies",
  "/reports",
  "/tournaments",
  "/convocatoria",
  "/clubs",
  "/courses",
  "/categories",
  "/rounds",
  "/tee-sets",
  "/tournament-holes",
  "/cut-rules",
  "/competition-rules",
  "/prize-rules",
  "/category-templates",
  "/category-tee-rules",
  "/course-holes",
  "/users",
  "/comite-handicap",
  "/captura-telegram",
] as const;

export function isBackofficePath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;

  const valid: AppRole[] = [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "entries_operator",
    "caddie_manager",
    "checkin",
    "viewer",
    "handicap_committee",
  ];

  return valid.includes(role as AppRole) ? (role as AppRole) : null;
}

export function getModuleFromPath(pathname: string): AppModule | null {
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/tournaments/setup")) return "tournaments-setup";
  if (pathname.startsWith("/tournaments/staff")) return "tournaments-setup";
  if (pathname.startsWith("/tournaments")) return "tournaments";
  if (pathname.startsWith("/entries")) return "entries";
  if (pathname.startsWith("/players")) return "players";
  if (pathname.startsWith("/rounds")) return "rounds";
  if (pathname.startsWith("/tee-sheet")) return "tee-sheet";
  if (pathname.startsWith("/score-entry")) return "score-entry";
  if (pathname.startsWith("/scorecards")) return "scorecards";
  if (pathname.startsWith("/leaderboard")) return "leaderboard";
  if (pathname.startsWith("/caddies")) return "caddies";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/comite-handicap")) return "comite-handicap";
  if (pathname.startsWith("/captura-telegram")) return "captura-telegram";
  if (pathname.startsWith("/dashboard")) return "tournaments";

  if (
    pathname.startsWith("/clubs") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/category-templates") ||
    pathname.startsWith("/course-holes")
  ) {
    return "catalog";
  }

  if (
    pathname.startsWith("/convocatoria") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/tee-sets") ||
    pathname.startsWith("/tournament-holes") ||
    pathname.startsWith("/cut-rules") ||
    pathname.startsWith("/competition-rules") ||
    pathname.startsWith("/prize-rules") ||
    pathname.startsWith("/category-tee-rules")
  ) {
    return "tournaments-setup";
  }

  return null;
}

export function canAccessModule(
  userRoles: string[],
  module: AppModule
): boolean {
  const allowedRoles = MODULE_ACCESS[module];
  return userRoles.some((role) => allowedRoles.includes(role as AppRole));
}

export function canAccessAnyBackofficeModule(userRoles: string[]): boolean {
  return (Object.keys(MODULE_ACCESS) as AppModule[]).some((module) =>
    canAccessModule(userRoles, module)
  );
}
