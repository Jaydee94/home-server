import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ssh2 enthält native Crypto-Bindings die Turbopack/webpack nicht bundlen kann.
  // Als Server-Only-Package extern lassen — wird zur Laufzeit aus node_modules geladen.
  serverExternalPackages: ["ssh2"],
  experimental: {
    // Kein erhöhtes proxyClientMaxBodySize: Für von der Middleware erfasste Requests
    // puffert Next.js den Body bis zu diesem Limit im RAM (Standard 10 MB; Pod-Limit
    // 512Mi). Der Mod-Upload (/api/mod-upload) läuft deshalb an der Middleware vorbei
    // und wird gestreamt; alle anderen Bodies sind klein.
    // TypeScript 7 entfernt die Compiler API — CLI-Modus nutzen bis Next.js native Unterstützung liefert.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
