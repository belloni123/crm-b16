import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    if (process.env.DEPLOYMENT_ENV === "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  experimental: {
    staticGenerationMaxConcurrency: 1,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
