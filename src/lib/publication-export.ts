export async function downloadPublicationImages({ nodes, all, filename, caption, progress }: {
  nodes: Array<{ node: HTMLElement; name: string }>; all: boolean; filename: string; caption: string; progress: (text: string) => void;
}) {
  if (!nodes.length) throw new Error("Elegí una placa para exportar.");
  await document.fonts.ready;
  const { toBlob, getFontEmbedCSS } = await import("html-to-image");
  const images: Array<{ name: string; blob: Blob }> = [];
  let fontEmbedCSS: string | undefined;
  for (const [index, { node, name }] of nodes.entries()) {
    progress(`Generando ${index + 1}/${nodes.length}...`);
    await Promise.all(Array.from(node.querySelectorAll("img")).map(async image => { await image.decode(); if (!image.naturalWidth) throw new Error("No pudimos cargar una imagen de la placa."); }));
    if (Array.from(node.querySelectorAll<HTMLElement>("h2, [data-publication-text], .publicationCopy p, .publicationCtaCopy p, .publicationEyebrow, .publicationStore, .publicationMarkers, .publicationPrice, .publicationPrice strong, .studioPoster p, .studioBarValue strong, .studioVersusNames strong, .studioWinners strong, .studioWinners, .studioGiveawayCard")).some(element => element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2)) throw new Error("Un texto no entra en la placa. Acortalo antes de exportar.");
    if (node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2) throw new Error("El contenido excede el formato de la placa.");
    fontEmbedCSS ??= await getFontEmbedCSS(node);
    const blob = await toBlob(node, { width: node.offsetWidth, height: node.offsetHeight, pixelRatio: 1, includeQueryParams: true, fontEmbedCSS, backgroundColor: "#111111", style: { transform: "none", margin: "0" } });
    if (!blob) throw new Error("No pudimos generar la imagen.");
    images.push({ name, blob });
  }
  let blob = images[0].blob;
  let name = images[0].name;
  if (all) {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip(); images.forEach(image => zip.file(image.name, image.blob)); zip.file("texto-publicacion.txt", caption);
    blob = await zip.generateAsync({ type: "blob" }); name = `${filename}.zip`;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
