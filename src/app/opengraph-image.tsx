import { ImageResponse } from "next/og";
export const alt = "BARATEAM: compará precios de juegos para PC entre tiendas oficiales";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#121212", color: "#fff", padding: 70, justifyContent: "center", borderBottom: "18px solid #f4d000" }}>
    <div style={{ fontSize: 90, fontWeight: 700, color: "#f4d000" }}>BARATEAM</div>
    <div style={{ fontSize: 46, marginTop: 26 }}>Precios y ofertas de juegos para PC</div>
    <div style={{ fontSize: 27, marginTop: 32, color: "#ddd" }}>Steam · Epic Games · GOG · Humble · Microsoft Store</div>
    <div style={{ fontSize: 26, marginTop: 48, color: "#aaa" }}>Una herramienta de Shux · shuxteam.com</div>
  </div>, size);
}
