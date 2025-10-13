import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Allow loading modules from user's project
      config.externals = [...(config.externals || [])];
    }
    return config;
  },
};

export default nextConfig;
