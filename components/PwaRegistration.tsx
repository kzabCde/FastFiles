"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Check for a newer worker without forcing a controller takeover or page reload.
      // FastFiles keeps selected File objects and editor state in memory, so an
      // automatic reload could discard active work.
      void registration.update();
    }).catch(() => {
      // The application remains fully usable when service workers are unavailable.
    });
  }, []);

  return null;
}
