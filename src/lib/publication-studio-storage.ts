import type { StudioMode, StudioDraft } from "./publication-studio";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("barateam-publications", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("No pudimos abrir los borradores locales."));
    request.onblocked = () => reject(new Error("Cerrá otras pestañas del editor para guardar el borrador."));
  });
}
export async function readStudioDraft(mode: StudioMode): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(mode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("No pudimos leer el borrador."));
    });
  } finally { db.close(); }
}
export async function saveStudioDraft(draft: StudioDraft): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(draft, draft.mode);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error("No pudimos guardar el borrador. Revisá el espacio disponible del navegador."));
    });
  } finally { db.close(); }
}

export async function readPublicationUpload(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Elegí una imagen PNG, JPG o WebP de hasta 10 MB.");
  if (publicationUploadType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) !== file.type) throw new Error("El archivo no coincide con el formato de imagen indicado.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("La imagen es demasiado grande. Reducí su resolución.");
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos procesar la imagen.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.9);
    if (result.length > 5_000_000) throw new Error("La imagen procesada es demasiado pesada. Usá una versión más liviana.");
    return result;
  } finally { bitmap.close(); }
}

export function publicationUploadType(bytes: Uint8Array): string | null {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
