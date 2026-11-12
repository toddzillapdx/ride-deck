/**
 * Draws the app icons and the brand SVGs from src/lib/brand.ts. Run after changing the logo:
 *   npx tsx scripts/brand-assets.ts
 * Needs Playwright (any version) to turn the SVG into PNG files: `npm i -D playwright` if it is not installed globally.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MARK_PROFILE, RIDE_PROFILE, barsSvg, iconSvg } from "../src/lib/brand";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");

async function main() {
  mkdirSync("brand", { recursive: true });
  writeFileSync("brand/ridedeck-icon.svg", iconSvg(0.62));
  writeFileSync("brand/ridedeck-mark.svg", barsSvg({ profile: MARK_PROFILE, W: 300, H: 300, rows: 9, gapX: 14, glow: false }));
  writeFileSync("brand/ridedeck-hero-bars.svg", barsSvg({ profile: RIDE_PROFILE }));

  const jobs: [string, number, number][] = [
    ["public/icons/icon-512.png", 512, 0.62], ["public/icons/icon-192.png", 192, 0.62], ["public/icons/apple-touch-icon.png", 180, 0.62],
    ["public/icons/icon-maskable-512.png", 512, 0.5], // maskable: the mark stays inside the safe zone
    ["public/icons/favicon-32.png", 32, 0.8],
  ];
  const b = await chromium.launch();
  for (const [file, px, inset] of jobs) {
    const p = await b.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0">${iconSvg(inset).replace(/width="512" height="512"/, `width="${px}" height="${px}"`)}</body>`);
    await p.screenshot({ path: file });
    await p.close();
    console.log("wrote", file);
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
