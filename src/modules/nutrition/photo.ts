/**
 * Foto-Aufbereitung: Bilder werden vor dem Speichern/Senden clientseitig
 * verkleinert (max. 1024 px, JPEG) — spart IndexedDB-Platz und API-Tokens.
 */

export async function compressPhoto(
  file: Blob,
  maxDim = 1024,
  quality = 0.82
): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(
      "Das Bild konnte nicht gelesen werden — bitte ein JPEG oder PNG verwenden."
    );
  });

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Das Bild konnte nicht verarbeitet werden.")),
      "image/jpeg",
      quality
    )
  );
}

/** Blob -> Base64 (ohne data:-Präfix), wie die API es erwartet. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Bild konnte nicht kodiert werden."));
    reader.readAsDataURL(blob);
  });
}
