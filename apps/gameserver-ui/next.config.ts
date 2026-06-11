import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ssh2 enthält native Crypto-Bindings die Turbopack/webpack nicht bundlen kann.
  // Als Server-Only-Package extern lassen — wird zur Laufzeit aus node_modules geladen.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
