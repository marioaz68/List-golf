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
