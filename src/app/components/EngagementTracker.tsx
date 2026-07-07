"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const MIN_RECORDED_SECONDS = 3;

export function EngagementTracker() {
  const pathname = usePathname();

  useEffect(() => {
    let activeStartedAt = document.visibilityState === "visible" ? performance.now() : null;
    let activeMilliseconds = 0;
    let sent = false;

    const pause = () => {
      if (activeStartedAt == null) return;
      activeMilliseconds += performance.now() - activeStartedAt;
      activeStartedAt = null;
    };
    const resume = () => {
      if (activeStartedAt == null && !sent) activeStartedAt = performance.now();
    };
    const send = () => {
      if (sent) return;
      pause();
      const seconds = Math.round(activeMilliseconds / 1000);
      if (seconds < MIN_RECORDED_SECONDS) return;
      sent = true;
      const payload = JSON.stringify({ path: pathname, seconds });
      if (navigator.sendBeacon) {
        const queued = navigator.sendBeacon("/api/engagement", new Blob([payload], { type: "application/json" }));
        if (queued) return;
      }
      fetch("/api/engagement", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => undefined);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [pathname]);

  return null;
}
