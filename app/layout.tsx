import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v02.css";
import PwaRegistration from "@/components/PwaRegistration";

export const metadata: Metadata = {
  title: "FastFiles — Drop. Edit. Done.",
  description: "Fast, private PDF and image tools that run directly in your browser.",
  applicationName: "FastFiles",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FastFiles", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0c100e" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}<PwaRegistration /></body>
    </html>
  );
}
