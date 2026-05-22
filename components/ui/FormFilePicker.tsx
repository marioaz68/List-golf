"use client";

import { useRef, useState } from "react";

type Props = {
  name: string;
  label: string;
  hint?: string;
  /** Si vacío o "*", se omite accept para que Finder muestre todos los archivos. */
  accept?: string;
  className?: string;
  buttonClassName?: string;
};

/**
 * Sustituye el input file nativo visible (que en macOS Chrome a veces filtra
 * mal y sólo muestra .xlsx). Cada clic crea un input nuevo con accept explícito.
 */
export default function FormFilePicker({
  name,
  label,
  hint,
  accept = "*/*",
  className = "",
  buttonClassName = "",
}: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  function openPicker() {
    const picker = document.createElement("input");
    picker.type = "file";
    if (accept && accept !== "*/*" && accept !== "*") {
      picker.accept = accept;
    }
    picker.style.display = "none";
    document.body.appendChild(picker);

    picker.addEventListener(
      "change",
      () => {
        const file = picker.files?.[0] ?? null;
        document.body.removeChild(picker);

        if (!file) return;

        setFileName(file.name);

        const hidden = hiddenRef.current;
        if (hidden && typeof DataTransfer !== "undefined") {
          try {
            const dt = new DataTransfer();
            dt.items.add(file);
            hidden.files = dt.files;
          } catch {
            /* el form enviará vacío; el usuario verá error del server */
          }
        }
      },
      { once: true }
    );

    picker.click();
  }

  return (
    <div className={className}>
      <input
        ref={hiddenRef}
        type="file"
        name={name}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={() => {}}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPicker}
          className={
            buttonClassName ||
            "rounded border border-slate-500 bg-slate-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-500"
          }
        >
          {label}
        </button>
        <span className="max-w-[220px] truncate text-[11px] text-slate-400">
          {fileName || "Ningún archivo elegido"}
        </span>
      </div>
      {hint ? (
        <p className="mt-1 text-[10px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
