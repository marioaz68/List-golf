export type InstallPlatform =
  | "ios"
  | "android"
  | "mac-safari"
  | "mac-chrome"
  | "mac-edge"
  | "mac-other"
  | "windows"
  | "other";

/** Plataforma para instrucciones de acceso directo / icono (solo cliente). */
export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) return "ios";

  if (/Android/i.test(ua)) return "android";

  const isMac = /Macintosh|Mac OS X/i.test(ua);
  if (isMac) {
    if (/Edg\//i.test(ua)) return "mac-edge";
    if (/Chrome|Chromium/i.test(ua) && !/Edg/i.test(ua)) return "mac-chrome";
    if (/Safari/i.test(ua)) return "mac-safari";
    return "mac-other";
  }

  if (/Windows/i.test(ua)) return "windows";

  return "other";
}

export function isMobileInstallPlatform(p: InstallPlatform): boolean {
  return p === "ios" || p === "android";
}
