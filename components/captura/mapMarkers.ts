/** Marcadores Leaflet para bolas de golf (divIcon). */

const MARKER_CLASS = "yardage-ball-marker";

export function ensureBallMarkerStyles(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-yardage-ball-marker]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-yardage-ball-marker", "1");
  style.textContent = `
    .${MARKER_CLASS} {
      background: transparent !important;
      border: none !important;
    }
  `;
  document.head.appendChild(style);
}

export function ballMarkerOptions(
  L: { divIcon: (o: object) => unknown },
  html: string,
  size: number,
  anchorY = size / 2
) {
  return {
    icon: L.divIcon({
      className: MARKER_CLASS,
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, anchorY],
    }),
    interactive: false,
    zIndexOffset: 600,
  };
}

export function golfBallHtml(size = 16, ring = "#ffffff"): string {
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${r}" cy="${r}" r="${r - 1}" fill="#f5f5f0" stroke="${ring}" stroke-width="2"/>
    <circle cx="${r * 0.65}" cy="${r * 0.55}" r="${Math.max(1, r * 0.12)}" fill="#e8e8e0"/>
    <circle cx="${r * 1.2}" cy="${r * 0.85}" r="${Math.max(1, r * 0.1)}" fill="#e8e8e0"/>
    <circle cx="${r * 0.85}" cy="${r * 1.25}" r="${Math.max(1, r * 0.09)}" fill="#e8e8e0"/>
  </svg>`;
}

export function teeBallHtml(size = 16): string {
  const ball = golfBallHtml(size, "#22c55e");
  return `<div style="position:relative;width:${size}px;height:${size + 6}px;">
    <div style="position:absolute;bottom:0;left:50%;margin-left:-1.5px;width:3px;height:6px;background:#16a34a;border-radius:1px;"></div>
    ${ball}
  </div>`;
}

export function teeMarkerOptions(
  L: { divIcon: (o: object) => unknown },
  size = 18
) {
  const h = size + 6;
  return {
    icon: L.divIcon({
      className: MARKER_CLASS,
      html: teeBallHtml(size),
      iconSize: [size, h],
      iconAnchor: [size / 2, h - 2],
    }),
    interactive: false,
    zIndexOffset: 650,
  };
}

/** Bandera de pin en el centro del green (copa + asta + bandera roja). */
export function golfPinFlagHtml(yards?: number): string {
  const yardsLabel =
    yards != null
      ? `<div style="margin-top:1px;color:#fff;font-size:10px;font-weight:800;line-height:1;font-family:Arial,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.95),0 0 2px rgba(0,0,0,0.95);">${yards}</div>`
      : "";
  return `<div style="display:flex;flex-direction:column;align-items:center;width:38px;">
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="52" viewBox="0 0 38 52" aria-hidden="true">
      <defs>
        <linearGradient id="golfPinPole" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6b7280"/>
          <stop offset="35%" stop-color="#f9fafb"/>
          <stop offset="65%" stop-color="#d1d5db"/>
          <stop offset="100%" stop-color="#4b5563"/>
        </linearGradient>
        <linearGradient id="golfPinFlag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f87171"/>
          <stop offset="55%" stop-color="#dc2626"/>
          <stop offset="100%" stop-color="#991b1b"/>
        </linearGradient>
        <filter id="golfPinShadow" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0.5" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <ellipse cx="19" cy="48.8" rx="7.5" ry="2.6" fill="rgba(0,0,0,0.32)"/>
      <circle cx="19" cy="46.5" r="4.4" fill="#0f172a" stroke="#334155" stroke-width="0.85"/>
      <circle cx="19" cy="46.5" r="2.5" fill="#020617"/>
      <rect x="18.05" y="7.5" width="1.9" height="39" rx="0.95" fill="url(#golfPinPole)"/>
      <circle cx="19" cy="7.8" r="2.5" fill="#f3f4f6" stroke="#9ca3af" stroke-width="0.65"/>
      <path d="M20.3 10.2 C29.2 12.4 33.5 16.2 31.6 21.1 C29.9 25.5 24.2 28.2 20.3 26.8 L20.3 10.2 Z" fill="url(#golfPinFlag)" filter="url(#golfPinShadow)"/>
      <path d="M20.3 12.2 C27 14.2 29.5 16.8 28.2 20.5" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.95"/>
      <path d="M20.3 16.2 C24.8 17.6 26.5 19.5 25.5 22.2" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="0.75"/>
      <line x1="20.3" y1="10.2" x2="20.3" y2="26.8" stroke="rgba(127,29,29,0.35)" stroke-width="0.6"/>
    </svg>
    ${yardsLabel}
  </div>`;
}

export function golfPinFlagMarkerOptions(
  L: { divIcon: (o: object) => unknown },
  html: string
) {
  const w = 38;
  const h = 62;
  return {
    icon: L.divIcon({
      className: MARKER_CLASS,
      html,
      iconSize: [w, h],
      iconAnchor: [w / 2, 50],
    }),
    interactive: false,
    zIndexOffset: 720,
  };
}
