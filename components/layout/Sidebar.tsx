"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAppLocale } from "@/components/i18n/AppLocaleProvider";
import { useBackofficeNav } from "@/components/layout/BackofficeNavContext";
import { canAccessModule } from "@/lib/auth/permissions";
import { NAV_ITEM_MODULE, type NavKey } from "@/lib/auth/navModules";
import { useBackofficeRoles } from "@/components/layout/BackofficeRolesContext";
import {
  LayoutDashboard,
  Trophy,
  Users,
  Clock3,
  ListOrdered,
  Layers3,
  PencilLine,
  BarChart3,
  Map,
  Scissors,
  Medal,
  ClipboardList,
  ArrowLeftCircle,
  Settings,
  Shield,
  FilePenLine,
  FileText,
  Building2,
  MapPinned,
  Repeat2,
  ExternalLink,
  CalendarDays,
  Car,
  X,
} from "lucide-react";

type SidebarMode = "operation" | "setup";

type MenuItem = {
  nameKey: NavKey;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  query?: Record<string, string>;
  requiresTournament?: boolean;
};

type TournamentMini = {
  id: string;
  name: string | null;
  status: string | null;
};

const STORAGE_KEY = "listgolf_sidebar_mode";

export default function Sidebar() {
  const { t } = useAppLocale();
  const pathname = usePathname();
  const { open, setOpen } = useBackofficeNav();
  const roles = useBackofficeRoles();

  const [mode, setMode] = useState<SidebarMode>("operation");
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [searchMap, setSearchMap] = useState<Record<string, string>>({});
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [loadingTournament, setLoadingTournament] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "operation" || saved === "setup") {
        setMode(saved);
      }
    } catch {
      // localStorage puede fallar en modo privado; no bloqueamos el sidebar.
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const map: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      map[key] = value;
    }

    setSearchMap(map);
    setTournamentId(params.get("tournament_id"));
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadTournament() {
      if (!tournamentId) {
        setTournament(null);
        return;
      }

      setLoadingTournament(true);

      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, status")
        .eq("id", tournamentId)
        .single();

      if (cancelled) return;

      if (!error && data) {
        setTournament(data as TournamentMini);
      } else {
        setTournament(null);
      }

      setLoadingTournament(false);
    }

    loadTournament();

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  /** Navegación diaria del torneo (misma lista en Operación y en Config.). */
  const tournamentOperationNav: MenuItem[] = useMemo(
    () => [
      { nameKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        nameKey: "players",
        href: "/players",
        icon: Users,
        requiresTournament: true,
      },
      {
        nameKey: "entries",
        href: "/entries",
        icon: ClipboardList,
        requiresTournament: true,
      },
      {
        nameKey: "teeSheet",
        href: "/tee-sheet",
        icon: Clock3,
        requiresTournament: true,
      },
      {
        nameKey: "scoreEntry",
        href: "/score-entry",
        icon: PencilLine,
        requiresTournament: true,
      },
      {
        nameKey: "scorecards",
        href: "/scorecards",
        icon: FilePenLine,
        requiresTournament: true,
      },
      {
        nameKey: "leaderboard",
        href: "/leaderboard",
        icon: ListOrdered,
        requiresTournament: true,
      },
      {
        nameKey: "caddies",
        href: "/caddies",
        icon: Car,
        requiresTournament: true,
      },
      {
        nameKey: "reports",
        href: "/reports",
        icon: BarChart3,
        requiresTournament: true,
      },
    ],
    []
  );

  /** Solo modo Config.: módulos de armado del torneo (después de la navegación operativa). */
  const setupExclusiveNav: MenuItem[] = useMemo(
    () => [
      { nameKey: "tournaments", href: "/tournaments", icon: Trophy },
      {
        nameKey: "editTournament",
        href: "/tournaments/edit",
        icon: FilePenLine,
        requiresTournament: true,
      },
      {
        nameKey: "tournamentSetup",
        href: "/tournaments/setup",
        icon: Settings,
        requiresTournament: true,
      },
      {
        nameKey: "convocatoria",
        href: "/convocatoria",
        icon: FileText,
        requiresTournament: true,
      },
      { nameKey: "clubs", href: "/clubs", icon: Building2 },
      { nameKey: "courses", href: "/courses", icon: MapPinned },
      {
        nameKey: "categories",
        href: "/categories",
        icon: Layers3,
        query: { tab: "editor" },
        requiresTournament: true,
      },
      {
        nameKey: "rounds",
        href: "/rounds",
        icon: CalendarDays,
        requiresTournament: true,
      },
      {
        nameKey: "teeSets",
        href: "/tee-sets",
        icon: Trophy,
        requiresTournament: true,
      },
      {
        nameKey: "tournamentHoles",
        href: "/tournament-holes",
        icon: Map,
        requiresTournament: true,
      },
      {
        nameKey: "cutRules",
        href: "/cut-rules",
        icon: Scissors,
        requiresTournament: true,
      },
      {
        nameKey: "competitionRules",
        href: "/competition-rules",
        icon: Medal,
        requiresTournament: true,
      },
      {
        nameKey: "prizeRules",
        href: "/prize-rules",
        icon: Medal,
        requiresTournament: true,
      },
      {
        nameKey: "categoryTemplates",
        href: "/category-templates",
        icon: Layers3,
      },
      { nameKey: "users", href: "/users", icon: Shield },
    ],
    []
  );

  function setSidebarMode(nextMode: SidebarMode) {
    setMode(nextMode);
    setOpen(false);

    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // localStorage puede fallar en modo privado; no bloqueamos el cambio visual.
    }
  }

  function buildHref(item: MenuItem) {
    const params = new URLSearchParams();

    // Mantener torneo activo en la URL en todo el backoffice (p. ej. /clubs, /courses).
    // Si no, al salir de pantallas "catálogo" se pierde tournament_id y en modo Operación
    // desaparecen inscripciones, salidas, etc. (solo quedan ítems sin requiresTournament).
    if (tournamentId) {
      params.set("tournament_id", tournamentId);
    }

    if (item.query) {
      for (const [key, value] of Object.entries(item.query)) {
        params.set(key, value);
      }
    }

    const qs = params.toString();
    return qs ? `${item.href}?${qs}` : item.href;
  }

  function isActive(item: MenuItem) {
    if (pathname !== item.href) return false;

    if (item.query) {
      for (const [key, value] of Object.entries(item.query)) {
        if (searchMap[key] !== value) return false;
      }
    }

    return true;
  }

  function buildPublicTournamentHref() {
    return tournamentId ? `/torneos/${tournamentId}` : "/";
  }

  const operationVisible = useMemo(
    () =>
      tournamentOperationNav.filter((item) => {
        if (item.requiresTournament && !tournamentId) return false;
        return canAccessModule(roles, NAV_ITEM_MODULE[item.nameKey]);
      }),
    [tournamentOperationNav, tournamentId, roles]
  );

  const visibleMenu = useMemo(() => {
    if (mode === "operation") return operationVisible;
    const setupOnlyVisible = setupExclusiveNav.filter((item) => {
      if (item.requiresTournament && !tournamentId) return false;
      return canAccessModule(roles, NAV_ITEM_MODULE[item.nameKey]);
    });
    return [...operationVisible, ...setupOnlyVisible];
  }, [mode, operationVisible, setupExclusiveNav, tournamentId, roles]);

  const operationVisibleCount = operationVisible.length;

  const modeLabel =
    mode === "operation" ? t.sidebar.operation : t.sidebar.configuration;
  const nextMode: SidebarMode = mode === "operation" ? "setup" : "operation";
  const nextModeLabel =
    nextMode === "operation" ? t.sidebar.operation : t.sidebar.configuration;

  if (pathname === "/") {
    return null;
  }

  return (
    <aside
      className={`flex min-h-0 flex-col border-r border-white/10 bg-[#1C252D] text-white shadow-2xl transition-transform duration-200 ease-out md:shadow-none w-[min(19rem,88vw)] shrink-0 md:w-64 fixed inset-y-0 left-0 z-40 h-dvh overflow-y-auto overscroll-y-contain md:static md:z-auto md:h-auto md:min-h-screen md:max-h-none ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-4 md:px-6 md:py-5">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/tournaments"
            className="flex min-w-0 flex-1 items-center"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logo-main.png"
              alt="List.golf"
              width={150}
              height={48}
              priority
              className="h-8 w-auto max-w-[120px] object-contain md:h-auto md:max-w-[150px]"
            />
          </Link>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-white/10 p-2 text-white/80 transition hover:bg-white/10 md:hidden"
            aria-label={t.sidebar.closeMenu}
            onClick={() => setOpen(false)}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        {tournamentId ? (
          <>
            <div className="text-xs uppercase tracking-wide text-white/40">
              {t.sidebar.activeTournament}
            </div>

            <div className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
              {loadingTournament
                ? t.sidebar.loading
                : tournament?.name || t.sidebar.noName}
            </div>

            {tournament?.status && (
              <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase text-white/60">
                {tournament.status}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-white/35">
            {t.sidebar.noTournament}
          </div>
        )}
      </div>

      <div className="border-b border-white/10 px-3 py-3">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {t.sidebar.modePrefix} {modeLabel}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setSidebarMode("operation")}
            className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
              mode === "operation"
                ? "bg-[#63BC46] text-black shadow-sm"
                : "text-white/70 hover:bg-white/10"
            }`}
          >
            {t.sidebar.operation}
          </button>

          <button
            type="button"
            onClick={() => setSidebarMode("setup")}
            className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
              mode === "setup"
                ? "bg-[#63BC46] text-black shadow-sm"
                : "text-white/70 hover:bg-white/10"
            }`}
          >
            {t.sidebar.configShort}
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleMenu.map((item, idx) => {
          const Icon = item.icon;
          const active = isActive(item);
          const showSetupHeading =
            mode === "setup" &&
            idx === operationVisibleCount &&
            visibleMenu.length > operationVisibleCount;

          return (
            <Fragment key={`${item.nameKey}-${item.href}`}>
              {showSetupHeading ? (
                <div
                  className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40"
                  role="presentation"
                >
                  {t.sidebar.setupSection}
                </div>
              ) : null}
              <Link
                href={buildHref(item)}
                onClick={() => setOpen(false)}
                className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition md:px-4 md:py-3 ${
                  active
                    ? "bg-[#63BC46] text-black"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                <span className="flex shrink-0">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate leading-snug">
                  {t.sidebar.nav[item.nameKey]}
                </span>
              </Link>
            </Fragment>
          );
        })}

        {visibleMenu.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/50">
            {t.sidebar.selectTournamentHint}
          </div>
        ) : null}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-4">
        <Link
          href={buildPublicTournamentHref()}
          onClick={() => setOpen(false)}
          className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm md:px-4 md:py-3 ${
            pathname.startsWith("/torneos/") || pathname === "/"
              ? "bg-[#63BC46] text-black"
              : "text-white/85 hover:bg-white/10"
          }`}
        >
          <span className="flex shrink-0">
            <ExternalLink size={18} />
          </span>
          <span className="min-w-0 flex-1 truncate">{t.sidebar.publicPage}</span>
        </Link>

        <button
          type="button"
          onClick={() => setSidebarMode(nextMode)}
          className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/85 hover:bg-white/10 md:px-4 md:py-3"
        >
          <span className="flex shrink-0">
            <Repeat2 size={18} />
          </span>
          <span className="min-w-0 flex-1 break-words leading-snug">
            {t.sidebar.switchTo} {nextModeLabel}
          </span>
        </button>

        <Link
          href="/tournaments"
          onClick={() => setOpen(false)}
          className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm md:px-4 md:py-3 ${
            pathname === "/tournaments"
              ? "bg-[#63BC46] text-black"
              : "text-white/85 hover:bg-white/10"
          }`}
        >
          <span className="flex shrink-0">
            <ArrowLeftCircle size={18} />
          </span>
          <span className="min-w-0 flex-1 truncate">{t.sidebar.listTournaments}</span>
        </Link>

        <div className="pt-1 text-xs text-white/35">{t.sidebar.brand}</div>
      </div>
    </aside>
  );
}
