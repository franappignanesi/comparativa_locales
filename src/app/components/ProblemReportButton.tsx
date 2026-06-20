"use client";

import { AlertTriangle, Check, Send, X } from "lucide-react";
import { useState } from "react";
import type { GoogleUser } from "./UserMenu";

const CATEGORIES = ["Precios mal cargados", "Funcion rota", "Bug visual", "Otro"] as const;

export function ProblemReportButton({ user }: { user: GoogleUser | null }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Precios mal cargados");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitReport() {
    if (!description.trim() || submitting) return;
    if (!user) {
      requestLogin();
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const screenshot = await captureViewport();
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        description,
        screenshot,
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        user: user ? { sub: user.sub, email: user.email, name: user.name } : null
      })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setErrorMessage(payload?.message ?? "No pudimos enviar el reporte. Intentalo de nuevo en unos minutos.");
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSubmitting(false);
    window.setTimeout(() => {
      setOpen(false);
      setSent(false);
      setDescription("");
      setCategory("Precios mal cargados");
      setErrorMessage(null);
    }, 1200);
  }

  function handleOpen() {
    if (!user) {
      requestLogin();
      return;
    }
    setErrorMessage(null);
    setLoginRequired(false);
    setOpen(true);
  }

  function requestLogin() {
    setLoginRequired(true);
    setOpen(true);
    window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"));
  }

  return (
    <div className="problemReport">
      <button className="problemReportButton" type="button" onClick={handleOpen}>
        <AlertTriangle size={15} />
        Reportar problema
      </button>
      {open ? (
        <div className={sent ? "problemReportPanel sent" : "problemReportPanel"} role="dialog" aria-label="Reportar problema">
          <div className="problemReportHeader">
            <strong>{sent ? "Gracias por avisar" : "Reportar problema"}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar reporte">
              <X size={16} />
            </button>
          </div>
          {sent ? (
            <div className="problemReportThanks">
              <Check size={24} />
              <p>Recibimos el reporte. Lo vamos a revisar.</p>
            </div>
          ) : loginRequired && !user ? (
            <div className="problemReportLogin">
              <AlertTriangle size={22} />
              <p>Para reportar problemas tenés que iniciar sesión. Así evitamos spam y podemos darte una devolución.</p>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("glitchprice-open-user-menu"))}>
                Iniciar sesion
              </button>
            </div>
          ) : (
            <>
              <p className="problemReportHint">
                Al enviarlo se adjunta automaticamente una captura de lo que estas viendo en pantalla cuando el navegador lo permite.
              </p>
              <label>
                Tipo de problema
                <select value={category} onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item === "Funcion rota" ? "Funcion rota" : item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descripcion
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Contanos que viste, en que juego o tienda paso y que esperabas encontrar."
                  rows={5}
                />
              </label>
              {errorMessage ? <p className="problemReportError">{errorMessage}</p> : null}
              <button className="problemReportSubmit" type="button" disabled={!description.trim() || submitting} onClick={submitReport}>
                <Send size={15} />
                {submitting ? "Enviando..." : "Enviar reporte"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function captureViewport(): Promise<string | null> {
  try {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, .problemReportPanel, .problemReportButton").forEach((node) => node.remove());
    await inlineImages(clone);

    const style = document.createElement("style");
    style.textContent = `${collectPageCss()}\n*{animation:none!important;transition:none!important;caret-color:transparent!important;}`;
    clone.querySelector("head")?.appendChild(style);

    const modalIsOpen = prepareModalCaptureClone(clone, width, height);
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.overflow = "hidden";

    const body = clone.querySelector("body");
    if (body) {
      body.style.width = modalIsOpen ? `${width}px` : `${document.documentElement.scrollWidth}px`;
      body.style.minHeight = modalIsOpen ? `${height}px` : `${document.documentElement.scrollHeight}px`;
      body.style.overflow = "hidden";
      if (!modalIsOpen) {
        body.style.transform = `translate(${-scrollX}px, ${-scrollY}px)`;
        body.style.transformOrigin = "top left";
      }
    }

    const markup = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo generar la captura"));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png", 0.72);
  } catch {
    return null;
  }
}

function prepareModalCaptureClone(clone: HTMLElement, width: number, height: number): boolean {
  const originalBackdrop = document.querySelector<HTMLElement>(".modalBackdrop");
  const originalModal = document.querySelector<HTMLElement>(".gameModal");
  const clonedBackdrop = clone.querySelector<HTMLElement>(".modalBackdrop");
  const clonedModal = clone.querySelector<HTMLElement>(".gameModal");
  const clonedBody = clone.querySelector("body");
  if (!originalBackdrop || !originalModal || !clonedBackdrop || !clonedModal || !clonedBody) return false;

  const modalRect = originalModal.getBoundingClientRect();
  clonedBody.replaceChildren(clonedBackdrop);
  clonedBody.style.margin = "0";
  clonedBody.style.width = `${width}px`;
  clonedBody.style.height = `${height}px`;
  clonedBody.style.overflow = "hidden";

  clonedBackdrop.style.position = "fixed";
  clonedBackdrop.style.inset = "0";
  clonedBackdrop.style.width = `${width}px`;
  clonedBackdrop.style.height = `${height}px`;
  clonedBackdrop.style.display = "block";
  clonedBackdrop.style.padding = "0";
  clonedBackdrop.style.background = "rgba(0, 0, 0, 0.72)";
  clonedBackdrop.style.backdropFilter = "blur(10px)";

  clonedModal.style.position = "absolute";
  clonedModal.style.left = `${Math.max(0, modalRect.left)}px`;
  clonedModal.style.top = `${Math.max(0, modalRect.top)}px`;
  clonedModal.style.width = `${modalRect.width}px`;
  clonedModal.style.height = `${modalRect.height}px`;
  clonedModal.style.maxHeight = `${modalRect.height}px`;
  clonedModal.style.overflow = "hidden";
  clonedModal.style.transform = "none";

  if (originalModal.scrollTop > 0) {
    const scrolledChildren = Array.from(clonedModal.children).filter((child) => !(child as HTMLElement).classList.contains("modalActions"));
    for (const child of scrolledChildren) {
      const element = child as HTMLElement;
      element.style.transform = `translateY(${-originalModal.scrollTop}px)`;
    }
  }
  return true;
}

async function inlineImages(clone: HTMLElement): Promise<void> {
  const originalImages = Array.from(document.images).filter((image) => !image.closest(".problemReportPanel, .problemReportButton"));
  const clonedImages = Array.from(clone.querySelectorAll("img"));
  await Promise.all(
    clonedImages.map(async (clonedImage, index) => {
      const originalImage = originalImages[index];
      const source = originalImage?.currentSrc || originalImage?.src || clonedImage.currentSrc || clonedImage.src;
      if (!source) return;
      const dataUrl = await imageToDataUrl(originalImage, source);
      if (!dataUrl) return;
      clonedImage.setAttribute("src", dataUrl);
      clonedImage.removeAttribute("srcset");
      clonedImage.removeAttribute("sizes");
      clonedImage.setAttribute("crossorigin", "anonymous");
      if (originalImage?.naturalWidth) clonedImage.setAttribute("width", String(originalImage.naturalWidth));
      if (originalImage?.naturalHeight) clonedImage.setAttribute("height", String(originalImage.naturalHeight));
    })
  );
}

async function imageToDataUrl(image: HTMLImageElement | undefined, source: string): Promise<string | null> {
  const normalizedSource = toAbsoluteUrl(source);
  if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const canvasData = drawImageToDataUrl(image);
    if (canvasData) return canvasData;
  }
  return fetchImageAsDataUrl(normalizedSource);
}

function drawImageToDataUrl(image: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png", 0.86);
  } catch {
    return null;
  }
}

async function fetchImageAsDataUrl(source: string): Promise<string | null> {
  try {
    const response = await fetch(source, { mode: "cors", cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function toAbsoluteUrl(source: string): string {
  try {
    return new URL(source, window.location.href).toString();
  } catch {
    return source;
  }
}

function collectPageCss(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}
