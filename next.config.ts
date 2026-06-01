import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["firestick4uk.com", "srv497.hstgr.io"],
    formats: ["image/avif", "image/webp"],
  },
  compress: true,
};

export default nextConfig;
