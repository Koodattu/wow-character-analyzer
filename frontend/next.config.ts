import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone folder for Docker deployment
  // Reduces image size from ~1GB to ~100MB by including only traced dependencies
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "render.worldofwarcraft.com",
      },
    ],
  },
};

export default nextConfig;
