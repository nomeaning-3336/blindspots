import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Allow local loopback host variants in dev (localhost vs 127.0.0.1).
  // Without this, Next.js may block HMR/dev assets as cross-origin.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
