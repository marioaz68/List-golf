import type { AppMessages } from "@/lib/i18n/messages";
import type { AppModule } from "./permissions";

export type NavKey = keyof AppMessages["sidebar"]["nav"];

/** Módulo de permiso asociado a cada ítem del menú lateral. */
export const NAV_ITEM_MODULE: Record<NavKey, AppModule> = {
  dashboard: "tournaments",
  players: "players",
  entries: "entries",
  auction: "entries",
  teeSheet: "tee-sheet",
  scoreEntry: "score-entry",
  scorecards: "scorecards",
  leaderboard: "leaderboard",
  caddies: "caddies",
  ritmo: "ritmo",
  reports: "reports",
  tournaments: "tournaments",
  editTournament: "tournaments-setup",
  tournamentSetup: "tournaments-setup",
  convocatoria: "tournaments-setup",
  clubs: "catalog",
  courses: "catalog",
  categories: "tournaments-setup",
  rounds: "rounds",
  teeSets: "tournaments-setup",
  tournamentHoles: "tournaments-setup",
  cutRules: "tournaments-setup",
  competitionRules: "tournaments-setup",
  prizeRules: "tournaments-setup",
  categoryTemplates: "catalog",
  users: "users",
  handicapCommittee: "comite-handicap",
  capturaTelegram: "captura-telegram",
  fbAdmin: "fb",
  fbCocina: "fb",
  fbCuentas: "fb",
  fbNuevoPedido: "fb",
  fbReportes: "fb",
};
