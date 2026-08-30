import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // baileys e pino usam APIs de node que nao devem ser empacotadas pelo bundler
  serverExternalPackages: ["@whiskeysockets/baileys", "pino", "pg"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
