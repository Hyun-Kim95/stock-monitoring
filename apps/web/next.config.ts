import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@stock-monitoring/shared"],
};

export default nextConfig;
