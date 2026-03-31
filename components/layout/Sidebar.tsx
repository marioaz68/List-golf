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

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [pathname]);

  const tournamentId = searchParams.get("tournament_id");

  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [loadingTournament, setLoadingTournament] = useState(false);

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

      if (!cancelled) {
        if (!error && data) {
          setTournament(data as TournamentMini);
        } else {
          setTournament(null);
        }
        setLoadingTournament(false);
      }
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

    {
      name: "Editar torneo",
      href: "/tournaments/edit",
      icon: FilePenLine,
      requiresTournament: true,
    },
    {
      name: "Setup torneo",
      href: "/tournaments/setup",
      icon: Settings,
      requiresTournament: true,
    },
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
        if (searchParams.get(key) !== value) return false;
      }
    }

    return true;
  }

  return (
    <aside className="w-64 bg-[#1C252D] text-white min-h-screen flex flex-col">
      <div className="px-6 py-6 border-b border-white/10">
        <Image
          src="/branding/logo/list-golf-logo.png"
          alt="list.golf"
          width={150}
          height={40}
        />
      </div>

      {tournamentId && (
        <div className="px-4 py-4 border-b border-white/10">
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-1">
            Torneo activo
          </div>

          <div className="text-sm font-semibold leading-5 text-white">
            {loadingTournament
              ? "Cargando torneo..."
              : tournament?.name || "Torneo sin nombre"}
          </div>

          {tournament?.status && (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {tournament.status}
              </span>
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menu
          .filter((item) => !item.requiresTournament || !!tournamentId)
          .map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            return (
              <Link
                key={`${item.name}-${item.href}-${JSON.stringify(item.query ?? {})}`}
                href={buildHref(item)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                  active
                    ? "bg-[#63BC46] text-black"
                    : "hover:bg-white/10 text-white/80"
                }`}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2">
        <Link
          href="/tournaments"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
            pathname === "/tournaments"
              ? "bg-[#63BC46] text-black"
              : "bg-[#111827] hover:bg-[#0b1220] text-white"
          }`}
        >
          <ArrowLeftCircle size={18} />
          Listado de torneos
        </Link>

        <div className="text-xs text-white/40 pt-2">list.golf</div>
      </div>
    </aside>
  );
}