"use client";

import {
  CSSProperties,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
};

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ");
}

function moveCaretToEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * StealthTextInput
 *
 * Campo visible basado en contentEditable, no en <input>.
 *
 * Objetivo:
 * - Evitar Safari/macOS Contacts Suggestions.
 * - Evitar autofill/autocomplete del navegador.
 * - Reducir predictive text, Grammarly y ayudas invasivas.
 * - Mantener el cursor estable mientras el usuario escribe.
 *
 * Si pasas "name", también genera un input hidden para formularios nativos.
 */
export default function StealthTextInput({
  name,
  value,
  onChange,
  placeholder,
  required = false,
  maxLength,
  style,
  className,
  ariaLabel,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // No sincronizar mientras el usuario escribe.
    // Esto evita que el cursor salte al inicio o a otra posición.
    if (isFocusedRef.current) return;

    if ((editor.textContent ?? "") !== value) {
      editor.textContent = value;
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;

    let next = cleanText(editor.textContent ?? "");

    if (typeof maxLength === "number" && maxLength > 0 && next.length > maxLength) {
      next = next.slice(0, maxLength);
      editor.textContent = next;
      moveCaretToEnd(editor);
    }

    onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();

      const form = editorRef.current?.closest("form");

      if (form) {
        const focusable = Array.from(
          form.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
          )
        ).filter((el) => !el.hasAttribute("disabled"));

        const index = focusable.indexOf(event.currentTarget);
        const next = index >= 0 ? focusable[index + 1] : null;

        next?.focus();
      }
    }
  };

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <div
        ref={editorRef}
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        className={className}
        aria-label={ariaLabel ?? placeholder ?? name ?? "Campo de texto"}
        aria-required={required}
        data-placeholder={placeholder ?? ""}
        data-empty={value.trim() ? "false" : "true"}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        {...({ inputMode: "none" } as any)}
        onInput={emitChange}
        onBeforeInput={(event) => {
          // Evita saltos raros cuando Safari intenta insertar predicción inline.
          if ((event.nativeEvent as InputEvent).inputType === "insertReplacementText") {
            event.preventDefault();
          }
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          setFocused(false);
          emitChange();
        }}
        onFocus={() => {
          isFocusedRef.current = true;
          setFocused(true);

          const editor = editorRef.current;
          if (editor && (editor.textContent ?? "") !== value) {
            editor.textContent = value;
            moveCaretToEnd(editor);
          }
        }}
        onPaste={(event) => {
          event.preventDefault();

          const text = cleanText(event.clipboardData.getData("text/plain"));
          document.execCommand("insertText", false, text);
          emitChange();
        }}
        onKeyDown={handleKeyDown}
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          outline: focused ? "2px solid rgba(37,99,235,0.35)" : "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          userSelect: "text",
          WebkitUserSelect: "text",
          WebkitUserModify: "read-write-plaintext-only" as any,
          WebkitTextSecurity: "none" as any,
          caretColor: "#111827",
          cursor: "text",
        }}
      />

      <style jsx>{`
        div[contenteditable="true"][data-empty="true"]::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </>
  );
}
