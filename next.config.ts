import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  eslint: {
    // Don't fail build on pre-existing lint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't fail build on pre-existing type errors
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Allow loading modules from user's project
      config.externals = [...(config.externals || [])];
    }
    return config;
  },
};

export default nextConfig;
