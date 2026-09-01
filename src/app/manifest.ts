import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Playlist Spot",
    short_name: "Playlist Spot",
    description: "A transparent rolling seven-day headline-track board.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e2",
    theme_color: "#b42318",
    icons: [{ src: "/brand-mark.png", sizes: "512x512", type: "image/png" }],
  };
}
