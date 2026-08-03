/** @type {import('next').NextConfig} */

// Hardening headers applied to every response (OWASP A05).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  // HSTS is ignored by browsers over plain HTTP (safe for local LAN dev),
  // and enforces HTTPS-only on the public domain.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Content-Security-Policy (OWASP A03/A05). Allowances cover Next.js inline
  // runtime, Mapbox, Stripe Checkout, Supabase and the allow-listed image CDNs.
  // 'unsafe-inline'/'unsafe-eval' are required by Next dev + Mapbox GL workers.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com https://i.pravatar.cc https://*.mapbox.com https://*.googleusercontent.com",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://api.mapbox.com",
      "worker-src 'self' blob:",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://api.stripe.com",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow LAN devices (e.g. iPhone) to load dev assets without warnings.
  allowedDevOrigins: ["192.168.1.192"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      // Google account profile pictures (OAuth sign-in).
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
