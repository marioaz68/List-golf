import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.dropbox.com",
      },
      {
        protocol: "https",
        hostname: "dl.dropboxusercontent.com",
      },
    ],
  },
};

export default nextConfig;