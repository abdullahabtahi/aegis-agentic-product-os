import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set Turbopack root to prevent Next.js from detecting wrong workspace
  turbopack: {
    root: __dirname,
  },
  // Standalone output for production Docker — copies only the minimal set of files
  output: "standalone",
};

export default nextConfig;
