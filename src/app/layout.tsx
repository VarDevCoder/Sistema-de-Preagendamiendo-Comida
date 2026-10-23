import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteHeader } from "@/components/layout/site-header";
import { PwaClient } from "@/components/pwa/pwa-client";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  // iOS: pantalla completa al abrir desde el ícono de inicio (Fase 8, PWA).
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfbf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1915" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10">{children}</main>
        <PwaClient />
      </body>
    </html>
  );
}
