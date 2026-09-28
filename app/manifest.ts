import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FastFiles — Drop. Edit. Done.",
    short_name: "FastFiles",
    description: "Private PDF, image, watermark, and QR tools that run in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f6",
    theme_color: "#111412",
    orientation: "any",
    icons: [
      { src: "/icons/fastfiles-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/fastfiles-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
