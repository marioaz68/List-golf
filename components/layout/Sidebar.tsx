"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
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
} from "lucide-react";

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

export default function Sidebar() {
  const pathname = usePathname();

  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [searchMap, setSearchMap] = useState<Record<string, string>>({});
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [loadingTournament, setLoadingTournament] = useState(false);

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

  const menu: MenuItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Leaderboard", href: "/leaderboard", icon: ListOrdered },

    { name: "Torneos", href: "/tournaments", icon: Trophy },
    { name: "Clubs", href: "/clubs", icon: Building2 },
    { name: "Campos", href: "/courses", icon: MapPinned },

    { name: "Usuarios", href: "/users", icon: Shield },
    { name: "Plantillas cat.", href: "/category-templates", icon: Layers3 },

    { name: "Players", href: "/players", icon: Users, requiresTournament: true },
    { name: "Entries", href: "/entries", icon: ClipboardList, requiresTournament: true },

    { name: "Editar torneo", href: "/tournaments/edit", icon: FilePenLine, requiresTournament: true },
    { name: "Setup torneo", href: "/tournaments/setup", icon: Settings, requiresTournament: true },

    {
      name: "Categorías",
      href: "/categories",
      icon: Layers3,
      query: { tab: "editor" },
      requiresTournament: true,
    },

    { name: "Tee Sheet", href: "/tee-sheet", icon: Clock3, requiresTournament: true },
    { name: "Score Entry", href: "/score-entry", icon: PencilLine, requiresTournament: true },
    { name: "Rounds", href: "/rounds", icon: Trophy, requiresTournament: true },
    { name: "Tee Sets", href: "/tee-sets", icon: Trophy, requiresTournament: true },
    { name: "Hoyos torneo", href: "/tournament-holes", icon: Map, requiresTournament: true },
    { name: "Reglas de corte", href: "/cut-rules", icon: Scissors, requiresTournament: true },
    { name: "Reports", href: "/reports", icon: BarChart3, requiresTournament: true },
  ];

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

  const visibleMenu = menu.filter(
    (item) => !item.requiresTournament || !!tournamentId
  );

  // Ocultar sidebar solo en la página pública home
  if (pathname === "/") {
    return null;
  }

  return (
    <aside className="flex min-h-screen w-64 flex-col bg-[#1C252D] text-white">
      <div className="border-b border-white/10 px-6 py-6">
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

            <div className="text-sm font-semibold">
              {loadingTournament
                ? "Cargando..."
                : tournament?.name || "Sin nombre"}
            </div>

            {tournament?.status && (
              <div className="mt-2 text-[10px] uppercase text-white/60">
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleMenu.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <Link
              key={`${item.name}-${item.href}`}
              href={buildHref(item)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                active
                  ? "bg-[#63BC46] text-black"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              <Icon size={18} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Link
          href="/tournaments"
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
            pathname === "/tournaments"
              ? "bg-[#63BC46] text-black"
              : "text-white hover:bg-white/10"
          }`}
        >
          <ArrowLeftCircle size={18} />
          Listado de torneos
        </Link>

        <div className="mt-3 text-xs text-white/40">List.golf</div>
      </div>
    </aside>
  );
}