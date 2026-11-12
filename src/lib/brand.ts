/**
 * The RideDeck mark: an equalizer whose bars are a ride (warm-up, a hill in steps, tabata sprints of tall work and short rest,
 * cool-down). Pure geometry, so the same shapes draw the logo in the app and the icon files.
 */
export const BRAND = { ground: "#002A33", ice: "#C4DFE6", mist: "#66A5AD" } as const;

/** Deep teal at the bottom to ice at the top; only the hardest efforts peak in amber and coral. */
export const HEAT = ["#03434B", "#0A6B72", "#2E919A", "#66A5AD", "#C4DFE6", "#F4C27A", "#FF6B4A"];
/** The full hero: 19 bars. */
export const RIDE_PROFILE = [.16, .2, .25, .32, .42, .52, .62, .24, .9, .3, .86, .28, .95, .32, .88, .34, .26, .18, .13];
/** The small mark and app icon: 5 bars that still read at 40 px. */
export const MARK_PROFILE = [.35, .6, .95, .45, .8];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function gradient(stops: string[], t: number): string {
  const n = stops.length - 1, x = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(x), f = x - i;
  const a = rgb(stops[i]), b = rgb(stops[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(lerp(v, b[k], f))).join(",")})`;
}

export interface Rect { x: number; y: number; w: number; h: number; r: number; fill: string }
export interface BarsOptions { profile?: number[]; W?: number; H?: number; rows?: number; gapX?: number; caps?: boolean }
export interface BarsLayout { rects: Rect[]; caps: Rect[]; viewBox: string; width: number; height: number }

/** Segmented LED bars for a profile of levels (0 to 1). Each bar is a stack of rounded segments; a peak cap floats above it. */
export function barsLayout({ profile = RIDE_PROFILE, W = 1400, H = 520, rows = 22, gapX = 12, caps = true }: BarsOptions = {}): BarsLayout {
  const n = profile.length, bw = (W - gapX * (n - 1)) / n, sh = H / rows, sg = Math.max(2, sh * 0.2), segH = sh - sg;
  const rects: Rect[] = [], capRects: Rect[] = [];
  profile.forEach((lvl, i) => {
    const x = i * (bw + gapX), segs = Math.max(1, Math.round(lvl * rows));
    for (let k = 0; k < segs; k++) rects.push({ x, y: H - (k + 1) * sh + sg / 2, w: bw, h: segH, r: Math.min(4, segH / 3), fill: gradient(HEAT, k / (rows - 1)) });
    if (caps) {
      const capK = Math.min(rows - 1, segs + (i % 3 === 0 ? 1 : 2));
      capRects.push({ x, y: H - (capK + 1) * sh + sg / 2, w: bw, h: segH * 0.7, r: 3, fill: lvl > 0.8 ? "#FF8A5C" : "#EAF6F9" });
    }
  });
  return { rects, caps: capRects, viewBox: `-10 -40 ${W + 20} ${H + 50}`, width: W + 20, height: H + 50 };
}

/** The same bars as a standalone SVG string (used to make the icon files and the brand/ folder). */
export function barsSvg(opts: BarsOptions & { glow?: boolean; background?: string } = {}): string {
  const { glow = true, background, ...o } = opts;
  const L = barsLayout(o);
  const rect = (r: Rect) => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" rx="${r.r.toFixed(1)}" fill="${r.fill}"/>`;
  const capGroup = L.caps.map(rect).join("");
  const bg = background ? `<rect x="-10" y="-40" width="${L.width}" height="${L.height}" fill="${background}"/>` : "";
  const blur = glow && L.caps.length ? `<defs><filter id="b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs><g filter="url(#b)" opacity=".75">${capGroup}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${L.viewBox}" width="${L.width}" height="${L.height}">${bg}${blur}${L.rects.map(rect).join("")}${capGroup}</svg>`;
}

/** The app icon: the 5-bar mark on the ground color. `inset` is the share of the square the mark may use (smaller for maskable icons). */
export function iconSvg(inset = 0.6): string {
  const L = barsLayout({ profile: MARK_PROFILE, W: 300, H: 300, rows: 9, gapX: 14 });
  const size = 512, scale = (size * inset) / 300, off = (size - 300 * scale) / 2;
  const rect = (r: Rect) => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" rx="${r.r.toFixed(1)}" fill="${r.fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${BRAND.ground}"/><g transform="translate(${off.toFixed(1)} ${off.toFixed(1)}) scale(${scale.toFixed(4)})">${L.rects.map(rect).join("")}${L.caps.map(rect).join("")}</g></svg>`;
}
