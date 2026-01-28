/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@guiguan/shared'],
  async rewrites() {
    const rawBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
    const baseUrl = rawBaseUrl.replace(/\/$/, '');

    return [
      { source: '/auth/:path*', destination: `${baseUrl}/auth/:path*` },
      { source: '/me', destination: `${baseUrl}/me` },
      { source: '/admin/:path*', destination: `${baseUrl}/admin/:path*` },
    ];
  },
};

module.exports = nextConfig;
