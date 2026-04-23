export type AppRole =
  | "super_admin"
  | "club_admin"
  | "tournament_director"
  | "score_capture"
  | "checkin"
  | "viewer";

export type AppModule =
  | "users"
  | "tournaments"
  | "tournaments-setup"
  | "entries"
  | "rounds"
  | "score-entry";

export const MODULE_ACCESS: Record<AppModule, AppRole[]> = {
  users: ["super_admin", "club_admin", "tournament_director"],

  tournaments: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],

  "tournaments-setup": ["super_admin", "club_admin", "tournament_director"],

  entries: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "checkin",
  ],

  rounds: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],

  "score-entry": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
  ],
};

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;

  const valid: AppRole[] = [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "checkin",
    "viewer",
  ];

  return valid.includes(role as AppRole) ? (role as AppRole) : null;
}

export function getModuleFromPath(pathname: string): AppModule | null {
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/tournaments/setup")) return "tournaments-setup";
  if (pathname.startsWith("/tournaments")) return "tournaments";
  if (pathname.startsWith("/entries")) return "entries";
  if (pathname.startsWith("/rounds")) return "rounds";
  if (pathname.startsWith("/score-entry")) return "score-entry";

  return null;
}

export function canAccessModule(userRoles: string[], module: AppModule): boolean {
  const allowedRoles = MODULE_ACCESS[module];
  return userRoles.some((role) => allowedRoles.includes(role as AppRole));
}