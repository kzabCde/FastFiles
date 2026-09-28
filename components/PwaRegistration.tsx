"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let cancelled = false;
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!cancelled) void registration.update();
    }).catch(() => {
      // FastFiles remains fully usable when service workers are unavailable.
    });
    return () => { cancelled = true; };
  }, []);
  return null;
}
