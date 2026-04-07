import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set Turbopack root to prevent Next.js from detecting wrong workspace
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
