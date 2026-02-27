/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  async rewrites() {
    return [
      {
        // Proxy /api/* → FastAPI backend (server-side, no CORS)
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://api:8000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
