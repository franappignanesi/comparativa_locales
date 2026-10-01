import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { EngagementTracker } from "@/app/components/EngagementTracker";
import "./globals.css";
import "./seo.css";
import { SITE_URL, pageMetadata, serializeJsonLd, siteStructuredData } from "@/lib/seo";

const montserrat = localFont({
  src: "./fonts/montserrat-latin.woff2",
  variable: "--font-montserrat",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: "Arial"
});

export const metadata: Metadata = {
  ...pageMetadata("BARATEAM | Comparador de precios de juegos", "Compará precios y ofertas de juegos para PC entre tiendas oficiales con BARATEAM, una herramienta de Shux.", "/"),
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BARATEAM",
    template: "%s"
  },
  applicationName: "BARATEAM",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={montserrat.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteStructuredData) }} />
        {children}
        <EngagementTracker />
        <Analytics />
      </body>
    </html>
  );
}
