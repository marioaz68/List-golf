"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
  ClipboardList,
  ArrowLeftCircle,
  Settings,
  Shield,
  FilePenLine,
  Building2,
  MapPinned,
  Repeat2,
  ExternalLink,
  CalendarDays,
  UsersRound,
  Car,
} from "lucide-react";

type SidebarMode = "operation" | "setup";

type MenuItem = {
  name: string;
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
  const pathname = usePathname();

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

  const operationMenu: MenuItem[] = useMemo(
    () => [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Players", href: "/players", icon: Users, requiresTournament: true },
      { name: "Entries", href: "/entries", icon: ClipboardList, requiresTournament: true },
      { name: "Pairings", href: "/pairings", icon: UsersRound, requiresTournament: true },
      { name: "Tee Sheet", href: "/tee-sheet", icon: Clock3, requiresTournament: true },
      { name: "Score Entry", href: "/score-entry", icon: PencilLine, requiresTournament: true },
      { name: "Scorecards", href: "/scorecards", icon: FilePenLine, requiresTournament: true },
      { name: "Leaderboard", href: "/leaderboard", icon: ListOrdered, requiresTournament: true },
      { name: "Caddies", href: "/caddies", icon: Car, requiresTournament: true },
      { name: "Reports", href: "/reports", icon: BarChart3, requiresTournament: true },
    ],
    []
  );

  const setupMenu: MenuItem[] = useMemo(
    () => [
      { name: "Torneos", href: "/tournaments", icon: Trophy },
      { name: "Editar torneo", href: "/tournaments/edit", icon: FilePenLine, requiresTournament: true },
      { name: "Setup torneo", href: "/tournaments/setup", icon: Settings, requiresTournament: true },
      { name: "Clubs", href: "/clubs", icon: Building2 },
      { name: "Campos", href: "/courses", icon: MapPinned },
      {
        name: "Categorías",
        href: "/categories",
        icon: Layers3,
        query: { tab: "editor" },
        requiresTournament: true,
      },
      { name: "Rounds", href: "/rounds", icon: CalendarDays, requiresTournament: true },
      { name: "Tee Sets", href: "/tee-sets", icon: Trophy, requiresTournament: true },
      { name: "Hoyos torneo", href: "/tournament-holes", icon: Map, requiresTournament: true },
      { name: "Reglas de corte", href: "/cut-rules", icon: Scissors, requiresTournament: true },
      { name: "Plantillas cat.", href: "/category-templates", icon: Layers3 },
      { name: "Usuarios", href: "/users", icon: Shield },
      { name: "Reports", href: "/reports", icon: BarChart3, requiresTournament: true },
    ],
    []
  );

  const menu = mode === "operation" ? operationMenu : setupMenu;

  function setSidebarMode(nextMode: SidebarMode) {
    setMode(nextMode);

    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // localStorage puede fallar en modo privado; no bloqueamos el cambio visual.
    }
  }

  function buildHref(item: MenuItem) {
    const params = new URLSearchParams();

    if (tournamentId && item.requiresTournament) {
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
    return tournamentId ? `/torneos/${tournamentId}` : "/tournaments";
  }

  const visibleMenu = menu.filter(
    (item) => !item.requiresTournament || !!tournamentId
  );

  const modeLabel = mode === "operation" ? "Operación" : "Configuración";
  const nextMode: SidebarMode = mode === "operation" ? "setup" : "operation";
  const nextModeLabel = nextMode === "operation" ? "Operación" : "Configuración";

  if (pathname === "/") {
    return null;
  }

  return (
    <aside className="flex min-h-screen w-64 flex-col bg-[#1C252D] text-white">
      <div className="border-b border-white/10 px-6 py-5">
        <Link href="/tournaments" className="flex items-center">
          <Image
            src="/logo-main.png"
            alt="List.golf"
            width={150}
            height={48}
            priority
          />
        </Link>
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        {tournamentId ? (
          <>
            <div className="text-xs uppercase tracking-wide text-white/40">
              Torneo activo
            </div>

            <div className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
              {loadingTournament
                ? "Cargando..."
                : tournament?.name || "Sin nombre"}
            </div>

            {tournament?.status && (
              <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase text-white/60">
                {tournament.status}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-white/35">
            Sin torneo seleccionado
          </div>
        )}
      </div>

      <div className="border-b border-white/10 px-3 py-3">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Modo {modeLabel}
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
            Operación
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
            Config.
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleMenu.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={`${item.name}-${item.href}`}
              href={buildHref(item)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                active
                  ? "bg-[#63BC46] text-black"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              <Icon size={18} />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}

        {visibleMenu.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/50">
            Selecciona un torneo para ver este menú.
          </div>
        ) : null}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-4">
        <Link
          href={buildPublicTournamentHref()}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
            pathname.startsWith("/torneos/")
              ? "bg-[#63BC46] text-black"
              : "text-white/85 hover:bg-white/10"
          } ${!tournamentId ? "opacity-60" : ""}`}
        >
          <ExternalLink size={18} />
          Página pública
        </Link>

        <button
          type="button"
          onClick={() => setSidebarMode(nextMode)}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-white/85 hover:bg-white/10"
        >
          <Repeat2 size={18} />
          Cambiar a {nextModeLabel}
        </button>

        <Link
          href="/tournaments"
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
            pathname === "/tournaments"
              ? "bg-[#63BC46] text-black"
              : "text-white/85 hover:bg-white/10"
          }`}
        >
          <ArrowLeftCircle size={18} />
          Listado de torneos
        </Link>

        <div className="pt-1 text-xs text-white/35">List.golf</div>
      </div>
    </aside>
  );
}
