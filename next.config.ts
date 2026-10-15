import type { NextConfig } from "next";

// GitHub Pages serves this site under /wedding-invitation,
// so every public-asset URL carries that prefix.
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/wedding-invitation",
  images: { unoptimized: true },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
