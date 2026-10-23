import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

// Manifest de la PWA (se sirve en /manifest.webmanifest).
// Íconos generados con `node scripts/generate-icons.mjs`.
const BACKGROUND = "#fdfbf7"; // --background (igual que el theme-color claro del viewport)

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${brand.name} · ${brand.tagline}`,
    short_name: brand.name,
    description: brand.description,
    lang: "es-PY",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ["food", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Mis pedidos",
        short_name: "Pedidos",
        description: "Ver mis pedidos programados",
        url: "/cuenta/pedidos",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Restaurantes",
        short_name: "Restaurantes",
        description: "Elegí dónde pedir",
        url: "/restaurantes",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
