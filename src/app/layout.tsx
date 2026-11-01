import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted Montserrat (latin), so builds and the tablet never depend on Google Fonts.
const montserrat = localFont({
  src: [
    { path: "../fonts/montserrat-latin-200-normal.woff2", weight: "200", style: "normal" },
    { path: "../fonts/montserrat-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = { title: "RideDeck", description: "Ride coach for the Peloton Bike" };
// device-width, not a fixed 1280: Stage scales the 1280x800 canvas to whatever the window is.
// (A fixed width made portrait phones lay out ~2,800px tall and pushed the canvas off screen.)
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
