"use client";

import { useEffect } from "react";

/**
 * BrowserBehaviorFix
 *
 * Ruta:
 * components/ui/BrowserBehaviorFix.tsx
 *
 * Corrige:
 * - Evita que Safari/Chrome hagan "volver atrás" al arrastrar horizontalmente.
 * - Evita que la página completa se desplace horizontalmente.
 * - Reduce ayudas/autocomplete/autocorrect/spellcheck invasivos.
 * - Bloquea sugerencias de contactos/autofill de Safari en formularios administrativos.
 *
 * Importante:
 * - No cambia el atributo "name" de los inputs.
 * - Cambiar "name" puede romper formularios y server actions.
 */
export default function BrowserBehaviorFix() {
  useEffect(() => {
    const unlockField = (field: HTMLInputElement | HTMLTextAreaElement) => {
      field.readOnly = false;
      field.removeAttribute("readonly");
    };

    const applyFieldCleanup = () => {
      const forms = document.querySelectorAll<HTMLFormElement>("form");

      forms.forEach((form) => {
        form.setAttribute("autocomplete", "off");
        form.setAttribute("autocapitalize", "off");
        form.setAttribute("spellcheck", "false");

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
          fakeUser.style.top = "-9999px";
          fakeUser.style.width = "1px";
          fakeUser.style.height = "1px";
          fakeUser.style.opacity = "0";
          fakeUser.style.pointerEvents = "none";

          const fakePass = document.createElement("input");
          fakePass.type = "password";
          fakePass.name = "fake_password_for_browser_autofill";
          fakePass.autocomplete = "new-password";
          fakePass.tabIndex = -1;
          fakePass.setAttribute("aria-hidden", "true");
          fakePass.setAttribute("data-browser-behavior-fix", "true");
          fakePass.style.position = "absolute";
          fakePass.style.left = "-9999px";
          fakePass.style.top = "-9999px";
          fakePass.style.width = "1px";
          fakePass.style.height = "1px";
          fakePass.style.opacity = "0";
          fakePass.style.pointerEvents = "none";

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

        const isFakeField = field.getAttribute("data-browser-behavior-fix") === "true";

        const looksLikeLoginField =
          inputType === "password" ||
          inputType === "email" ||
          fieldName.includes("password") ||
          fieldName.includes("email") ||
          fieldName.includes("correo") ||
          fieldName.includes("login") ||
          fieldId.includes("password") ||
          fieldId.includes("email") ||
          fieldId.includes("correo") ||
          fieldId.includes("login");

        const isSafeAdministrativeField =
          !isFakeField &&
          !looksLikeLoginField &&
          (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement);

        field.setAttribute("autocorrect", "off");
        field.setAttribute("autocapitalize", "off");
        field.setAttribute("spellcheck", "false");
        field.setAttribute("aria-autocomplete", "none");

        field.setAttribute("data-lpignore", "true");
        field.setAttribute("data-1p-ignore", "true");
        field.setAttribute("data-form-type", "other");
        field.setAttribute("data-gramm", "false");
        field.setAttribute("data-gramm_editor", "false");
        field.setAttribute("data-enable-grammarly", "false");

        if (!looksLikeLoginField) {
          field.setAttribute("autocomplete", "new-password");

          if (field instanceof HTMLInputElement) {
            field.autocomplete = "new-password";
          }

          if (field instanceof HTMLTextAreaElement) {
            field.autocomplete = "off";
          }
        }

        /**
         * Safari/macOS Contacts Autofill:
         * Safari ignora autocomplete="off" y "new-password" en campos tipo nombre,
         * apellido, teléfono y correo. El truco más estable es marcar readonly
         * hasta que el usuario haga click/focus. Así Safari no abre el menú gris.
         */
        if (isSafeAdministrativeField && field instanceof HTMLInputElement) {
          const safeTypes = ["", "text", "search", "tel", "number", "url"];

          if (safeTypes.includes(inputType)) {
            if (document.activeElement !== field && !field.dataset.autofillLocked) {
              field.readOnly = true;
              field.setAttribute("readonly", "readonly");
              field.dataset.autofillLocked = "true";

              const unlock = () => {
                unlockField(field);
              };

              field.addEventListener("pointerdown", unlock, { once: true });
              field.addEventListener("mousedown", unlock, { once: true });
              field.addEventListener("touchstart", unlock, { once: true });
              field.addEventListener("focus", unlock, { once: true });
              field.addEventListener("keydown", unlock, { once: true });
            }
          }
        }

        if (isSafeAdministrativeField && field instanceof HTMLTextAreaElement) {
          if (document.activeElement !== field && !field.dataset.autofillLocked) {
            field.readOnly = true;
            field.setAttribute("readonly", "readonly");
            field.dataset.autofillLocked = "true";

            const unlock = () => {
              unlockField(field);
            };

            field.addEventListener("pointerdown", unlock, { once: true });
            field.addEventListener("mousedown", unlock, { once: true });
            field.addEventListener("touchstart", unlock, { once: true });
            field.addEventListener("focus", unlock, { once: true });
            field.addEventListener("keydown", unlock, { once: true });
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
