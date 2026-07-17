import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ControlX",
    short_name: "ControlX",
    description:
      "Centro de comando para eventos operativos críticos y cutovers.",
    start_url: "/",
    display: "standalone",
    background_color: "#11131a",
    theme_color: "#11131a",
    orientation: "any",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
