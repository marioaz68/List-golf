"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { processPosterImage } from "@/lib/images/processPoster";
import { uploadTournamentPosterFromList } from "./actions";

type PosterUploadInlineProps = {
  tournamentId: string;
  hasPoster: boolean;
};

export default function PosterUploadInline({
  tournamentId,
  hasPoster,
}: PosterUploadInlineProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState("");

  function openPicker() {
    if (isPending) return;

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "*/*";
    picker.style.display = "none";
    document.body.appendChild(picker);

    picker.addEventListener(
      "change",
      () => {
        const file = picker.files?.[0] ?? null;
        document.body.removeChild(picker);

        if (!file) return;

        const looksLikeImage =
          file.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(file.name);
        if (!looksLikeImage) {
          alert(
            `"${file.name}" no es una imagen. Elige JPG, PNG, WEBP o HEIC.`
          );
          return;
        }

        setFileName(file.name);

        startTransition(async () => {
          try {
            const processedFile = await processPosterImage(file);

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
          } catch {
            alert("Error procesando imagen");
          } finally {
            setFileName("");
          }
        });
      },
      { once: true }
    );

    picker.click();
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