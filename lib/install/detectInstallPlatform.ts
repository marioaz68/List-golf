export type InstallPlatform =
  | "ios"
  | "android"
  | "mac-safari"
  | "mac-chrome"
  | "mac-other"
  | "desktop-chrome"
  | "desktop-other";

export function detectInstallPlatform(ua: string): InstallPlatform {
  const u = ua.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(u) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);

  if (isIOS) return "ios";
  if (/android/.test(u)) return "android";

  const isMac = /macintosh|mac os x/.test(u);
  if (isMac) {
    if (/crios|chrome|chromium|edg\//.test(u) && !/safari/.test(u)) {
      return "mac-chrome";
    }
    if (/safari/.test(u) && !/chrome|crios|chromium|edg\//.test(u)) {
      return "mac-safari";
    }
    return "mac-other";
  }

  if (/chrome|crios|chromium|edg\//.test(u)) return "desktop-chrome";
  return "desktop-other";
}
