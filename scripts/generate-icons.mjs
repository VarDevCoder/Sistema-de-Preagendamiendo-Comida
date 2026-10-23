// Genera los íconos de la PWA y el favicon SIN red, a partir de un SVG propio
// (fondo primario cálido + cubiertos cruzados, el mismo símbolo del header).
//
// Uso: node scripts/generate-icons.mjs
// Salida (se commitea):
//   public/icons/icon-192.png, icon-512.png       → manifest, purpose "any"
//   public/icons/icon-maskable-512.png            → manifest, purpose "maskable" (zona segura 80%)
//   public/icons/badge-96.png                     → badge monocromo de las notificaciones push
//   src/app/apple-icon.png (180)                  → apple-touch-icon (iOS redondea solo)
//   src/app/icon.svg                              → favicon vectorial
//   src/app/favicon.ico (16, 32, 48)              → favicon clásico
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// oklch(0.62 0.18 42) de globals.css (--primary) convertido a sRGB.
const PRIMARY = "#db5612";
const FOREGROUND = "#fffbf4";

// Trazos de lucide "utensils-crossed" (ISC), en una grilla de 24×24.
const UTENSILS = [
  "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
  "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
  "m2.1 21.8 6.4-6.3",
  "m19 5-7 7",
];

/**
 * @param {object} o
 * @param {number} o.size      lado del ícono en px
 * @param {number} o.glyph     fracción del lado que ocupa el símbolo
 * @param {number} o.radius    radio de las esquinas como fracción del lado (0 = cuadrado completo)
 * @param {boolean} [o.background=true]
 * @param {number} [o.stroke=2] grosor del trazo en unidades de la grilla de 24
 * @param {string} [o.color]
 */
function svg({ size, glyph, radius, background = true, stroke = 2, color = FOREGROUND }) {
  const g = size * glyph;
  const offset = (size - g) / 2;
  const scale = g / 24;
  const rect = background
    ? `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${PRIMARY}"/>`
    : "";
  const paths = UTENSILS.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rect}<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

const png = (markup) => sharp(Buffer.from(markup)).png({ compressionLevel: 9 }).toBuffer();

/** ICO con imágenes PNG embebidas (formato soportado por todos los navegadores actuales). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo: ícono
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); // sin paleta
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); // planos
    dir.writeUInt16LE(32, o + 6); // bits por píxel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

async function out(rel, data) {
  const path = join(ROOT, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`✓ ${rel} (${data.length} bytes)`);
}

const anyIcon = (size) => svg({ size, glyph: 0.56, radius: 0.22 });

await out("public/icons/icon-192.png", await png(anyIcon(192)));
await out("public/icons/icon-512.png", await png(anyIcon(512)));
// Maskable: fondo a sangre y símbolo dentro del círculo seguro (40% del lado).
await out("public/icons/icon-maskable-512.png", await png(svg({ size: 512, glyph: 0.42, radius: 0 })));
// Badge: Android usa solo el canal alfa; símbolo blanco sobre transparente.
await out(
  "public/icons/badge-96.png",
  await png(svg({ size: 96, glyph: 0.8, radius: 0, background: false, stroke: 2.4, color: "#ffffff" })),
);
await out("src/app/apple-icon.png", await png(svg({ size: 180, glyph: 0.56, radius: 0 })));
await out("src/app/icon.svg", Buffer.from(svg({ size: 64, glyph: 0.62, radius: 0.22, stroke: 2.3 })));

const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  // En tamaños chicos el trazo más grueso y el símbolo más grande se leen mejor.
  const data = await png(svg({ size, glyph: size <= 16 ? 0.74 : 0.66, radius: 0.2, stroke: size <= 16 ? 2.8 : 2.4 }));
  icoImages.push({ size, data });
}
await out("src/app/favicon.ico", ico(icoImages));
