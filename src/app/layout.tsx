import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comparador de precios de juegos en Argentina",
  description: "MVP auditable para comparar precios digitales entre tiendas."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
