"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import PlayerStats from "@/components/PlayerStats";
import { initTelegramWebApp } from "@/lib/telegram/miniapp";

/**
 * Pantalla de la Telegram Mini App: estadística personal del jugador.
 * Se abre desde el bot (@ListGolfBot). El SDK de Telegram inyecta el initData
 * firmado; el componente lo manda al servidor para identificar al jugador.
 *
 * URL sugerida para el botón de Mini App en el bot:
 *   https://TU-DOMINIO/mini/estadisticas
 */
export default function MiniAppStatsPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Si el SDK ya está cargado (navegación cliente), inicializa de una vez.
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      initTelegramWebApp();
      setReady(true);
    }
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          initTelegramWebApp();
          setReady(true);
        }}
      />
      <main
        className="mx-auto min-h-screen max-w-xl md:max-w-none md:mx-16 p-4 md:pt-16"
        style={{
          background: "var(--tg-theme-bg-color, #17171c)",
          color: "var(--tg-theme-text-color, #f2f2f7)",
        }}
      >
        <header className="mb-4">
          <h1 className="text-xl font-bold" style={{ color: "var(--tg-theme-text-color, #f2f2f7)" }}>
            Mis estadísticas
          </h1>
          <p className="text-sm" style={{ color: "var(--tg-theme-hint-color, #a8a8b3)" }}>
            Distancias, swing e historial de tus tiros.
          </p>
        </header>
        {ready ? (
          <PlayerStats />
        ) : (
          <div className="p-4 text-sm" style={{ color: "var(--tg-theme-hint-color, #a8a8b3)" }}>
            Conectando con Telegram…
          </div>
        )}
      </main>
    </>
  );
}
