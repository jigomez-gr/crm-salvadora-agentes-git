import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle (.next/standalone) so the Docker
  // runtime image stays small and starts fast. See frontend/Dockerfile.
  output: "standalone",
};

export default nextConfig;
