"use client";

import { useEffect } from "react";

/**
 * BrowserBehaviorFix
 *
 * Pégalo en:
 * components/ui/BrowserBehaviorFix.tsx
 *
 * Este componente se importa una sola vez en el layout del backoffice.
 *
 * Corrige:
 * - Evita que Safari/Chrome hagan "volver atrás" al arrastrar horizontalmente.
 * - Evita que la página completa se desplace horizontalmente.
 * - Reduce ayudas/autocomplete/autocorrect/spellcheck invasivos en inputs.
 *
 * IMPORTANTE:
 * - No cambia el atributo "name" de los inputs.
 * - Cambiar "name" puede romper formularios y server actions.
 */
export default function BrowserBehaviorFix() {
  useEffect(() => {
    const applyFieldCleanup = () => {
      const forms = document.querySelectorAll<HTMLFormElement>("form");

      forms.forEach((form) => {
        form.setAttribute("autocomplete", "off");
        form.setAttribute("autocapitalize", "off");
        form.setAttribute("spellcheck", "false");

        // Ayuda a engañar autofill agresivo de Safari/Chrome sin afectar datos reales.
        if (!form.querySelector('[data-browser-behavior-fix="true"]')) {
          const fakeUser = document.createElement("input");
          fakeUser.type = "text";
          fakeUser.name = "fake_username_for_browser_autofill";
          fakeUser.autocomplete = "username";
          fakeUser.tabIndex = -1;
          fakeUser.setAttribute("aria-hidden", "true");
          fakeUser.setAttribute("data-browser-behavior-fix", "true");
          fakeUser.style.position = "absolute";
          fakeUser.style.left = "-9999px";
          fakeUser.style.width = "1px";
          fakeUser.style.height = "1px";
          fakeUser.style.opacity = "0";

          const fakePass = document.createElement("input");
          fakePass.type = "password";
          fakePass.name = "fake_password_for_browser_autofill";
          fakePass.autocomplete = "new-password";
          fakePass.tabIndex = -1;
          fakePass.setAttribute("aria-hidden", "true");
          fakePass.setAttribute("data-browser-behavior-fix", "true");
          fakePass.style.position = "absolute";
          fakePass.style.left = "-9999px";
          fakePass.style.width = "1px";
          fakePass.style.height = "1px";
          fakePass.style.opacity = "0";

          form.prepend(fakePass);
          form.prepend(fakeUser);
        }
      });

      const fields = document.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select");

      fields.forEach((field) => {
        const inputType =
          field instanceof HTMLInputElement
            ? (field.getAttribute("type") || "text").toLowerCase()
            : "";

        const fieldName = (field.getAttribute("name") || "").toLowerCase();
        const fieldId = (field.getAttribute("id") || "").toLowerCase();

        const looksLikeLoginField =
          inputType === "password" ||
          inputType === "email" ||
          fieldName.includes("password") ||
          fieldName.includes("email") ||
          fieldName.includes("correo") ||
          fieldId.includes("password") ||
          fieldId.includes("email") ||
          fieldId.includes("correo");

        field.setAttribute("autocorrect", "off");
        field.setAttribute("autocapitalize", "off");
        field.setAttribute("spellcheck", "false");
        field.setAttribute("aria-autocomplete", "none");

        // Atributos que reducen extensiones/sugerencias invasivas.
        field.setAttribute("data-lpignore", "true");
        field.setAttribute("data-1p-ignore", "true");
        field.setAttribute("data-form-type", "other");
        field.setAttribute("data-gramm", "false");
        field.setAttribute("data-gramm_editor", "false");
        field.setAttribute("data-enable-grammarly", "false");

        // No apagamos login/recuperación para no afectar acceso de usuarios.
        if (!looksLikeLoginField) {
          field.setAttribute("autocomplete", "off");

          // Chrome/Safari a veces ignoran "off"; "new-password" reduce sugerencias guardadas.
          if (field instanceof HTMLInputElement) {
            const safeTypes = ["text", "search", "tel", "number", "url"];

            if (safeTypes.includes(inputType || "text")) {
              field.setAttribute("autocomplete", "new-password");
            }
          }

          if (field instanceof HTMLTextAreaElement) {
            field.setAttribute("autocomplete", "off");
          }
        }
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
        min-width: 0;
      }

      input,
      select,
      textarea {
        font-size: 16px;
      }

      input::-webkit-contacts-auto-fill-button,
      input::-webkit-credentials-auto-fill-button {
        visibility: hidden;
        display: none !important;
        pointer-events: none;
        position: absolute;
        right: 0;
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
        transition: background-color 999999s ease-in-out 0s;
      }

      [data-scroll-x],
      .scroll-x,
      .table-scroll,
      .horizontal-scroll,
      .overflow-x-auto {
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
      }
    `}</style>
  );
}
