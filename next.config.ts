import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:;" },
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
];

const nextConfig: NextConfig = {
  generateEtags: false,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "firestick4uk.com" },
      { protocol: "https", hostname: "srv497.hstgr.io" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
