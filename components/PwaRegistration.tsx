"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      void registration.update();
    }).catch(() => {
      // The application remains fully usable when service workers are unavailable.
    });
  }, []);
  return null;
}
