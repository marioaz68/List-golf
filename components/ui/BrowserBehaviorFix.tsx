"use client";

import { useEffect } from "react";

/**
 * BrowserBehaviorFix
 *
 * Pégalo en: components/ui/BrowserBehaviorFix.tsx
 *
 * Luego impórtalo una sola vez en app/layout.tsx:
 *
 * import BrowserBehaviorFix from "@/components/ui/BrowserBehaviorFix";
 *
 * Y dentro del <body>, arriba del contenido:
 *
 * <BrowserBehaviorFix />
 *
 * Esto corrige:
 * - Que Safari/Chrome hagan "volver atrás" al arrastrar horizontalmente.
 * - Que la página completa se desplace horizontalmente.
 * - Ayudas/autocomplete/autocorrect/spellcheck invasivos en inputs.
 *
 * Las tablas o paneles anchos deben seguir usando:
 * <div className="w-full overflow-x-auto overscroll-x-contain">...</div>
 */
export default function BrowserBehaviorFix() {
  useEffect(() => {
    const applyFieldCleanup = () => {
      const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input, textarea, select"
      );

      fields.forEach((field) => {
        field.setAttribute("autocomplete", "off");
        field.setAttribute("autocorrect", "off");
        field.setAttribute("autocapitalize", "off");
        field.setAttribute("spellcheck", "false");

        // Evita que navegadores intenten sugerir datos guardados en formularios administrativos.
        if (field instanceof HTMLInputElement) {
          const type = (field.getAttribute("type") || "").toLowerCase();

          // No tocamos password/email porque login y recuperación pueden necesitar comportamiento normal.
          if (!["password", "email"].includes(type)) {
            field.setAttribute("name", field.getAttribute("name") || `field_${Math.random().toString(36).slice(2)}`);
          }
        }
      });

      const forms = document.querySelectorAll<HTMLFormElement>("form");
      forms.forEach((form) => {
        form.setAttribute("autocomplete", "off");
      });
    };

    applyFieldCleanup();

    const observer = new MutationObserver(() => {
      applyFieldCleanup();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return (
    <style jsx global>{`
      html,
      body {
        max-width: 100%;
        overflow-x: hidden;
        overscroll-behavior-x: none;
      }

      body {
        touch-action: pan-y;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      input,
      select,
      textarea {
        font-size: 16px;
      }

      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      textarea:-webkit-autofill,
      textarea:-webkit-autofill:hover,
      textarea:-webkit-autofill:focus,
      select:-webkit-autofill,
      select:-webkit-autofill:hover,
      select:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0px 1000px white inset !important;
        box-shadow: 0 0 0px 1000px white inset !important;
        transition: background-color 9999s ease-in-out 0s;
      }

      [data-scroll-x],
      .scroll-x,
      .table-scroll,
      .overflow-x-auto {
        overscroll-behavior-x: contain;
      }
    `}</style>
  );
}
