import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Keep route URLs identical in Tauri dev and production builds.
  trailingSlash: true,
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
