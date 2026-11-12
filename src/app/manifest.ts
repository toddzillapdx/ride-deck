import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RideDeck",
    short_name: "RideDeck",
    description: "Ride coach for the Peloton Bike",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#002A33",
    theme_color: "#002A33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
