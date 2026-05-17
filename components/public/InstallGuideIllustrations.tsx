import type { ReactNode } from "react";

export type InstallVisualId =
  | "ios-share"
  | "ios-add-home"
  | "ios-confirm"
  | "android-menu"
  | "android-install"
  | "mac-file-dock"
  | "mac-dock-result"
  | "chrome-install"
  | "bookmark-bar";

type Props = {
  id: InstallVisualId;
  /** Resalta el control que el usuario debe tocar */
  highlightLabel?: string;
};

function HighlightRing({
  x,
  y,
  w,
  h,
  rx = 8,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={rx}
      fill="none"
      stroke="#22d3ee"
      strokeWidth="2.5"
      strokeDasharray="6 4"
      className="animate-pulse"
    />
  );
}

function PhoneChrome({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 280 200"
      className="mx-auto w-full max-w-[280px]"
      role="img"
      aria-hidden
    >
      <rect x="20" y="8" width="240" height="184" rx="24" fill="#1e293b" />
      <rect x="28" y="20" width="224" height="152" rx="12" fill="#0f172a" />
      {children}
      <rect x="108" y="176" width="64" height="4" rx="2" fill="#475569" />
    </svg>
  );
}

function MacChrome({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 300 180"
      className="mx-auto w-full max-w-[300px]"
      role="img"
      aria-hidden
    >
      <rect x="10" y="10" width="280" height="160" rx="10" fill="#1e293b" />
      <rect x="10" y="10" width="280" height="28" rx="10" fill="#334155" />
      <circle cx="28" cy="24" r="5" fill="#f87171" />
      <circle cx="44" cy="24" r="5" fill="#fbbf24" />
      <circle cx="60" cy="24" r="5" fill="#4ade80" />
      <text x="78" y="27" fill="#94a3b8" fontSize="10" fontFamily="system-ui">
        Safari — listgolf.club
      </text>
      <rect x="18" y="42" width="264" height="118" rx="6" fill="#0f172a" />
      {children}
    </svg>
  );
}

export function InstallGuideIllustration({ id, highlightLabel }: Props) {
  switch (id) {
    case "ios-share":
      return (
        <PhoneChrome>
          <text x="40" y="50" fill="#64748b" fontSize="9" fontFamily="system-ui">
            listgolf.club
          </text>
          <rect x="36" y="120" width="208" height="44" rx="10" fill="#1e293b" />
          <HighlightRing x={118} y={126} w={44} h={32} />
          {/* share icon: square + arrow up */}
          <rect
            x="128"
            y="134"
            width="16"
            height="14"
            rx="2"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2"
          />
          <path
            d="M136 134 L136 124 M128 130 L136 124 L144 130"
            stroke="#22d3ee"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {highlightLabel ? (
            <text
              x="140"
              y="118"
              fill="#22d3ee"
              fontSize="9"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              {highlightLabel}
            </text>
          ) : null}
        </PhoneChrome>
      );

    case "ios-add-home":
      return (
        <PhoneChrome>
          <rect x="36" y="28" width="208" height="120" rx="8" fill="#1e293b" />
          <text x="48" y="52" fill="#94a3b8" fontSize="8" fontFamily="system-ui">
            Compartir…
          </text>
          <HighlightRing x={44} y={88} w={192} h={22} rx={6} />
          <rect x="48" y="92" width="20" height="14" rx="3" fill="#334155" />
          <text x="76" y="104" fill="#22d3ee" fontSize="10" fontWeight="600" fontFamily="system-ui">
            Añadir a inicio
          </text>
        </PhoneChrome>
      );

    case "ios-confirm":
      return (
        <PhoneChrome>
          <rect x="36" y="24" width="208" height="128" rx="8" fill="#1e293b" />
          <text x="48" y="48" fill="#e2e8f0" fontSize="10" fontFamily="system-ui">
            List.golf
          </text>
          <HighlightRing x={168} y={32} w={64} h={22} rx={6} />
          <text
            x="176"
            y="47"
            fill="#22d3ee"
            fontSize="11"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            Añadir
          </text>
        </PhoneChrome>
      );

    case "android-menu":
      return (
        <PhoneChrome>
          <rect x="170" y="24" width="70" height="20" rx="4" fill="#1e293b" />
          <HighlightRing x={218} y={26} w={18} h={16} rx={4} />
          <text x="222" y="38" fill="#22d3ee" fontSize="14" fontFamily="system-ui">
            ⋮
          </text>
          {highlightLabel ? (
            <text x="40" y="40" fill="#22d3ee" fontSize="9" fontFamily="system-ui">
              {highlightLabel}
            </text>
          ) : null}
        </PhoneChrome>
      );

    case "android-install":
      return (
        <PhoneChrome>
          <rect x="100" y="40" width="120" height="90" rx="8" fill="#1e293b" stroke="#334155" />
          <HighlightRing x={108} y={72} w={104} h={22} rx={6} />
          <text x="116" y="87" fill="#22d3ee" fontSize="8" fontWeight="600" fontFamily="system-ui">
            Añadir a inicio
          </text>
        </PhoneChrome>
      );

    case "mac-file-dock":
      return (
        <MacChrome>
          <rect x="24" y="48" width="120" height="100" rx="6" fill="#1e293b" stroke="#475569" />
          <text x="32" y="68" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            Archivo
          </text>
          <text x="32" y="84" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            Editar
          </text>
          <HighlightRing x={28} y={92} w={108} h={20} rx={4} />
          <text x="36" y="106" fill="#22d3ee" fontSize="9" fontWeight="600" fontFamily="system-ui">
            Añadir al Dock…
          </text>
          <text x="24" y="28" fill="#64748b" fontSize="8" fontFamily="system-ui">
            Menú superior (no «Compartir» de iPhone)
          </text>
        </MacChrome>
      );

    case "mac-dock-result":
      return (
        <svg viewBox="0 0 300 100" className="mx-auto w-full max-w-[300px]" aria-hidden>
          <rect x="40" y="70" width="220" height="22" rx="11" fill="#334155" />
          <HighlightRing x={118} y={72} w={36} h={18} rx={6} />
          <rect x="124" y="76" width="24" height="14" rx="4" fill="#22d3ee" opacity="0.4" />
          <text x="128" y="87" fill="#22d3ee" fontSize="8" fontWeight="bold" fontFamily="system-ui">
            LG
          </text>
          <text x="40" y="62" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            Icono en el Dock de tu Mac
          </text>
        </svg>
      );

    case "chrome-install":
      return (
        <MacChrome>
          <rect x="200" y="48" width="76" height="24" rx="6" fill="#1e293b" />
          <HighlightRing x={204} y={50} w={68} h={20} rx={6} />
          <text x="210" y="64" fill="#22d3ee" fontSize="8" fontWeight="600" fontFamily="system-ui">
            Instalar ⊕
          </text>
          <text x="24" y="90" fill="#64748b" fontSize="8" fontFamily="system-ui">
            O menú ⋮ → «Instalar List.golf…»
          </text>
        </MacChrome>
      );

    case "bookmark-bar":
      return (
        <MacChrome>
          <rect x="24" y="48" width="252" height="14" rx="3" fill="#334155" />
          <HighlightRing x={28} y={49} w={80} h={12} rx={3} />
          <text x="32" y="58" fill="#22d3ee" fontSize="8" fontFamily="system-ui">
            ★ listgolf.club
          </text>
        </MacChrome>
      );

    default:
      return null;
  }
}
