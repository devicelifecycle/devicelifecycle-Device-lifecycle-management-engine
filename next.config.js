/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable webpack cache when disk space is limited (prevents cache corruption)
  webpack: (config, { dev }) => {
    if (dev) config.cache = false
    return config
  },
  images: {
    domains: ['localhost', 'jngokdqfqudyaykmsdjm.supabase.co', 'images.unsplash.com'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: *.supabase.co https://images.unsplash.com; font-src 'self' data:; connect-src 'self' *.supabase.co; frame-ancestors 'none'" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
