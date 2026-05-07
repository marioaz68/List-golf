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

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

/**
 * StealthTextInput
 *
 * Campo visible basado en contentEditable, no en <input>.
 * Esto evita que Safari/macOS lo detecte como campo de contactos
 * y abra ayudas/popup gris de nombres, apellidos, teléfonos, etc.
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
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.textContent !== value) {
      editor.textContent = value;
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;

    let next = normalizeText(editor.textContent ?? "");

    if (typeof maxLength === "number" && maxLength > 0) {
      next = next.slice(0, maxLength);

      if ((editor.textContent ?? "") !== next) {
        editor.textContent = next;

        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(editor);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
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
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onInput={emitChange}
        onBlur={() => {
          setFocused(false);
          emitChange();
        }}
        onFocus={() => setFocused(true)}
        onPaste={(event) => {
          event.preventDefault();

          const text = event.clipboardData.getData("text/plain");
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
