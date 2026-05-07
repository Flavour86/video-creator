import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async rewrites() {
    return [
      {
        source: "/api/server/:path*",
        destination: "http://127.0.0.1:8787/:path*",
      },
    ];
  },
};

export default config;
