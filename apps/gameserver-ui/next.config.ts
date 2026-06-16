import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ssh2 enthält native Crypto-Bindings die Turbopack/webpack nicht bundlen kann.
  // Als Server-Only-Package extern lassen — wird zur Laufzeit aus node_modules geladen.
  serverExternalPackages: ["ssh2"],
  experimental: {
    // Standard-Limit von 10 MB reicht für große Mod-ZIPs nicht — auf 500 MB erhöhen.
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
