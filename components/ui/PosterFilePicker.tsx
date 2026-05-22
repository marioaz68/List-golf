"use client";

import { useRef, useState } from "react";
import { processPosterImage, setFileOnInput } from "@/lib/images/processPoster";

type Props = {
  name?: string;
  onReady?: (info: { fileName: string; sizeKb: number }) => void;
  onError?: (message: string) => void;
  onClear?: () => void;
};

/**
 * Selector de póster: abre Finder con todos los archivos visibles,
 * valida que sea imagen y deja el JPG optimizado en el input oculto del form.
 */
export default function PosterFilePicker({
  name = "poster",
  onReady,
  onError,
  onClear,
}: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    "idle" | "processing" | "ready" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  async function openPicker() {
    const picker = document.createElement("input");
    picker.type = "file";
    // Sin accept: Finder muestra TODOS los archivos sin filtro
    picker.style.display = "none";
    document.body.appendChild(picker);

    picker.addEventListener(
      "change",
      async () => {
        const file = picker.files?.[0] ?? null;
        document.body.removeChild(picker);

        if (!file) return;

        const looksLikeImage =
          file.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(file.name);

        if (!looksLikeImage) {
          const msg = `"${file.name}" no es una imagen. Elige JPG, PNG, WEBP o HEIC.`;
          setStatus("error");
          setMessage(msg);
          onError?.(msg);
          onClear?.();
          return;
        }

        setStatus("processing");
        setMessage(`Procesando ${file.name}…`);

        try {
          const processed = await processPosterImage(file);
          const ok = setFileOnInput(hiddenRef.current, processed);
          if (!ok) {
            const msg =
              "No se pudo asignar el archivo al formulario. Prueba otro navegador.";
            setStatus("error");
            setMessage(msg);
            onError?.(msg);
            return;
          }

          const url = URL.createObjectURL(processed);
          setPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          const kb = Math.round(processed.size / 1024);
          setStatus("ready");
          setMessage(`Listo: 1200×1600 JPG (${kb} KB).`);
          onReady?.({ fileName: processed.name, sizeKb: kb });
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "No se pudo procesar la imagen.";
          setStatus("error");
          setMessage(msg);
          onError?.(msg);
        }
      },
      { once: true }
    );

    picker.click();
  }

  return (
    <div>
      <input
        ref={hiddenRef}
        type="file"
        name={name}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        onClick={openPicker}
        style={{
          width: "100%",
          padding: "10px 14px",
          marginTop: 4,
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#f8fafc",
          color: "#0f172a",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        📷 Seleccionar imagen del póster…
      </button>
      <p style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
        Se abre Descargas con <strong>todos los archivos</strong> (JPG, PNG,
        etc.). Luego se ajusta sola a 1200×1600.
      </p>
      {status !== "idle" ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 12,
            color:
              status === "error"
                ? "#b91c1c"
                : status === "ready"
                  ? "#047857"
                  : "#374151",
          }}
        >
          {message}
        </p>
      ) : null}
      {preview ? (
        <img
          src={preview}
          alt="Vista previa del póster"
          style={{
            marginTop: 8,
            width: 120,
            height: 160,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid #d1d5db",
          }}
        />
      ) : null}
    </div>
  );
}
