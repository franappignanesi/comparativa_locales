"use client";

import { useState } from "react";

export function GameCover({ src, sizes, loading = "lazy" }: { src: string; sizes: string; loading?: "lazy" | "eager" }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const small = /^https:\/\/(?:shared\.akamai|cdn\.akamai|cdn\.cloudflare)\.steamstatic\.com\/.*\/header\.jpg(?:\?.*)?$/.test(src)
    ? src.replace(/\/header\.jpg/, "/header_292x136.jpg") : null;
  return <img src={src} alt="" loading={loading} decoding="async" sizes={small ? sizes : undefined}
    srcSet={small && failedSource !== src ? `${small} 292w, ${src} 460w` : undefined}
    onError={() => { if (small && failedSource !== src) setFailedSource(src); }} />;
}
