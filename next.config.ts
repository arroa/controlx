import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["exceljs"],
  /**
   * LAN / móvil en desarrollo. Hostname sin protocolo (Next compara Origin/Referer).
   * Incluye Wi‑Fi y la interfaz que Next imprime como "Network".
   */
  allowedDevOrigins: ["192.168.1.36", "192.168.56.1"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
