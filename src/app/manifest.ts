import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ControlX",
    short_name: "ControlX",
    description:
      "Ejecución y monitoreo de eventos operativos críticos y cutovers.",
    start_url: "/ejecuciones",
    scope: "/",
    display: "standalone",
    background_color: "#11131a",
    theme_color: "#11131a",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ejecuciones",
        short_name: "Ejecutar",
        description: "Ver ejecuciones de tus organizaciones",
        url: "/ejecuciones",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
