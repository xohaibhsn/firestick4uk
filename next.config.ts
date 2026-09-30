import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:;" },
];

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
];

const nextConfig: NextConfig = {
  generateEtags: false,
  experimental: {
    globalNotFound: true,
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  compress: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.firestick4uk.com",
          },
        ],
        destination: "https://firestick4uk.com/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Browsers auto-request /favicon.ico — serve dynamic DB favicon
      { source: "/favicon.ico", destination: "/api/favicon" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: noStoreHeaders,
      },
      // Favicon is public CMS media — override API no-store so browser/CDN can cache redirect.
      {
        source: "/api/favicon",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/sidhu",
        headers: noStoreHeaders,
      },
      {
        source: "/sidhu/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/cart",
        headers: noStoreHeaders,
      },
      {
        source: "/cart/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/downloads/:path*",
        headers: [
          { key: "Content-Disposition", value: "attachment" },
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
        ],
      },
    ];
  },
};

export default nextConfig;
