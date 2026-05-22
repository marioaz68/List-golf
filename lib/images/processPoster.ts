"use client";

export const POSTER_TARGET_WIDTH = 1200;
export const POSTER_TARGET_HEIGHT = 1600;
export const POSTER_JPEG_QUALITY = 0.82;

/**
 * Reescala y recorta una imagen al aspecto 3:4 (1200x1600 por defecto),
 * usando crop centrado tipo "cover", y comprime a JPEG.
 * Sirve para uniformizar el póster de cada torneo sin importar el formato
 * original (JPG, PNG, WEBP, GIF, AVIF, HEIC… cualquier cosa que el browser
 * pueda decodificar).
 */
export async function processPosterImage(
  file: File,
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    quality?: number;
    outputName?: string;
  }
): Promise<File> {
  const targetWidth = options?.targetWidth ?? POSTER_TARGET_WIDTH;
  const targetHeight = options?.targetHeight ?? POSTER_TARGET_HEIGHT;
  const quality = options?.quality ?? POSTER_JPEG_QUALITY;
  const outputName = options?.outputName ?? "poster.jpg";

  const img = document.createElement("img");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible en este navegador.");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error("Formato de imagen no soportado por el navegador."));
    img.src = dataUrl;
  });

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
  const newWidth = img.width * scale;
  const newHeight = img.height * scale;
  const dx = (targetWidth - newWidth) / 2;
  const dy = (targetHeight - newHeight) / 2;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, dx, dy, newWidth, newHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("No se pudo generar el blob del póster."));
          return;
        }
        resolve(result);
      },
      "image/jpeg",
      quality
    );
  });

  return new File([blob], outputName, { type: "image/jpeg" });
}

/**
 * Coloca el archivo procesado de vuelta en un `<input type="file">` para que
 * cuando el form se envíe (action o submit nativo) viaje ya optimizado.
 * Requiere navegador con soporte para DataTransfer (Chrome, Edge, Safari,
 * Firefox modernos).
 */
export function setFileOnInput(
  input: HTMLInputElement | null,
  file: File
): boolean {
  if (!input) return false;
  if (typeof DataTransfer === "undefined") return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    return true;
  } catch {
    return false;
  }
}
