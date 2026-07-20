// Helper mínimo para la Telegram Mini App (Web App) en el cliente.
// Lee el initData firmado y expone utilidades básicas del SDK de Telegram.

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
  initDataUnsafe?: { user?: { id: number; first_name?: string; last_name?: string } };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** El string initData firmado que se manda al servidor para validar. */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

/** Llamar al montar la Mini App: marca lista y expande a pantalla completa. */
export function initTelegramWebApp(): void {
  const wa = getTelegramWebApp();
  if (!wa) return;
  try {
    wa.ready();
    wa.expand();
  } catch {
    /* no-op */
  }
}
