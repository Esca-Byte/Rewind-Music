import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Keep route URLs identical in Tauri dev and production builds.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
