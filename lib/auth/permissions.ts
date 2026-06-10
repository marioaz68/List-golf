export type AppRole =
  | "super_admin"
  | "club_admin"
  | "tournament_director"
  | "score_capture"
  | "entries_operator"
  | "caddie_manager"
  | "checkin"
  | "viewer"
  | "handicap_committee"
  | "marshal"
  | "restaurante"        // MANAGER del restaurante — todo F&B sin filtrar
  | "mesero"             // staff de piso — /fb-mesero
  | "cocinero"           // staff de cocina — /fb-cocina + /fb-mesero
  | "operador_carrito";  // operador del cart bar — /captura/carrito

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
  | "ritmo"
  | "reports"
  | "comite-handicap"
  | "captura-telegram"
  | "fb"             // gate global — cualquier rol F&B pasa
  | "fb-manage"      // panel manager: admin, cuentas, reportes, disputas, mesas-qr
  | "fb-kitchen"     // vista cocina
  | "fb-waiter"      // vista mesero · restaurante
  | "fb-cart"        // mini app operador de carrito
  | "daily-rounds";  // rondas diarias del club (privadas — handicap WHS)

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
    "marshal",
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
    "marshal",
  ],

  "score-entry": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "marshal",
  ],

  scorecards: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "marshal",
  ],

  leaderboard: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "viewer",
    "marshal",
  ],

  caddies: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "caddie_manager",
  ],

  // Ritmo del campo: visible para todo el staff que opera el torneo.
  ritmo: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "score_capture",
    "entries_operator",
    "caddie_manager",
    "checkin",
    "viewer",
    "marshal",
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
    "marshal",
  ],

  // F&B (Food & Beverage): backoffice del menú + cocina + carrito bar.
  // Gate global — cualquier rol F&B autoriza entrar al backoffice; cada
  // pantalla se gatea con un sub-módulo más estricto (ver abajo).
  fb: [
    "super_admin",
    "club_admin",
    "tournament_director",
    "restaurante",
    "mesero",
    "cocinero",
    "operador_carrito",
  ],

  // Sub-módulos del F&B (cada item del sidebar usa uno).
  "fb-manage": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "restaurante",
  ],
  "fb-kitchen": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "restaurante",
    "cocinero",
  ],
  "fb-waiter": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "restaurante",
    "mesero",
    "cocinero",         // cocinero también puede mandar a entregar a la mesa
    "operador_carrito", // operador captura pedidos verbales desde su carrito
  ],
  "fb-cart": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "restaurante",
    "operador_carrito",
  ],

  // Rondas diarias del club: comité de handicap y staff del club.
  "daily-rounds": [
    "super_admin",
    "club_admin",
    "tournament_director",
    "handicap_committee",
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
  "/ritmo",
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
  "/fb-admin",
  "/fb-cocina",
  "/fb-carrito-bar",
  "/fb-cuentas",
  "/fb-nuevo-pedido",
  "/fb-reportes",
  "/fb-disputas",
  "/fb-mesero",
  "/fb-inventario",
  "/fb-fraccionamiento",
  "/fb-cuentas-deposito",
  "/rondas-diarias",
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
    "marshal",
    "restaurante",
    "mesero",
    "cocinero",
    "operador_carrito",
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
  if (pathname.startsWith("/ritmo")) return "ritmo";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/comite-handicap")) return "comite-handicap";
  if (pathname.startsWith("/captura-telegram")) return "captura-telegram";
  if (
    pathname.startsWith("/fb-admin") ||
    pathname.startsWith("/fb-cocina") ||
    pathname.startsWith("/fb-carrito-bar") ||
    pathname.startsWith("/fb-cuentas") ||
    pathname.startsWith("/fb-nuevo-pedido") ||
    pathname.startsWith("/fb-reportes") ||
    pathname.startsWith("/fb-disputas") ||
    pathname.startsWith("/fb-mesero") ||
    pathname.startsWith("/fb-inventario") ||
    pathname.startsWith("/fb-fraccionamiento") ||
    pathname.startsWith("/fb-cuentas-deposito")
  ) {
    return "fb";
  }
  if (pathname.startsWith("/rondas-diarias")) return "daily-rounds";
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
