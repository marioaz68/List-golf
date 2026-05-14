import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "List.golf",
    short_name: "List.golf",
    description: "Torneos de golf — listgolf.club",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08111f",
    theme_color: "#08111f",
    icons: [
      {
        src: "/logo-main.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
