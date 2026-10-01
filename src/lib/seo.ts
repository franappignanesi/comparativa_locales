import type { Metadata } from "next";

export const SITE_URL = "https://www.shuxteam.com";
export const STORE_NAMES = { steam: "Steam", epic: "Epic Games", gog: "GOG", humble: "Humble", microsoft: "Microsoft Store" };

export function pageMetadata(title: string, description: string, path: string, image = "/opengraph-image"): Metadata {
  const url = `${SITE_URL}${path}`;
  return { title, description, alternates: { canonical: url },
    openGraph: { type: "website", locale: "es_AR", siteName: "BARATEAM", title, description, url, images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#shux`, name: "Shux", url: SITE_URL,
      sameAs: ["https://www.youtube.com/@ShuxTeam", "https://www.instagram.com/shuxteam/", "https://steamcommunity.com/groups/ShuxTeam"] },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "BARATEAM", alternateName: "Barateam de Shux", url: SITE_URL,
      inLanguage: "es-AR", publisher: { "@id": `${SITE_URL}/#shux` } }
  ]
};
