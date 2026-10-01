import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { EngagementTracker } from "@/app/components/EngagementTracker";
import "./globals.css";
import "./seo.css";
import { SITE_URL, pageMetadata, serializeJsonLd, siteStructuredData } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata("BARATEAM | Comparador de precios de juegos", "Compará precios y ofertas de juegos para PC entre tiendas oficiales con BARATEAM, una herramienta de Shux.", "/"),
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BARATEAM",
    template: "%s"
  },
  applicationName: "BARATEAM",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteStructuredData) }} />
        {children}
        <EngagementTracker />
        <Analytics />
      </body>
    </html>
  );
}
