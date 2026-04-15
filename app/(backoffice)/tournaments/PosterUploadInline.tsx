"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTournamentPosterFromList } from "./actions";

type PosterUploadInlineProps = {
  tournamentId: string;
  hasPoster: boolean;
};

export default function PosterUploadInline({
  tournamentId,
  hasPoster,
}: PosterUploadInlineProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState("");

  function openPicker() {
    if (isPending) return;
    inputRef.current?.click();
  }

  function resetInput(inputEl: HTMLInputElement | null) {
    if (inputEl) inputEl.value = "";
    setFileName("");
  }

  // 🔥 PROCESADOR DE IMAGEN (CLAVE)
  async function processImage(file: File): Promise<File> {
    const img = document.createElement("img");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // leer archivo
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // cargar imagen
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = dataUrl;
    });

    const targetWidth = 1200;
    const targetHeight = 1600;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // 🔥 CROP INTELIGENTE
    const scale = Math.max(
      targetWidth / img.width,
      targetHeight / img.height
    );

    const newWidth = img.width * scale;
    const newHeight = img.height * scale;

    const dx = (targetWidth - newWidth) / 2;
    const dy = (targetHeight - newHeight) / 2;

    ctx.drawImage(img, dx, dy, newWidth, newHeight);

    // 🔥 COMPRESIÓN
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );

    return new File([blob], "poster.jpg", {
      type: "image/jpeg",
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0] ?? null;

    if (!file) {
      resetInput(inputEl);
      return;
    }

    setFileName(file.name);

    startTransition(async () => {
      try {
        // 🔥 PROCESAR IMAGEN
        const processedFile = await processImage(file);

        const formData = new FormData();
        formData.set("tournament_id", tournamentId);
        formData.set("poster", processedFile);

        const result = await uploadTournamentPosterFromList(formData);

        if (!result.ok) {
          alert(result.message || "No se pudo subir el póster.");
          return;
        }

        alert("Póster optimizado y subido correctamente 🚀");
        router.refresh();
      } catch (error) {
        alert("Error procesando imagen");
      } finally {
        resetInput(inputEl);
      }
    });
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onFileChange}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        style={{
          height: 28,
          padding: "0 10px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          background: "#fff",
          color: "#0f172a",
          fontSize: 11,
          fontWeight: 700,
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending
          ? "Procesando..."
          : hasPoster
          ? "Cambiar poster"
          : "Poster"}
      </button>

      <span
        style={{
          maxWidth: 150,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 11,
          color: fileName ? "#0f172a" : "#64748b",
        }}
      >
        {fileName || "Sin archivo"}
      </span>
    </div>
  );
}