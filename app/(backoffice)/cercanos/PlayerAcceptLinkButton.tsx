"use client";

import { useState } from "react";

/** Link + QR para que el jugador acepte en SU teléfono. */
export default function PlayerAcceptLinkButton({
  url,
  playerName,
  distanceLabel,
}: {
  url: string;
  playerName: string;
  distanceLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      window.prompt("Copia este enlace:", url);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-violet-400/40 bg-violet-950/50 px-2 py-1 text-[11px] font-bold text-violet-100 hover:bg-violet-900/50"
      >
        QR / link jugador
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Link de aceptación del jugador"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl border border-white/15 bg-[#0f172a] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">{playerName}</div>
                <div className="text-[11px] text-slate-400">
                  Aceptar distancia · {distanceLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="flex justify-center rounded-xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="QR para que el jugador acepte la distancia"
                width={220}
                height={220}
                className="h-[220px] w-[220px]"
              />
            </div>

            <p className="text-center text-[11px] text-slate-400">
              El jugador escanea este QR en <strong>su</strong> teléfono y
              acepta la medida. No es Telegram.
            </p>

            <div className="break-all rounded-lg border border-white/10 bg-black/30 px-2 py-2 font-mono text-[10px] text-cyan-200/90">
              {url}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className="min-h-10 flex-1 rounded-lg border border-cyan-400/50 bg-cyan-950/40 text-sm font-bold text-cyan-100"
              >
                {copied ? "¡Copiado!" : "Copiar link"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Acepta tu distancia (${distanceLabel}): ${url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-950/40 text-sm font-bold text-emerald-100"
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
